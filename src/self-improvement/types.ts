export type ImprovementCategory = 'bug_fix' | 'refactor' | 'feature' | 'optimization';

export interface ImprovementSuggestion {
  file: string;
  category: ImprovementCategory;
  description: string;
  rationale: string;
}

export interface ImprovementProposal {
  id: number;
  file: string;
  branch: string;
  description: string;
  diff: string;
  buildPassed: boolean;
}

export interface AnalysisSummary {
  suggestions: ImprovementSuggestion[];
  rawAnalysis: string;
  createdProposals: ImprovementProposal[];
}

export type ApprovalAction = 'approve' | 'reject';
