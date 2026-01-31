# Agent Swarm

A multi-agent orchestration CLI that spawns parallel [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions to work on your projects. Prevents context rot by distributing work across specialized agents with persistent state, checkpointing, and event sourcing.

## The Problem

When working on complex development tasks with AI:

- **Context rot** — long sessions exceed the LLM context window, degrading quality
- **Lost state** — crashes or interruptions lose all progress
- **Single-agent bottleneck** — one agent can't efficiently handle database + backend + frontend + tests + deployment
- **Manual coordination** — you end up copy-pasting context between sessions

## The Solution

Agent Swarm acts as a virtual development team. You describe a goal, and it:

1. **Decomposes** the goal into subtasks using Claude
2. **Routes** each subtask to a specialist agent
3. **Executes** agents in dependency order (parallel where possible)
4. **Checkpoints** after every step — survives crashes
5. **Tracks** everything via event sourcing for full audit trail

```
Your Goal ──> Orchestrator ──> Task Decomposition
                                      |
                 ┌────────┬───────┬───────┬────────┐
                 v        v       v       v        v
              Database  Backend  Frontend   QA    DevOps
              Agent     Agent    Agent    Agent   Agent
                 |        |       |       |        |
              [checkpoint after each step]
                 |        |       |       |        |
                 └────────┴───────┴───────┴────────┘
                                  |
                          Results + Audit Trail
```

## Specialist Agents

| Agent | Handles |
|-------|---------|
| **Database** | Schema design, migrations, SQL optimization, data modeling |
| **Backend** | API endpoints, services, business logic, middleware, validation |
| **Frontend** | UI components, state management, styling, accessibility |
| **QA** | Unit tests, integration tests, coverage, quality gates |
| **DevOps** | CI/CD pipelines, Docker, deployment, monitoring |

Each agent runs as an isolated Claude Code session with its own context, so no single session gets overloaded.

## Requirements

- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)

## Installation

```bash
git clone https://github.com/BelialTheRuler/agent-swarm.git
cd agent-swarm
npm install
npm run build
npm link
```

After `npm link`, the `swarm` command is available globally.

## Usage

### Start a session

Navigate to any project and run:

```bash
cd /path/to/your/project
swarm start "Implement user authentication with refresh tokens"
```

The orchestrator will analyze the project, decompose the goal, and dispatch agents.

### Check progress

```bash
swarm status
```

```
Active Session: a1b2c3d4-...
Goal: Implement user authentication with refresh tokens
Status: active
Project: /path/to/your/project

Tasks (5):
  [x] [database] Create refresh_tokens table
  [x] [backend]  Implement POST /auth/refresh endpoint
  [~] [frontend] Create login form component
  [ ] [qa]       Write auth integration tests
  [ ] [devops]   Update CI pipeline
```

### Resume after interruption

```bash
swarm resume a1b2  # prefix matching works
```

Picks up from the last checkpoint — no work is lost.

### Other commands

```bash
swarm list                    # List all sessions
swarm list --status completed # Filter by status
swarm show <session-id>       # Full event log and details
swarm checkpoint "milestone"  # Manual checkpoint save
```

## How It Works

### State Persistence

All state is stored in `~/.agent-swarm/swarm.db` (SQLite). This includes:

- **Work sessions** — goals, status, project paths
- **Tasks** — individual agent assignments with dependencies
- **Checkpoints** — state snapshots after each agent step
- **Events** — immutable audit trail of everything that happened
- **Context invalidations** — signals when files change

### Context Management

Each agent gets a hierarchical context to prevent rot:

```
Layer 1: Immediate   (~500 tokens)  — Last 5 events
Layer 2: Working     (~1000 tokens) — Session summary
Layer 3: Project     (~2000 tokens) — Project metadata
Layer 4: Historical  (~1000 tokens) — Recent checkpoints
```

Total stays under 8k tokens per agent regardless of session length.

### Retry Logic

Failed tasks automatically retry up to 3 times (configurable). If a dependency fails, downstream tasks are skipped.

## Configuration

Global config lives at `~/.agent-swarm/config.json`:

```json
{
  "maxAgents": 5,
  "maxRetries": 3,
  "checkpointInterval": 900,
  "tokenBudget": 8000,
  "claudeCliPath": "claude",
  "logLevel": "info"
}
```

## Project Structure

```
src/
├── cli/index.ts              # CLI entry point (commander.js)
├── core/
│   ├── database.ts           # SQLite initialization
│   ├── config.ts             # Global configuration
│   └── work-session.ts       # Session CRUD
├── coordinator/
│   ├── orchestrator.ts       # Hub & spoke coordination
│   ├── task-decomposer.ts    # Goal → subtasks via Claude
│   └── agent-router.ts       # Task → agent matching
├── agents/
│   ├── base-agent.ts         # Agent interface + Claude CLI execution
│   ├── registry.ts           # Agent registration + capability lookup
│   ├── database-agent.ts     # Database specialist
│   ├── backend-agent.ts      # Backend specialist
│   ├── frontend-agent.ts     # Frontend specialist
│   ├── qa-agent.ts           # QA specialist
│   └── devops-agent.ts       # DevOps specialist
├── storage/
│   ├── checkpoint-store.ts   # Save/load state snapshots
│   ├── event-store.ts        # Event sourcing
│   └── context-manager.ts    # Hierarchical context + token trimming
└── utils/
    ├── claude-cli.ts         # Claude Code CLI wrapper
    └── logger.ts             # Structured logging
```

## License

MIT
