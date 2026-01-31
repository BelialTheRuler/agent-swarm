import { runClaudeJson } from '../utils/claude-cli';
import { logger } from '../utils/logger';

export interface DecomposedTask {
  agent: string; // 'database' | 'backend' | 'frontend' | 'qa' | 'devops'
  goal: string;
  priority: number;
  dependencies: number[]; // indexes of tasks this depends on
}

export async function decomposeGoal(goal: string, projectPath: string): Promise<DecomposedTask[]> {
  logger.info(`Decomposing goal: ${goal}`);

  const prompt = `You are a task decomposition engine for a multi-agent development system.

Given a development goal, break it into subtasks assigned to specialist agents.

Available agents:
- database: Schema design, migrations, SQL, data modeling
- backend: API endpoints, services, business logic, middleware
- frontend: UI components, state management, styling
- qa: Testing, validation, coverage
- devops: CI/CD, Docker, deployment, monitoring

Goal: "${goal}"

Analyze the project at this path and decompose the goal into ordered subtasks.
Each task should specify which agent handles it, what the goal is, its priority (1=highest), and which task indexes it depends on.

Respond with a JSON array:
[
  { "agent": "database", "goal": "Create users table with email and password_hash columns", "priority": 1, "dependencies": [] },
  { "agent": "backend", "goal": "Implement POST /api/auth/register endpoint", "priority": 2, "dependencies": [0] }
]

Rules:
- Order tasks by dependency (database first, then backend, then frontend, then qa, then devops)
- Not every agent needs a task — only include what's needed
- Keep task goals specific and actionable
- Dependencies reference task array indexes (0-based)`;

  try {
    const tasks = await runClaudeJson<DecomposedTask[]>(prompt, projectPath);

    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Claude returned empty or invalid task list');
    }

    logger.info(`Decomposed into ${tasks.length} tasks`);
    return tasks;
  } catch (err: any) {
    logger.error(`Task decomposition failed: ${err.message}`);
    // Fallback: single task for the orchestrator
    return [{ agent: 'backend', goal, priority: 1, dependencies: [] }];
  }
}
