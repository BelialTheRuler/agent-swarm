import { SwarmAgent } from './base-agent';
import { DatabaseAgent } from './database-agent';
import { BackendAgent } from './backend-agent';
import { FrontendAgent } from './frontend-agent';
import { QAAgent } from './qa-agent';
import { DevOpsAgent } from './devops-agent';

const agents: Map<string, SwarmAgent> = new Map();

export function registerAgent(agent: SwarmAgent): void {
  agents.set(agent.id, agent);
}

export function getAgent(id: string): SwarmAgent | undefined {
  return agents.get(id);
}

export function getAgentByName(name: string): SwarmAgent | undefined {
  for (const agent of agents.values()) {
    if (agent.name.toLowerCase() === name.toLowerCase()) return agent;
  }
  return undefined;
}

export function matchAgentByCapability(requirements: string[]): SwarmAgent | undefined {
  let bestMatch: SwarmAgent | undefined;
  let bestScore = 0;

  for (const agent of agents.values()) {
    const score = requirements.filter(r =>
      agent.capabilities.some(c => c.toLowerCase().includes(r.toLowerCase()))
    ).length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = agent;
    }
  }

  return bestMatch;
}

export function matchAgentByType(agentType: string): SwarmAgent | undefined {
  const typeMap: Record<string, string> = {
    database: 'database-agent',
    backend: 'backend-agent',
    frontend: 'frontend-agent',
    qa: 'qa-agent',
    devops: 'devops-agent',
    db: 'database-agent',
    api: 'backend-agent',
    ui: 'frontend-agent',
    test: 'qa-agent',
    deploy: 'devops-agent',
  };

  const id = typeMap[agentType.toLowerCase()] || agentType;
  return agents.get(id);
}

export function listAgents(): SwarmAgent[] {
  return Array.from(agents.values());
}

export function initializeAgents(): void {
  registerAgent(new DatabaseAgent());
  registerAgent(new BackendAgent());
  registerAgent(new FrontendAgent());
  registerAgent(new QAAgent());
  registerAgent(new DevOpsAgent());
}
