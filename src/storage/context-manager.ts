import { getEvents } from './event-store';
import { getCheckpoints } from './checkpoint-store';
import { getSession } from '../core/work-session';

export interface AgentContext {
  immediate: object[];
  working: string;
  project: string;
  historical: object[];
}

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export async function getAgentContext(sessionId: string, _agentId: string): Promise<AgentContext> {
  // Layer 1: Immediate — last 5 events
  const recentEvents = getEvents(sessionId, { limit: 5 });
  const immediate = recentEvents.map(e => ({
    type: e.event_type,
    data: JSON.parse(e.event_data),
    at: e.created_at,
  }));

  // Layer 2: Working — session summary
  const session = getSession(sessionId);
  const working = session?.context_summary || `Goal: ${session?.goal || 'unknown'}`;

  // Layer 3: Project — basic project info (enriched by Serena when available)
  const project = session?.metadata || JSON.stringify({ path: session?.project_path });

  // Layer 4: Historical — recent checkpoints
  const recentCheckpoints = getCheckpoints(sessionId, 3);
  const historical = recentCheckpoints.map(cp => ({
    name: cp.checkpoint_name,
    snapshot: cp.context_snapshot ? JSON.parse(cp.context_snapshot) : null,
    at: cp.created_at,
  }));

  return { immediate, working, project, historical };
}

export function trimContextToFit(context: AgentContext, maxTokens: number = 8000): AgentContext {
  let total = estimateTokens(JSON.stringify(context));

  if (total <= maxTokens) return context;

  // Trim historical first
  while (total > maxTokens && context.historical.length > 0) {
    context.historical.pop();
    total = estimateTokens(JSON.stringify(context));
  }

  // Truncate working context
  if (total > maxTokens) {
    const maxWorkingChars = Math.floor(maxTokens * 0.3 * 4);
    context.working = context.working.slice(0, maxWorkingChars) + '...';
    total = estimateTokens(JSON.stringify(context));
  }

  // Trim immediate events
  while (total > maxTokens && context.immediate.length > 1) {
    context.immediate.shift();
    total = estimateTokens(JSON.stringify(context));
  }

  return context;
}

export function contextToPrompt(context: AgentContext): string {
  const parts: string[] = [];

  parts.push('## Current Session');
  parts.push(context.working);

  if (context.immediate.length > 0) {
    parts.push('\n## Recent Activity');
    for (const e of context.immediate) {
      parts.push(`- ${JSON.stringify(e)}`);
    }
  }

  if (context.project) {
    parts.push('\n## Project Info');
    parts.push(context.project);
  }

  if (context.historical.length > 0) {
    parts.push('\n## Previous Checkpoints');
    for (const h of context.historical) {
      parts.push(`- ${JSON.stringify(h)}`);
    }
  }

  return parts.join('\n');
}
