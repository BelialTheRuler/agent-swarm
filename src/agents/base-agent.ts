import { runClaude } from '../utils/claude-cli';
import { saveCheckpoint } from '../storage/checkpoint-store';
import { appendEvent } from '../storage/event-store';
import { getAgentContext, trimContextToFit, contextToPrompt } from '../storage/context-manager';
import { logger } from '../utils/logger';

export interface TaskInput {
  id: string;
  task_type: string;
  session_id: string;
  goal: string;
  constraints?: string;
  dependencies_output?: string;
}

export interface TaskResult {
  success: boolean;
  output: string;
  filesChanged?: string[];
  decisions?: Array<{ question: string; answer: string }>;
  nextActions?: string[];
}

export interface SwarmAgent {
  id: string;
  name: string;
  type: 'orchestrator' | 'specialist' | 'worker';
  capabilities: string[];
  systemPrompt: string;
  execute(task: TaskInput, projectPath: string): Promise<TaskResult>;
}

export abstract class BaseAgent implements SwarmAgent {
  abstract id: string;
  abstract name: string;
  abstract type: 'orchestrator' | 'specialist' | 'worker';
  abstract capabilities: string[];
  abstract systemPrompt: string;

  async execute(task: TaskInput, projectPath: string): Promise<TaskResult> {
    logger.info(`[${this.name}] Starting task: ${task.goal}`);

    appendEvent(task.session_id, 'agent.task_started', {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      goal: task.goal,
    }, this.id);

    // Build context-enriched prompt
    const context = await getAgentContext(task.session_id, this.id);
    const trimmed = trimContextToFit(context);
    const contextPrompt = contextToPrompt(trimmed);

    const fullPrompt = [
      this.systemPrompt,
      '\n---\n',
      contextPrompt,
      '\n---\n',
      `## Task\n${task.goal}`,
      task.constraints ? `\n## Constraints\n${task.constraints}` : '',
      task.dependencies_output ? `\n## Previous Step Output\n${task.dependencies_output}` : '',
    ].join('\n');

    try {
      const result = await runClaude(fullPrompt, projectPath);

      const taskResult: TaskResult = {
        success: result.exitCode === 0,
        output: result.output,
      };

      // Checkpoint after completion
      saveCheckpoint(task.session_id, this.id, `${this.name}: ${task.goal.slice(0, 40)}`, {
        taskId: task.id,
        goal: task.goal,
        result: taskResult.output.slice(0, 2000),
        success: taskResult.success,
      });

      appendEvent(task.session_id, 'agent.task_completed', {
        agentId: this.id,
        taskId: task.id,
        success: taskResult.success,
        outputPreview: taskResult.output.slice(0, 500),
      }, this.id);

      logger.info(`[${this.name}] Task completed: ${taskResult.success ? 'SUCCESS' : 'FAILED'}`);
      return taskResult;
    } catch (err: any) {
      logger.error(`[${this.name}] Task failed: ${err.message}`);

      appendEvent(task.session_id, 'agent.task_failed', {
        agentId: this.id,
        taskId: task.id,
        error: err.message,
      }, this.id);

      return { success: false, output: `Error: ${err.message}` };
    }
  }
}
