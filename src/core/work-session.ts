import { v4 as uuid } from 'uuid';
import { getDb } from './database';

export interface WorkSession {
  id: string;
  session_name: string;
  project_path: string;
  goal: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  coordination_model: string;
  context_summary: string | null;
  metadata: string | null;
  started_at: number;
  updated_at: number;
  completed_at: number | null;
}

export function createSession(goal: string, projectPath: string, name?: string): WorkSession {
  const db = getDb();
  const now = Date.now();
  const session: WorkSession = {
    id: uuid(),
    session_name: name || goal.slice(0, 60),
    project_path: projectPath,
    goal,
    status: 'active',
    coordination_model: 'hub_spoke',
    context_summary: null,
    metadata: null,
    started_at: now,
    updated_at: now,
    completed_at: null,
  };

  db.prepare(`
    INSERT INTO work_sessions (id, session_name, project_path, goal, status, coordination_model, context_summary, metadata, started_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session.id, session.session_name, session.project_path, session.goal, session.status, session.coordination_model, session.context_summary, session.metadata, session.started_at, session.updated_at, session.completed_at);

  return session;
}

export function getSession(id: string): WorkSession | undefined {
  return getDb().prepare('SELECT * FROM work_sessions WHERE id = ?').get(id) as WorkSession | undefined;
}

export function getActiveSession(): WorkSession | undefined {
  return getDb().prepare("SELECT * FROM work_sessions WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1").get() as WorkSession | undefined;
}

export function listSessions(status?: string): WorkSession[] {
  if (status) {
    return getDb().prepare('SELECT * FROM work_sessions WHERE status = ? ORDER BY updated_at DESC').all(status) as WorkSession[];
  }
  return getDb().prepare('SELECT * FROM work_sessions ORDER BY updated_at DESC').all() as WorkSession[];
}

export function updateSession(id: string, updates: Partial<Pick<WorkSession, 'status' | 'context_summary' | 'metadata'>>): void {
  const db = getDb();
  const sets: string[] = ['updated_at = ?'];
  const values: any[] = [Date.now()];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
    if (updates.status === 'completed' || updates.status === 'failed') {
      sets.push('completed_at = ?');
      values.push(Date.now());
    }
  }
  if (updates.context_summary !== undefined) {
    sets.push('context_summary = ?');
    values.push(updates.context_summary);
  }
  if (updates.metadata !== undefined) {
    sets.push('metadata = ?');
    values.push(updates.metadata);
  }

  values.push(id);
  db.prepare(`UPDATE work_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}
