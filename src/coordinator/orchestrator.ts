import { v4 as uuid } from 'uuid';
import { createSession, updateSession, getSession } from '../core/work-session';
import { decomposeGoal, DecomposedTask } from './task-decomposer';
import { routeTaskToAgent } from './agent-router';
import { initializeAgents } from '../agents/registry';
import { appendEvent } from '../storage/event-store';
import { saveCheckpoint } from '../storage/checkpoint-store';
import { getDb } from '../core/database';
import { logger } from '../utils/logger';
import { TaskInput } from '../agents/base-agent';

export interface OrchestratorResult {
  sessionId: string;
  success: boolean;
  tasksCompleted: number;
  tasksFailed: number;
  totalTasks: number;
  results: Array<{ agent: string; goal: string; success: boolean; output: string }>;
}

export async function orchestrate(goal: string, projectPath: string): Promise<OrchestratorResult> {
  initializeAgents();

  const session = createSession(goal, projectPath);
  logger.info(`Session created: ${session.id}`);

  appendEvent(session.id, 'session.started', { goal, projectPath });

  // Decompose goal into tasks
  logger.info('Decomposing goal into tasks...');
  const decomposed = await decomposeGoal(goal, projectPath);

  appendEvent(session.id, 'tasks.decomposed', {
    count: decomposed.length,
    tasks: decomposed.map(t => ({ agent: t.agent, goal: t.goal })),
  });

  // Persist tasks to DB
  const db = getDb();
  const taskIds: string[] = [];
  const now = Date.now();

  for (const task of decomposed) {
    const id = uuid();
    taskIds.push(id);

    db.prepare(`
      INSERT INTO tasks (id, task_type, session_id, priority, status, input_data, dependencies, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id,
      task.agent,
      session.id,
      task.priority,
      JSON.stringify({ goal: task.goal }),
      JSON.stringify(task.dependencies.map(i => taskIds[i]).filter(Boolean)),
      now
    );
  }

  // Execute tasks in dependency order
  const results: OrchestratorResult['results'] = [];
  const completedOutputs: Map<number, string> = new Map();

  for (let i = 0; i < decomposed.length; i++) {
    const task = decomposed[i];
    const taskId = taskIds[i];

    // Check dependencies
    for (const depIdx of task.dependencies) {
      if (!completedOutputs.has(depIdx)) {
        logger.warn(`Dependency ${depIdx} not completed for task ${i}, skipping`);
        results.push({ agent: task.agent, goal: task.goal, success: false, output: 'Dependency not met' });
        db.prepare("UPDATE tasks SET status = 'skipped' WHERE id = ?").run(taskId);
        continue;
      }
    }

    // Route to agent
    const agent = routeTaskToAgent(task.agent, task.goal);
    if (!agent) {
      logger.error(`No agent found for task: ${task.goal}`);
      results.push({ agent: task.agent, goal: task.goal, success: false, output: 'No agent available' });
      db.prepare("UPDATE tasks SET status = 'failed', error_message = 'No agent available' WHERE id = ?").run(taskId);
      continue;
    }

    // Execute
    db.prepare("UPDATE tasks SET status = 'running', agent_id = ?, started_at = ? WHERE id = ?").run(agent.id, Date.now(), taskId);

    const depOutputs = task.dependencies
      .map(idx => completedOutputs.get(idx))
      .filter(Boolean)
      .join('\n---\n');

    const taskInput: TaskInput = {
      id: taskId,
      task_type: task.agent,
      session_id: session.id,
      goal: task.goal,
      dependencies_output: depOutputs || undefined,
    };

    let retries = 0;
    const maxRetries = 3;
    let result = { success: false, output: '' };

    while (retries <= maxRetries) {
      result = await agent.execute(taskInput, projectPath);
      if (result.success) break;

      retries++;
      if (retries <= maxRetries) {
        logger.warn(`Task failed, retrying (${retries}/${maxRetries}): ${task.goal}`);
        appendEvent(session.id, 'task.retry', { taskId, attempt: retries }, agent.id);
      }
    }

    if (result.success) {
      completedOutputs.set(i, result.output);
      db.prepare("UPDATE tasks SET status = 'completed', result_data = ?, completed_at = ? WHERE id = ?")
        .run(JSON.stringify({ output: result.output.slice(0, 5000) }), Date.now(), taskId);
    } else {
      db.prepare("UPDATE tasks SET status = 'failed', error_message = ?, retry_count = ? WHERE id = ?")
        .run(result.output.slice(0, 1000), retries, taskId);
    }

    results.push({ agent: task.agent, goal: task.goal, success: result.success, output: result.output.slice(0, 500) });
  }

  // Finalize session
  const completed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const allSuccess = failed === 0;

  updateSession(session.id, { status: allSuccess ? 'completed' : 'failed' });

  saveCheckpoint(session.id, 'orchestrator', 'Session complete', {
    tasksCompleted: completed,
    tasksFailed: failed,
    results: results.map(r => ({ agent: r.agent, goal: r.goal, success: r.success })),
  });

  appendEvent(session.id, 'session.completed', {
    success: allSuccess,
    tasksCompleted: completed,
    tasksFailed: failed,
  });

  return {
    sessionId: session.id,
    success: allSuccess,
    tasksCompleted: completed,
    tasksFailed: failed,
    totalTasks: decomposed.length,
    results,
  };
}

export async function resumeSession(sessionId: string): Promise<OrchestratorResult> {
  initializeAgents();

  const session = getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  updateSession(sessionId, { status: 'active' });
  appendEvent(sessionId, 'session.resumed', { sessionId });

  // Get pending/failed tasks
  const db = getDb();
  const pendingTasks = db.prepare(
    "SELECT * FROM tasks WHERE session_id = ? AND status IN ('pending', 'failed') ORDER BY priority ASC"
  ).all(sessionId) as any[];

  const results: OrchestratorResult['results'] = [];

  for (const task of pendingTasks) {
    const input = JSON.parse(task.input_data);
    const agent = routeTaskToAgent(task.task_type, input.goal);

    if (!agent) {
      results.push({ agent: task.task_type, goal: input.goal, success: false, output: 'No agent' });
      continue;
    }

    db.prepare("UPDATE tasks SET status = 'running', agent_id = ?, started_at = ? WHERE id = ?").run(agent.id, Date.now(), task.id);

    const taskInput: TaskInput = {
      id: task.id,
      task_type: task.task_type,
      session_id: sessionId,
      goal: input.goal,
    };

    const result = await agent.execute(taskInput, session.project_path);

    if (result.success) {
      db.prepare("UPDATE tasks SET status = 'completed', result_data = ?, completed_at = ? WHERE id = ?")
        .run(JSON.stringify({ output: result.output.slice(0, 5000) }), Date.now(), task.id);
    } else {
      db.prepare("UPDATE tasks SET status = 'failed', error_message = ? WHERE id = ?")
        .run(result.output.slice(0, 1000), task.id);
    }

    results.push({ agent: task.task_type, goal: input.goal, success: result.success, output: result.output.slice(0, 500) });
  }

  const completed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  updateSession(sessionId, { status: failed === 0 ? 'completed' : 'failed' });

  return {
    sessionId,
    success: failed === 0,
    tasksCompleted: completed,
    tasksFailed: failed,
    totalTasks: results.length,
    results,
  };
}
