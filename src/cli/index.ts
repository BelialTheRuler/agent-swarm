#!/usr/bin/env node

import { Command } from 'commander';
import { orchestrate, resumeSession } from '../coordinator/orchestrator';
import { listSessions, getActiveSession, getSession } from '../core/work-session';
import { saveCheckpoint, getCheckpoints } from '../storage/checkpoint-store';
import { getEvents } from '../storage/event-store';
import { getDb, closeDb } from '../core/database';
import { isClaudeAvailable } from '../utils/claude-cli';
import * as path from 'path';

const program = new Command();

program
  .name('swarm')
  .description('Multi-agent orchestration CLI — spawns parallel Claude Code sessions')
  .version('1.0.0');

program
  .command('start')
  .description('Start a new agent swarm session')
  .argument('<goal>', 'The development goal to accomplish')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (goal: string, opts: { path: string }) => {
    const projectPath = path.resolve(opts.path);

    console.log('Checking Claude CLI availability...');
    const available = await isClaudeAvailable();
    if (!available) {
      console.error('Error: Claude CLI not found or not responding.');
      console.error('Install it with: npm install -g @anthropic-ai/claude-code');
      process.exit(1);
    }

    console.log(`\nStarting agent swarm...`);
    console.log(`Goal: ${goal}`);
    console.log(`Project: ${projectPath}\n`);

    try {
      const result = await orchestrate(goal, projectPath);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`Session: ${result.sessionId}`);
      console.log(`Status: ${result.success ? 'COMPLETED' : 'FAILED'}`);
      console.log(`Tasks: ${result.tasksCompleted}/${result.totalTasks} completed, ${result.tasksFailed} failed`);
      console.log(`${'='.repeat(60)}\n`);

      for (const r of result.results) {
        const icon = r.success ? '[OK]' : '[FAIL]';
        console.log(`  ${icon} [${r.agent}] ${r.goal}`);
      }

      console.log('');
    } catch (err: any) {
      console.error(`Swarm failed: ${err.message}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('status')
  .description('Show status of the active session')
  .action(() => {
    const session = getActiveSession();
    if (!session) {
      console.log('No active session.');
      closeDb();
      return;
    }

    console.log(`\nActive Session: ${session.id}`);
    console.log(`Goal: ${session.goal}`);
    console.log(`Status: ${session.status}`);
    console.log(`Project: ${session.project_path}`);
    console.log(`Started: ${new Date(session.started_at).toLocaleString()}`);

    const db = getDb();
    const tasks = db.prepare('SELECT * FROM tasks WHERE session_id = ? ORDER BY priority ASC').all(session.id) as any[];

    if (tasks.length > 0) {
      console.log(`\nTasks (${tasks.length}):`);
      for (const t of tasks) {
        const input = JSON.parse(t.input_data);
        const icons: Record<string, string> = {
          pending: '[ ]', running: '[~]', completed: '[x]', failed: '[!]', skipped: '[-]'
        };
        console.log(`  ${icons[t.status] || '[ ]'} [${t.task_type}] ${input.goal}`);
      }
    }

    const checkpoints = getCheckpoints(session.id, 3);
    if (checkpoints.length > 0) {
      console.log(`\nRecent Checkpoints:`);
      for (const cp of checkpoints) {
        console.log(`  - ${cp.checkpoint_name} (${new Date(cp.created_at).toLocaleString()})`);
      }
    }

    console.log('');
    closeDb();
  });

program
  .command('list')
  .description('List all sessions')
  .option('-s, --status <status>', 'Filter by status (active, paused, completed, failed)')
  .action((opts: { status?: string }) => {
    const sessions = listSessions(opts.status);

    if (sessions.length === 0) {
      console.log('No sessions found.');
      closeDb();
      return;
    }

    console.log(`\nSessions (${sessions.length}):\n`);
    for (const s of sessions) {
      const icons: Record<string, string> = {
        active: '[ACTIVE]', paused: '[PAUSED]', completed: '[DONE]', failed: '[FAIL]'
      };
      console.log(`  ${icons[s.status] || s.status}  ${s.id.slice(0, 8)}  ${s.goal.slice(0, 60)}`);
      console.log(`          ${new Date(s.started_at).toLocaleString()} | ${s.project_path}`);
    }

    console.log('');
    closeDb();
  });

program
  .command('resume')
  .description('Resume a paused or failed session')
  .argument('<session-id>', 'Session ID (or prefix)')
  .action(async (sessionId: string) => {
    // Support prefix matching
    const db = getDb();
    const match = db.prepare("SELECT id FROM work_sessions WHERE id LIKE ? ORDER BY updated_at DESC LIMIT 1")
      .get(`${sessionId}%`) as { id: string } | undefined;

    if (!match) {
      console.error(`No session found matching: ${sessionId}`);
      closeDb();
      process.exit(1);
    }

    console.log(`Resuming session: ${match.id}\n`);

    try {
      const result = await resumeSession(match.id);

      console.log(`\nResume complete:`);
      console.log(`  Tasks completed: ${result.tasksCompleted}`);
      console.log(`  Tasks failed: ${result.tasksFailed}`);
      console.log(`  Status: ${result.success ? 'COMPLETED' : 'FAILED'}`);
    } catch (err: any) {
      console.error(`Resume failed: ${err.message}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command('checkpoint')
  .description('Save a manual checkpoint')
  .argument('<name>', 'Checkpoint name')
  .action((name: string) => {
    const session = getActiveSession();
    if (!session) {
      console.error('No active session.');
      closeDb();
      process.exit(1);
    }

    saveCheckpoint(session.id, 'manual', name, {
      manual: true,
      timestamp: Date.now(),
    });

    console.log(`Checkpoint saved: "${name}" for session ${session.id.slice(0, 8)}`);
    closeDb();
  });

program
  .command('show')
  .description('Show detailed session info')
  .argument('<session-id>', 'Session ID (or prefix)')
  .action((sessionId: string) => {
    const db = getDb();
    const match = db.prepare("SELECT id FROM work_sessions WHERE id LIKE ? ORDER BY updated_at DESC LIMIT 1")
      .get(`${sessionId}%`) as { id: string } | undefined;

    if (!match) {
      console.error(`No session found matching: ${sessionId}`);
      closeDb();
      process.exit(1);
    }

    const session = getSession(match.id);
    if (!session) {
      console.error('Session not found.');
      closeDb();
      process.exit(1);
    }

    console.log(`\nSession: ${session.id}`);
    console.log(`Goal: ${session.goal}`);
    console.log(`Status: ${session.status}`);
    console.log(`Project: ${session.project_path}`);
    console.log(`Started: ${new Date(session.started_at).toLocaleString()}`);
    if (session.completed_at) {
      console.log(`Completed: ${new Date(session.completed_at).toLocaleString()}`);
    }

    const events = getEvents(session.id);
    if (events.length > 0) {
      console.log(`\nEvent Log (${events.length} events):`);
      for (const e of events.slice(-20)) {
        console.log(`  [${new Date(e.created_at).toLocaleString()}] ${e.event_type}`);
      }
    }

    console.log('');
    closeDb();
  });

program.parse();
