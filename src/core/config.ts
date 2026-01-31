import * as fs from 'fs';
import * as path from 'path';
import { getSwarmDir } from './database';

export interface SwarmConfig {
  maxAgents: number;
  maxRetries: number;
  checkpointInterval: number;
  tokenBudget: number;
  claudeCliPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const DEFAULT_CONFIG: SwarmConfig = {
  maxAgents: 5,
  maxRetries: 3,
  checkpointInterval: 900,
  tokenBudget: 8000,
  claudeCliPath: 'claude',
  logLevel: 'info',
};

export function loadConfig(): SwarmConfig {
  const configPath = path.join(getSwarmDir(), 'config.json');

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  return DEFAULT_CONFIG;
}

export function saveConfig(config: Partial<SwarmConfig>): void {
  const configPath = path.join(getSwarmDir(), 'config.json');
  const current = loadConfig();
  const merged = { ...current, ...config };
  fs.mkdirSync(getSwarmDir(), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
}
