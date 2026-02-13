import { ShellRunner } from './shell.js';

export class GitManager {
  constructor(private readonly shell: ShellRunner) {}

  async ensureCleanWorktree(): Promise<void> {
    const result = await this.shell.run('git', ['status', '--porcelain']);
    const lines = result.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
      .filter((line) => !line.endsWith('.env'));

    if (lines.length > 0) {
      throw new Error('Git worktree must be clean before self-improvement cycle.');
    }
  }

  async currentBranch(): Promise<string> {
    const result = await this.shell.run('git', ['branch', '--show-current']);
    return result.stdout.trim();
  }

  async createBranch(branch: string): Promise<void> {
    await this.shell.run('git', ['checkout', '-b', branch]);
  }

  async checkout(branch: string): Promise<void> {
    await this.shell.run('git', ['checkout', branch]);
  }

  async commitAll(message: string): Promise<void> {
    await this.shell.run('git', ['add', '-A']);
    await this.shell.run('git', ['commit', '-m', message]);
  }

  async mergeIntoCurrent(branch: string, message: string): Promise<void> {
    await this.shell.run('git', ['merge', '--no-ff', branch, '-m', message]);
  }

  async deleteBranch(branch: string): Promise<void> {
    await this.shell.run('git', ['branch', '-D', branch]);
  }

  async diffForFile(filePath: string): Promise<string> {
    const diff = await this.shell.run('git', ['diff', '--', filePath]);
    return diff.stdout;
  }

  async trackedTsFiles(): Promise<string[]> {
    const result = await this.shell.run('git', ['ls-files', '*.ts']);
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith('dist/'))
      .filter((line) => !line.startsWith('node_modules/'));
  }
}
