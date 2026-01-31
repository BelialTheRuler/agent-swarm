import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SWARM_DIR = path.join(os.homedir(), '.agent-swarm');
const DB_PATH = path.join(SWARM_DIR, 'swarm.db');

let db: Database.Database | null = null;

export function getSwarmDir(): string {
  return SWARM_DIR;
}

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(SWARM_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database): void {
  const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    database.exec(schema);
    return;
  }

  // Embedded fallback for npm distribution
  database.exec(`
CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY, session_name TEXT NOT NULL, project_path TEXT NOT NULL,
  goal TEXT NOT NULL, status TEXT DEFAULT 'active', coordination_model TEXT DEFAULT 'hub_spoke',
  context_summary TEXT, metadata TEXT, started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS agent_registry (
  id TEXT PRIMARY KEY, agent_name TEXT UNIQUE NOT NULL, agent_type TEXT NOT NULL,
  capabilities TEXT NOT NULL, status TEXT DEFAULT 'idle', current_session_id TEXT,
  last_heartbeat INTEGER, metadata TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY, checkpoint_name TEXT NOT NULL, session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL, state_data TEXT NOT NULL, context_snapshot TEXT,
  sequence_number INTEGER NOT NULL, parent_checkpoint_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL, session_id TEXT NOT NULL,
  agent_id TEXT, sequence_number INTEGER NOT NULL, event_data TEXT NOT NULL,
  metadata TEXT, created_at INTEGER NOT NULL, UNIQUE(session_id, sequence_number)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, task_type TEXT NOT NULL, session_id TEXT NOT NULL,
  agent_id TEXT, parent_task_id TEXT, priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', input_data TEXT NOT NULL, result_data TEXT,
  error_message TEXT, retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 3,
  dependencies TEXT DEFAULT '[]', created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS context_invalidations (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, invalidation_type TEXT NOT NULL,
  affected_scope TEXT NOT NULL, invalidated_at INTEGER NOT NULL, acknowledged_by TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_invalidations_session ON context_invalidations(session_id, invalidated_at DESC);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
