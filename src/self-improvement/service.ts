import fs from 'node:fs/promises';
import path from 'node:path';
import { AiRouter } from '../ai/router.js';
import { env } from '../config/env.js';
import { TrainingDataCollector } from '../training/collector.js';
import { GitManager } from './git-manager.js';
import { SelfImprovementRepository } from './repository.js';
import { ShellRunner } from './shell.js';
import { AnalysisSummary, ApprovalAction, ImprovementProposal, ImprovementSuggestion } from './types.js';

export interface OwnerNotifier {
  name: string;
  notify(text: string): Promise<void>;
}

interface SelfImprovementDeps {
  router: AiRouter;
  collector: TrainingDataCollector;
  repository: SelfImprovementRepository;
  git: GitManager;
  shell: ShellRunner;
}

export class SelfImprovementService {
  private readonly notifiers: OwnerNotifier[] = [];

  constructor(private readonly deps: SelfImprovementDeps) {}

  registerNotifier(notifier: OwnerNotifier): void {
    this.notifiers.push(notifier);
  }

  isEnabled(): boolean {
    return env.SELF_IMPROVEMENT_ENABLED === 'true';
  }

  async analyzeAndPropose(): Promise<AnalysisSummary> {
    if (!this.isEnabled()) {
      throw new Error('Self-improvement is disabled (SELF_IMPROVEMENT_ENABLED=false).');
    }

    await this.deps.git.ensureCleanWorktree();

    const files = await this.deps.git.trackedTsFiles();
    const maxFiles = Number(env.SELF_IMPROVEMENT_MAX_FILES || '20');
    const selectedFiles = files.slice(0, maxFiles);

    const filePayload = await this.loadFiles(selectedFiles);
    const rawAnalysis = await this.runAnalysisPrompt(filePayload);
    const suggestions = this.parseSuggestions(rawAnalysis).slice(0, Number(env.SELF_IMPROVEMENT_MAX_SUGGESTIONS || '3'));

    const proposals: ImprovementProposal[] = [];

    for (const suggestion of suggestions) {
      const proposal = await this.buildProposal(suggestion);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    await this.deps.collector.saveCodeAnalysis(
      'self-improvement-cycle',
      rawAnalysis,
      {
        channel: 'internal',
        topic: 'self_improvement_analysis'
      }
    );

    return {
      suggestions,
      rawAnalysis,
      createdProposals: proposals
    };
  }

  async handleApproval(id: number, action: ApprovalAction): Promise<string> {
    const stored = await this.deps.repository.findById(id);
    if (!stored) {
      return `Melhoria #${id} não encontrada.`;
    }

    const branch = this.extractMetadata(stored.diff, 'branch');
    if (!branch) {
      return `Melhoria #${id} sem metadado de branch.`;
    }

    if (action === 'reject') {
      await this.rejectImprovement(id, branch, stored.description);
      return `Melhoria #${id} rejeitada e branch ${branch} removida.`;
    }

    await this.approveImprovement(id, branch, stored.description);
    return `Melhoria #${id} aprovada, merge aplicada e deploy acionado.`;
  }

  private async buildProposal(suggestion: ImprovementSuggestion): Promise<ImprovementProposal | null> {
    const baseBranch = await this.deps.git.currentBranch();
    const slug = this.slugify(`${suggestion.category}-${suggestion.file}`);
    const branch = `improvement/${slug}-${Date.now().toString().slice(-6)}`;

    try {
      await this.deps.git.createBranch(branch);

      const original = await fs.readFile(suggestion.file, 'utf-8');
      const updated = await this.generateUpdatedFile(suggestion, original);

      if (!updated || updated.trim() === original.trim()) {
        await this.deps.git.checkout(baseBranch);
        await this.deps.git.deleteBranch(branch);
        return null;
      }

      await fs.writeFile(suggestion.file, updated, 'utf-8');

      let buildPassed = false;
      try {
        await this.deps.shell.run('npm', ['run', 'build']);
        buildPassed = true;
      } catch (error) {
        await this.deps.collector.saveCodeAnalysis(
          suggestion.file,
          `Build failed for suggestion: ${suggestion.description}\n${error instanceof Error ? error.message : String(error)}`,
          { channel: 'internal', topic: 'self_improvement_build_failure' }
        );
      }

      const diff = await this.deps.git.diffForFile(suggestion.file);
      if (!diff.trim()) {
        await this.deps.git.checkout(baseBranch);
        await this.deps.git.deleteBranch(branch);
        return null;
      }

      await this.deps.git.commitAll(`improvement: ${suggestion.description.slice(0, 80)}`);
      await this.deps.git.checkout(baseBranch);

      const metadataHeader = [
        `# meta:branch=${branch}`,
        `# meta:category=${suggestion.category}`,
        `# meta:build_passed=${buildPassed ? 'true' : 'false'}`,
        ''
      ].join('\n');

      const stored = await this.deps.repository.create({
        file: suggestion.file,
        description: `${suggestion.description}\n\nRationale: ${suggestion.rationale}`,
        diff: `${metadataHeader}${diff}`,
        status: 'pending'
      });

      await this.notifyOwners(
        `🔧 Nova melhoria proposta (#${stored.id})\n` +
        `Arquivo: ${suggestion.file}\n` +
        `Categoria: ${suggestion.category}\n` +
        `Descrição: ${suggestion.description}\n` +
        `Build: ${buildPassed ? 'ok' : 'falhou'}\n` +
        `Aprove com /approval ${stored.id} no Telegram ou !approval approve ${stored.id} no WhatsApp.`
      );

      return {
        id: stored.id,
        file: suggestion.file,
        branch,
        description: suggestion.description,
        diff,
        buildPassed
      };
    } catch (error) {
      try {
        await this.deps.git.checkout(baseBranch);
      } catch {
        // ignore
      }

      try {
        await this.deps.git.deleteBranch(branch);
      } catch {
        // ignore
      }

      await this.deps.collector.saveCodeAnalysis(
        suggestion.file,
        `Proposal failed: ${error instanceof Error ? error.message : String(error)}`,
        { channel: 'internal', topic: 'self_improvement_proposal_failure' }
      );

      return null;
    }
  }

  private async approveImprovement(id: number, branch: string, description: string): Promise<void> {
    const mainBranch = await this.deps.git.currentBranch();

    await this.deps.git.checkout(mainBranch);
    await this.deps.git.mergeIntoCurrent(branch, `merge improvement #${id}: ${description.slice(0, 80)}`);
    await this.deps.shell.run('npm', ['run', 'build']);

    try {
      await this.deps.shell.run('pm2', ['restart', 'agent']);
    } catch (error) {
      await this.deps.collector.saveCodeAnalysis(
        'deploy',
        `PM2 restart failed for improvement #${id}: ${error instanceof Error ? error.message : String(error)}`,
        { channel: 'internal', topic: 'self_improvement_deploy_failure' }
      );
      throw error;
    }

    await this.deps.git.deleteBranch(branch);
    await this.deps.repository.setStatus(id, 'approved');

    await this.notifyOwners(`✅ Melhoria #${id} aprovada e deployada com sucesso.`);
  }

  private async rejectImprovement(id: number, branch: string, description: string): Promise<void> {
    const current = await this.deps.git.currentBranch();
    if (current === branch) {
      await this.deps.git.checkout('main');
    }

    await this.deps.git.deleteBranch(branch);
    await this.deps.repository.setStatus(id, 'rejected');

    await this.deps.collector.saveCodeAnalysis(
      `improvement-${id}`,
      `Rejected improvement: ${description}`,
      {
        channel: 'internal',
        topic: 'self_improvement_rejection'
      }
    );

    await this.notifyOwners(`❌ Melhoria #${id} rejeitada e removida.`);
  }

  private async runAnalysisPrompt(filePayload: string): Promise<string> {
    const prompt = [
      'Analise os arquivos TypeScript e proponha melhorias práticas.',
      'Foque em bugs, performance, legibilidade e pequenas features seguras.',
      'Responda SOMENTE em JSON array com até 5 itens no formato:',
      '[{"file":"src/x.ts","category":"bug_fix|refactor|feature|optimization","description":"...","rationale":"..."}]',
      '',
      'Arquivos:',
      filePayload
    ].join('\n');

    const result = await this.deps.router.route({
      prompt,
      complexity: 'complex'
    });

    return result.text;
  }

  private async generateUpdatedFile(suggestion: ImprovementSuggestion, original: string): Promise<string> {
    const prompt = [
      'Aplique a melhoria solicitada no arquivo e retorne SOMENTE o conteúdo final completo do arquivo.',
      `Arquivo: ${suggestion.file}`,
      `Categoria: ${suggestion.category}`,
      `Descrição: ${suggestion.description}`,
      `Justificativa: ${suggestion.rationale}`,
      'Mantenha compatibilidade com TypeScript estrito.',
      '',
      'Conteúdo atual do arquivo:',
      '```ts',
      original,
      '```'
    ].join('\n');

    const result = await this.deps.router.route({
      prompt,
      complexity: 'complex'
    });

    return this.stripCodeFence(result.text);
  }

  private parseSuggestions(raw: string): ImprovementSuggestion[] {
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];

      const parsed = JSON.parse(match[0]) as ImprovementSuggestion[];
      const validCategories = new Set(['bug_fix', 'refactor', 'feature', 'optimization']);

      return parsed
        .filter((item) => item && typeof item.file === 'string' && typeof item.description === 'string')
        .filter((item) => validCategories.has(item.category))
        .filter((item) => item.file.endsWith('.ts'));
    } catch {
      return [];
    }
  }

  private async loadFiles(files: string[]): Promise<string> {
    const chunks: string[] = [];

    for (const file of files) {
      const fullPath = path.resolve(file);
      const content = await fs.readFile(fullPath, 'utf-8');
      chunks.push(`FILE: ${file}\n\n${content.slice(0, 8000)}`);
    }

    return chunks.join('\n\n-----\n\n');
  }

  private async notifyOwners(message: string): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.notify(message);
      } catch (error) {
        console.warn(`[SelfImprovement] notifier ${notifier.name} failed:`, error);
      }
    }
  }

  private stripCodeFence(text: string): string {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:ts|typescript)?\n([\s\S]*?)\n```$/i);
    return match ? match[1] : trimmed;
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
  }

  private extractMetadata(text: string, key: string): string {
    const regex = new RegExp(`^#\\s*meta:${key}=([^\\n]+)$`, 'm');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }
}

export const createSelfImprovementService = (router: AiRouter, collector: TrainingDataCollector): SelfImprovementService => {
  const shell = new ShellRunner(process.cwd());
  const git = new GitManager(shell);
  const repository = new SelfImprovementRepository();

  return new SelfImprovementService({
    router,
    collector,
    repository,
    git,
    shell
  });
};
