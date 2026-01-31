import { execFile } from 'child_process';
import { loadConfig } from '../core/config';

export interface ClaudeResult {
  output: string;
  exitCode: number;
}

export function runClaude(prompt: string, cwd: string, options?: { timeout?: number }): Promise<ClaudeResult> {
  const config = loadConfig();
  const timeout = options?.timeout ?? 300_000; // 5 min default

  return new Promise((resolve, reject) => {
    const args = ['--print', '--output-format', 'text', prompt];

    const child = execFile(config.claudeCliPath, args, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error(`Claude CLI timed out after ${timeout}ms`));
        return;
      }

      resolve({
        output: stdout.toString().trim(),
        exitCode: error?.code ? Number(error.code) : 0,
      });
    });
  });
}

export function runClaudeJson<T = any>(prompt: string, cwd: string): Promise<T> {
  const jsonPrompt = `${prompt}\n\nRespond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`;

  return runClaude(jsonPrompt, cwd).then(result => {
    // Try to extract JSON from the response
    const text = result.output;

    // Try direct parse first
    try {
      return JSON.parse(text);
    } catch {
      // Try to find JSON in the output
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse Claude response as JSON: ${text.slice(0, 200)}`);
    }
  });
}

export async function isClaudeAvailable(): Promise<boolean> {
  try {
    const result = await runClaude('Say "ok"', process.cwd(), { timeout: 15_000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
