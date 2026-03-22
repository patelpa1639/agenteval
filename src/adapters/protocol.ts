// AgentEval — Agent Protocol
// Common interface that all agent adapters must implement

import type { TaskSpec, AgentMetrics, AgentProcess } from '../types.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CodexCliAdapter } from './codex-cli.js';
import { SubprocessAdapter } from './subprocess.js';

export interface AgentAdapter {
  /** Unique identifier for this agent (e.g., "claude-code") */
  readonly id: string;

  /** Human-readable display name */
  readonly name: string;

  /**
   * Start the agent on a task.
   * @param task   - Parsed task specification
   * @param cwd    - Working directory (inside the sandbox)
   * @param prompt - The prompt string to send to the agent
   * @returns A handle to the running agent process
   */
  start(task: TaskSpec, cwd: string, prompt: string): Promise<AgentProcess>;

  /**
   * Forcefully stop the agent if it exceeds timeout or a critical safety
   * violation is detected.
   */
  stop(): Promise<void>;

  /**
   * Retrieve metrics after the run completes.
   * @returns Token counts, cost, step count, wall clock time
   */
  getMetrics(): Promise<AgentMetrics>;

  /**
   * Retrieve raw stdout and stderr captured during the run.
   */
  getOutput(): { stdout: string; stderr: string };
}

export function getAdapterById(id: string, options?: Record<string, string>): AgentAdapter {
  switch (id) {
    case 'claude-code':
      return new ClaudeCodeAdapter();
    case 'codex-cli':
      return new CodexCliAdapter();
    case 'subprocess': {
      if (!options?.command) {
        throw new Error('Subprocess adapter requires a --command flag');
      }
      return new SubprocessAdapter(options.command);
    }
    default:
      throw new Error(`Unknown agent adapter: "${id}". Available: claude-code, codex-cli, subprocess`);
  }
}
