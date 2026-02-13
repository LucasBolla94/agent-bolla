import { db } from '../connection.js';

export type CodeImprovementStatus = 'pending' | 'approved' | 'rejected';

interface CodeImprovementRow {
  id: number;
  file: string;
  description: string;
  diff: string;
  status: CodeImprovementStatus;
  created_at: Date;
}

export interface CodeImprovementRecord {
  id: number;
  file: string;
  description: string;
  diff: string;
  status: CodeImprovementStatus;
  createdAt: Date;
}

const toRecord = (row: CodeImprovementRow): CodeImprovementRecord => ({
  id: row.id,
  file: row.file,
  description: row.description,
  diff: row.diff,
  status: row.status,
  createdAt: row.created_at
});

export class CodeImprovementsRepository {
  async findById(id: number): Promise<CodeImprovementRecord | null> {
    const result = await db.query<CodeImprovementRow>(
      'SELECT * FROM code_improvements WHERE id = $1 LIMIT 1',
      [id]
    );

    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async setStatus(id: number, status: CodeImprovementStatus): Promise<boolean> {
    const result = await db.query(
      'UPDATE code_improvements SET status = $1 WHERE id = $2',
      [status, id]
    );

    return (result.rowCount ?? 0) > 0;
  }
}
