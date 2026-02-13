import http from 'node:http';
import { URL } from 'node:url';
import { env } from '../config/env.js';
import { logger } from '../ops/logger.js';
import type { TaskComplexity } from '../ai/types.js';
import type { HiveConfig, HivePeer, HiveStatus, HiveTaskHandler, HiveTaskRequest, HiveTaskResponse } from './types.js';

const parsePeers = (raw: string): HivePeer[] => {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Array<{ name?: string; role?: string; baseUrl?: string }>;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => Boolean(item?.name) && Boolean(item?.baseUrl))
      .map((item) => ({
        name: String(item.name),
        role: String(item.role || 'generalist'),
        baseUrl: String(item.baseUrl).replace(/\/+$/, '')
      }));
  } catch {
    return [];
  }
};

const readJsonBody = async <T>(req: http.IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString('utf-8').trim();
  if (!body) return {} as T;
  return JSON.parse(body) as T;
};

const writeJson = (res: http.ServerResponse, status: number, payload: unknown): void => {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
};

export class HiveNetwork {
  private server?: http.Server;
  private listening = false;

  constructor(
    private readonly config: HiveConfig,
    private readonly handler: HiveTaskHandler
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('[Hive] disabled by configuration');
      return;
    }

    if (this.server) return;

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.config.port, this.config.bindHost, () => resolve());
    });

    this.listening = true;
    logger.info({ port: this.config.port, host: this.config.bindHost, peers: this.config.peers.length }, '[Hive] API online');
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });

    this.server = undefined;
    this.listening = false;
  }

  status(): HiveStatus {
    return {
      enabled: this.config.enabled,
      agentName: this.config.agentName,
      role: this.config.agentRole,
      listening: this.listening,
      port: this.config.port,
      peers: [...this.config.peers]
    };
  }

  async delegateToPeer(peerName: string, task: string, complexity?: TaskComplexity): Promise<HiveTaskResponse> {
    const peer = this.config.peers.find((item) => item.name.toLowerCase() === peerName.toLowerCase());
    if (!peer) {
      return {
        ok: false,
        agent: this.config.agentName,
        role: this.config.agentRole,
        response: '',
        error: `Peer "${peerName}" não encontrado.`
      };
    }

    return this.callPeer(peer, task, complexity);
  }

  async delegateToRole(role: string, task: string, complexity?: TaskComplexity): Promise<HiveTaskResponse> {
    const candidates = this.config.peers.filter((peer) => peer.role.toLowerCase() === role.toLowerCase());
    if (candidates.length === 0) {
      return {
        ok: false,
        agent: this.config.agentName,
        role: this.config.agentRole,
        response: '',
        error: `Nenhum peer com role "${role}".`
      };
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return this.callPeer(selected, task, complexity);
  }

  private async callPeer(peer: HivePeer, task: string, complexity?: TaskComplexity): Promise<HiveTaskResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(`${peer.baseUrl}/v1/hive/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.sharedToken ? { Authorization: `Bearer ${this.config.sharedToken}` } : {})
        },
        body: JSON.stringify({
          task,
          requester: this.config.agentName,
          complexity
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          ok: false,
          agent: peer.name,
          role: peer.role,
          response: '',
          error: `HTTP ${response.status}: ${text.slice(0, 200)}`
        };
      }

      const json = (await response.json()) as HiveTaskResponse;
      return json;
    } catch (error) {
      return {
        ok: false,
        agent: peer.name,
        role: peer.role,
        response: '',
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method || 'GET';
    const host = req.headers.host || `127.0.0.1:${this.config.port}`;
    const url = new URL(req.url || '/', `http://${host}`);

    if (method === 'GET' && url.pathname === '/health') {
      writeJson(res, 200, {
        ok: true,
        service: 'hive',
        agent: this.config.agentName,
        role: this.config.agentRole,
        peers: this.config.peers.length
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/v1/hive/peers') {
      if (!this.isAuthorized(req)) {
        writeJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }

      writeJson(res, 200, {
        ok: true,
        agent: this.config.agentName,
        role: this.config.agentRole,
        peers: this.config.peers
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/hive/task') {
      if (!this.isAuthorized(req)) {
        writeJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }

      try {
        const body = await readJsonBody<HiveTaskRequest>(req);
        const task = body.task?.trim();

        if (!task) {
          writeJson(res, 400, {
            ok: false,
            error: 'task is required'
          });
          return;
        }

        const output = await this.handler.run(task, {
          requester: body.requester,
          complexity: body.complexity
        });

        writeJson(res, 200, {
          ok: true,
          agent: this.config.agentName,
          role: this.config.agentRole,
          response: output
        } satisfies HiveTaskResponse);
      } catch (error) {
        logger.error({ error }, '[Hive] task endpoint failed');
        writeJson(res, 500, {
          ok: false,
          agent: this.config.agentName,
          role: this.config.agentRole,
          response: '',
          error: error instanceof Error ? error.message : String(error)
        } satisfies HiveTaskResponse);
      }
      return;
    }

    writeJson(res, 404, { ok: false, error: 'not found' });
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    if (!this.config.sharedToken) {
      return true;
    }

    const auth = req.headers.authorization || '';
    return auth === `Bearer ${this.config.sharedToken}`;
  }
}

export const createHiveNetwork = (handler: HiveTaskHandler): HiveNetwork => {
  const portRaw = Number(env.HIVE_PORT || '8787');
  const timeoutRaw = Number(env.HIVE_REQUEST_TIMEOUT_MS || '45000');

  const config: HiveConfig = {
    enabled: env.HIVE_ENABLED === 'true',
    bindHost: env.HIVE_BIND_HOST || '0.0.0.0',
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 8787,
    agentName: env.HIVE_AGENT_NAME || 'bolla',
    agentRole: env.HIVE_AGENT_ROLE || 'generalist',
    sharedToken: env.HIVE_SHARED_TOKEN || '',
    requestTimeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 45000,
    peers: parsePeers(env.HIVE_PEERS_JSON || '[]')
  };

  return new HiveNetwork(config, handler);
};
