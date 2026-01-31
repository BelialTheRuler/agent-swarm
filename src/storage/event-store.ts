import { v4 as uuid } from 'uuid';
import { getDb } from '../core/database';

export interface SwarmEvent {
  id: string;
  event_type: string;
  session_id: string;
  agent_id: string | null;
  sequence_number: number;
  event_data: string;
  metadata: string | null;
  created_at: number;
}

export function appendEvent(
  sessionId: string,
  eventType: string,
  data: object,
  agentId?: string,
  metadata?: object
): SwarmEvent {
  const db = getDb();

  const lastSeq = db.prepare(
    'SELECT MAX(sequence_number) as seq FROM events WHERE session_id = ?'
  ).get(sessionId) as { seq: number | null };

  const event: SwarmEvent = {
    id: uuid(),
    event_type: eventType,
    session_id: sessionId,
    agent_id: agentId ?? null,
    sequence_number: (lastSeq?.seq ?? 0) + 1,
    event_data: JSON.stringify(data),
    metadata: metadata ? JSON.stringify(metadata) : null,
    created_at: Date.now(),
  };

  db.prepare(`
    INSERT INTO events (id, event_type, session_id, agent_id, sequence_number, event_data, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, event.event_type, event.session_id, event.agent_id, event.sequence_number, event.event_data, event.metadata, event.created_at);

  return event;
}

export function getEvents(sessionId: string, options?: { limit?: number; eventType?: string; afterSeq?: number }): SwarmEvent[] {
  let query = 'SELECT * FROM events WHERE session_id = ?';
  const params: any[] = [sessionId];

  if (options?.eventType) {
    query += ' AND event_type = ?';
    params.push(options.eventType);
  }
  if (options?.afterSeq !== undefined) {
    query += ' AND sequence_number > ?';
    params.push(options.afterSeq);
  }

  query += ' ORDER BY sequence_number ASC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  return getDb().prepare(query).all(...params) as SwarmEvent[];
}

export function getEventCount(sessionId: string): number {
  const row = getDb().prepare('SELECT COUNT(*) as cnt FROM events WHERE session_id = ?').get(sessionId) as { cnt: number };
  return row.cnt;
}
