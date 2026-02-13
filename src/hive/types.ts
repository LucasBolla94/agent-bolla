import type { TaskComplexity } from '../ai/types.js';

export interface HivePeer {
  name: string;
  role: string;
  baseUrl: string;
}

export interface HiveTaskRequest {
  task: string;
  requester?: string;
  complexity?: TaskComplexity;
}

export interface HiveTaskResponse {
  ok: boolean;
  agent: string;
  role: string;
  response: string;
  error?: string;
}

export interface HiveConfig {
  enabled: boolean;
  bindHost: string;
  port: number;
  agentName: string;
  agentRole: string;
  sharedToken: string;
  requestTimeoutMs: number;
  peers: HivePeer[];
}

export interface HiveStatus {
  enabled: boolean;
  agentName: string;
  role: string;
  listening: boolean;
  port: number;
  peers: HivePeer[];
}

export interface HiveTaskHandler {
  run(task: string, context?: { requester?: string; complexity?: TaskComplexity }): Promise<string>;
}
