// AgentEval — Claude Code Adapter
// Adapter for running evaluations against Claude Code

import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentAdapter } from './protocol.js';
import type { TaskSpec, AgentMetrics, AgentProcess } from '../types.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = 'claude-code';
  readonly name = 'Claude Code';

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

    const child = spawn('claude', [
      '-p', prompt,
      '--output-format', 'json',
      '--dangerously-skip-permissions',
    ], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_NO_ANALYTICS: '1' },
    });

    this.process = child;

    let exitCode: number | null = null;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.rawStdout += text;
      // Count tool use steps from streaming output
      const toolMatches = text.match(/"type"\s*:\s*"tool_use"/g);
      if (toolMatches) {
        this.stepCount += toolMatches.length;
      }
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
      // Give it 5s to clean up, then force kill
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  async getMetrics(): Promise<AgentMetrics> {
    // Try to parse JSON output from Claude Code
    let tokensInput = 0;
    let tokensOutput = 0;
    let costUsd = 0;

    try {
      const parsed = JSON.parse(this.rawStdout);
      // Claude Code JSON output format
      if (parsed.usage) {
        tokensInput = parsed.usage.input_tokens ?? 0;
        tokensOutput = parsed.usage.output_tokens ?? 0;
      }
      if (parsed.cost_usd !== undefined) {
        costUsd = parsed.cost_usd;
      }
      // Estimate cost from tokens if not provided
      if (costUsd === 0 && (tokensInput + tokensOutput) > 0) {
        costUsd = (tokensInput * 0.003 + tokensOutput * 0.015) / 1000;
      }
    } catch {
      // If stdout isn't clean JSON, try to extract from the last line
      const lines = this.rawStdout.trim().split('\n');
      for (const line of lines.reverse()) {
        try {
          const obj = JSON.parse(line);
          if (obj.usage) {
            tokensInput = obj.usage.input_tokens ?? 0;
            tokensOutput = obj.usage.output_tokens ?? 0;
          }
          if (obj.cost_usd !== undefined) {
            costUsd = obj.cost_usd;
          }
          break;
        } catch {
          continue;
        }
      }
    }

    return {
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      total_tokens: tokensInput + tokensOutput,
      cost_usd: costUsd,
      steps: this.stepCount,
      wall_clock_s: (this.endTime - this.startTime) / 1000,
    };
  }

  getOutput(): { stdout: string; stderr: string } {
    return { stdout: this.rawStdout, stderr: this.rawStderr };
  }
}
