import { loadConfig } from '../core/config';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

function getLevel(): number {
  try {
    const config = loadConfig();
    return LEVELS[config.logLevel] ?? 1;
  } catch {
    return 1;
  }
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const logger = {
  debug(msg: string, ...args: any[]) {
    if (getLevel() <= 0) console.debug(`[${timestamp()}] DEBUG: ${msg}`, ...args);
  },
  info(msg: string, ...args: any[]) {
    if (getLevel() <= 1) console.log(`[${timestamp()}] INFO: ${msg}`, ...args);
  },
  warn(msg: string, ...args: any[]) {
    if (getLevel() <= 2) console.warn(`[${timestamp()}] WARN: ${msg}`, ...args);
  },
  error(msg: string, ...args: any[]) {
    if (getLevel() <= 3) console.error(`[${timestamp()}] ERROR: ${msg}`, ...args);
  },
};
