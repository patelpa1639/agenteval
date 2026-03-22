// AgentEval — Codex CLI Adapter
// Adapter for running evaluations against Codex CLI

import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentAdapter } from './protocol.js';
import type { TaskSpec, AgentMetrics, AgentProcess } from '../types.js';

export class CodexCliAdapter implements AgentAdapter {
  readonly id = 'codex-cli';
  readonly name = 'Codex CLI';

  private process: ChildProcess | null = null;
  private startTime = 0;
  private endTime = 0;
  private rawStdout = '';
  private rawStderr = '';
  private stepCount = 0;

  async start(task: TaskSpec, cwd: string, prompt: string): Promise<AgentProcess> {
    this.startTime = Date.now();
    this.rawStdout = '';
    this.rawStderr = '';
    this.stepCount = 0;

    const child = spawn('codex', ['exec', '--dangerously-bypass-approvals-and-sandbox', prompt], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process = child;
    let exitCode: number | null = null;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.rawStdout += text;
      // Count steps by looking for action indicators in output
      const actionLines = text.split('\n').filter((l: string) =>
        l.includes('Running:') || l.includes('Writing:') || l.includes('Reading:')
      );
      this.stepCount += actionLines.length;
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      this.rawStderr += chunk.toString();
    });

    const done = new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        exitCode = code;
        this.endTime = Date.now();
        resolve();
      });
      child.on('error', (err) => {
        this.endTime = Date.now();
        reject(err);
      });
    });

    return {
      pid: child.pid ?? 0,
      get stdout() { return ''; },
      get stderr() { return ''; },
      get exit_code() { return exitCode; },
      done,
    };
  }

  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  async getMetrics(): Promise<AgentMetrics> {
    // Codex CLI doesn't expose token counts directly — estimate from output length
    const outputLength = this.rawStdout.length + this.rawStderr.length;
    const estimatedOutputTokens = Math.ceil(outputLength / 4);
    const estimatedInputTokens = estimatedOutputTokens * 2; // rough heuristic

    return {
      tokens_input: estimatedInputTokens,
      tokens_output: estimatedOutputTokens,
      total_tokens: estimatedInputTokens + estimatedOutputTokens,
      cost_usd: 0, // Cannot reliably estimate without token counts
      steps: this.stepCount,
      wall_clock_s: (this.endTime - this.startTime) / 1000,
    };
  }

  getOutput(): { stdout: string; stderr: string } {
    return { stdout: this.rawStdout, stderr: this.rawStderr };
  }
}
