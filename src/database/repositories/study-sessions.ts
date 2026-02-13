import { db } from '../connection.js';

interface StudySessionRow {
  id: number;
  topic: string;
  findings: string;
  source_urls: string[] | null;
  training_data_generated: number;
  created_at: Date;
}

export interface StudySessionRecord {
  id: number;
  topic: string;
  findings: string;
  sourceUrls: string[];
  trainingDataGenerated: number;
  createdAt: Date;
}

const toRecord = (row: StudySessionRow): StudySessionRecord => ({
  id: row.id,
  topic: row.topic,
  findings: row.findings,
  sourceUrls: row.source_urls ?? [],
  trainingDataGenerated: row.training_data_generated,
  createdAt: row.created_at
});

export class StudySessionsRepository {
  async create(input: {
    topic: string;
    findings: string;
    sourceUrls?: string[];
    trainingDataGenerated?: number;
  }): Promise<StudySessionRecord> {
    const result = await db.query<StudySessionRow>(
      `INSERT INTO study_sessions (topic, findings, source_urls, training_data_generated)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.topic,
        input.findings,
        input.sourceUrls ?? null,
        input.trainingDataGenerated ?? 0
      ]
    );

    return toRecord(result.rows[0]);
  }

  async latest(limit = 20): Promise<StudySessionRecord[]> {
    const result = await db.query<StudySessionRow>(
      'SELECT * FROM study_sessions ORDER BY created_at DESC LIMIT $1',
      [limit]
    );

    return result.rows.map(toRecord);
  }
}
