import { SwarmAgent } from '../agents/base-agent';
import { matchAgentByType, matchAgentByCapability, listAgents } from '../agents/registry';
import { logger } from '../utils/logger';

export function routeTaskToAgent(agentType: string, taskGoal: string): SwarmAgent | undefined {
  // First try direct type match
  let agent = matchAgentByType(agentType);
  if (agent) {
    logger.debug(`Routed "${taskGoal.slice(0, 40)}" to ${agent.name} (by type)`);
    return agent;
  }

  // Fall back to capability matching using keywords from the goal
  const keywords = taskGoal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  agent = matchAgentByCapability(keywords);
  if (agent) {
    logger.debug(`Routed "${taskGoal.slice(0, 40)}" to ${agent.name} (by capability)`);
    return agent;
  }

  // Last resort: return first available agent
  const all = listAgents();
  if (all.length > 0) {
    logger.warn(`No matching agent for "${taskGoal.slice(0, 40)}", using ${all[0].name}`);
    return all[0];
  }

  return undefined;
}
