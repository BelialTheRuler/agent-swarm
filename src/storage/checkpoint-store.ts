import { v4 as uuid } from 'uuid';
import { getDb } from '../core/database';

export interface Checkpoint {
  id: string;
  checkpoint_name: string;
  session_id: string;
  agent_id: string;
  state_data: string;
  context_snapshot: string | null;
  sequence_number: number;
  parent_checkpoint_id: string | null;
  created_at: number;
}

export function saveCheckpoint(
  sessionId: string,
  agentId: string,
  name: string,
  stateData: object,
  contextSnapshot?: object
): Checkpoint {
  const db = getDb();

  const lastSeq = db.prepare(
    'SELECT MAX(sequence_number) as seq FROM checkpoints WHERE session_id = ?'
  ).get(sessionId) as { seq: number | null };

  const parentCp = db.prepare(
    'SELECT id FROM checkpoints WHERE session_id = ? AND agent_id = ? ORDER BY sequence_number DESC LIMIT 1'
  ).get(sessionId, agentId) as { id: string } | undefined;

  const cp: Checkpoint = {
    id: uuid(),
    checkpoint_name: name,
    session_id: sessionId,
    agent_id: agentId,
    state_data: JSON.stringify(stateData),
    context_snapshot: contextSnapshot ? JSON.stringify(contextSnapshot) : null,
    sequence_number: (lastSeq?.seq ?? 0) + 1,
    parent_checkpoint_id: parentCp?.id ?? null,
    created_at: Date.now(),
  };

  db.prepare(`
    INSERT INTO checkpoints (id, checkpoint_name, session_id, agent_id, state_data, context_snapshot, sequence_number, parent_checkpoint_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cp.id, cp.checkpoint_name, cp.session_id, cp.agent_id, cp.state_data, cp.context_snapshot, cp.sequence_number, cp.parent_checkpoint_id, cp.created_at);

  return cp;
}

export function loadCheckpoint(checkpointId: string): Checkpoint | undefined {
  return getDb().prepare('SELECT * FROM checkpoints WHERE id = ?').get(checkpointId) as Checkpoint | undefined;
}

export function getLatestCheckpoint(sessionId: string, agentId?: string): Checkpoint | undefined {
  if (agentId) {
    return getDb().prepare(
      'SELECT * FROM checkpoints WHERE session_id = ? AND agent_id = ? ORDER BY sequence_number DESC LIMIT 1'
    ).get(sessionId, agentId) as Checkpoint | undefined;
  }
  return getDb().prepare(
    'SELECT * FROM checkpoints WHERE session_id = ? ORDER BY sequence_number DESC LIMIT 1'
  ).get(sessionId) as Checkpoint | undefined;
}

export function getCheckpoints(sessionId: string, limit = 10): Checkpoint[] {
  return getDb().prepare(
    'SELECT * FROM checkpoints WHERE session_id = ? ORDER BY sequence_number DESC LIMIT ?'
  ).all(sessionId, limit) as Checkpoint[];
}
