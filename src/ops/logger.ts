import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'agent-bolla' }
});

const stringifyArg = (arg: unknown): string => {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

const bindConsole = (
  method: 'log' | 'info' | 'warn' | 'error' | 'debug',
  logMethod: (msg: string) => void
): void => {
  console[method] = (...args: unknown[]): void => {
    const message = args.map(stringifyArg).join(' ');
    logMethod(message);
  };
};

let patched = false;

export const setupStructuredLogging = (): void => {
  if (patched) return;
  patched = true;

  bindConsole('log', (msg) => logger.info(msg));
  bindConsole('info', (msg) => logger.info(msg));
  bindConsole('warn', (msg) => logger.warn(msg));
  bindConsole('error', (msg) => logger.error(msg));
  bindConsole('debug', (msg) => logger.debug(msg));
};
