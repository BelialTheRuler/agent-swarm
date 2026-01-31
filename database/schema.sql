CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY,
  session_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'failed')),
  coordination_model TEXT DEFAULT 'hub_spoke',
  context_summary TEXT,
  metadata TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS agent_registry (
  id TEXT PRIMARY KEY,
  agent_name TEXT UNIQUE NOT NULL,
  agent_type TEXT NOT NULL CHECK(agent_type IN ('orchestrator', 'specialist', 'worker')),
  capabilities TEXT NOT NULL,
  status TEXT DEFAULT 'idle' CHECK(status IN ('idle', 'busy', 'offline')),
  current_session_id TEXT,
  last_heartbeat INTEGER,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  checkpoint_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  state_data TEXT NOT NULL,
  context_snapshot TEXT,
  sequence_number INTEGER NOT NULL,
  parent_checkpoint_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES work_sessions(id),
  FOREIGN KEY (agent_id) REFERENCES agent_registry(id),
  FOREIGN KEY (parent_checkpoint_id) REFERENCES checkpoints(id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  sequence_number INTEGER NOT NULL,
  event_data TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES work_sessions(id),
  FOREIGN KEY (agent_id) REFERENCES agent_registry(id),
  UNIQUE(session_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  parent_task_id TEXT,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  input_data TEXT NOT NULL,
  result_data TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  dependencies TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES work_sessions(id),
  FOREIGN KEY (agent_id) REFERENCES agent_registry(id),
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS context_invalidations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  invalidation_type TEXT NOT NULL,
  affected_scope TEXT NOT NULL,
  invalidated_at INTEGER NOT NULL,
  acknowledged_by TEXT DEFAULT '[]',
  FOREIGN KEY (session_id) REFERENCES work_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_invalidations_session ON context_invalidations(session_id, invalidated_at DESC);
