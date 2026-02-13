import { db } from '../database/connection.js';
import { CodeImprovementStatus } from '../database/repositories/code-improvements.js';

interface CodeImprovementRow {
  id: number;
  file: string;
  description: string;
  diff: string;
  status: CodeImprovementStatus;
  created_at: Date;
}

export interface StoredImprovement {
  id: number;
  file: string;
  description: string;
  diff: string;
  status: CodeImprovementStatus;
  createdAt: Date;
}

const toRecord = (row: CodeImprovementRow): StoredImprovement => ({
  id: row.id,
  file: row.file,
  description: row.description,
  diff: row.diff,
  status: row.status,
  createdAt: row.created_at
});

export class SelfImprovementRepository {
  async create(input: {
    file: string;
    description: string;
    diff: string;
    status?: CodeImprovementStatus;
  }): Promise<StoredImprovement> {
    const result = await db.query<CodeImprovementRow>(
      `INSERT INTO code_improvements (file, description, diff, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.file, input.description, input.diff, input.status ?? 'pending']
    );

    return toRecord(result.rows[0]);
  }

  async findById(id: number): Promise<StoredImprovement | null> {
    const result = await db.query<CodeImprovementRow>(
      'SELECT * FROM code_improvements WHERE id = $1 LIMIT 1',
      [id]
    );

    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async setStatus(id: number, status: CodeImprovementStatus): Promise<void> {
    await db.query('UPDATE code_improvements SET status = $1 WHERE id = $2', [status, id]);
  }
}
