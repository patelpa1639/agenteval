// AgentEval — Generic Subprocess Adapter
// Adapter for running any agent as a subprocess

import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentAdapter } from './protocol.js';
import type { TaskSpec, AgentMetrics, AgentProcess } from '../types.js';

export class SubprocessAdapter implements AgentAdapter {
  readonly id = 'subprocess';
  readonly name: string;

  private commandTemplate: string;
  private process: ChildProcess | null = null;
  private startTime = 0;
  private endTime = 0;
  private rawStdout = '';
  private rawStderr = '';

  constructor(commandTemplate: string) {
    this.commandTemplate = commandTemplate;
    // Derive a name from the command
    const cmd = commandTemplate.split(/\s+/)[0];
    this.name = `Custom (${cmd})`;
  }

  async start(task: TaskSpec, cwd: string, prompt: string): Promise<AgentProcess> {
    this.startTime = Date.now();
    this.rawStdout = '';
    this.rawStderr = '';

    // Replace placeholders in command template
    const command = this.commandTemplate
      .replace(/\{prompt\}/g, prompt.replace(/"/g, '\\"'))
      .replace(/\{cwd\}/g, cwd)
      .replace(/\{task_id\}/g, task.id);

    const child = spawn('sh', ['-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process = child;
    let exitCode: number | null = null;

    child.stdout?.on('data', (chunk: Buffer) => {
      this.rawStdout += chunk.toString();
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
    // Best-effort: we can only measure wall clock time and count output lines as steps
    const steps = this.rawStdout.split('\n').filter((l) => l.trim().length > 0).length;

    return {
      tokens_input: 0,
      tokens_output: 0,
      total_tokens: 0,
      cost_usd: 0,
      steps,
      wall_clock_s: (this.endTime - this.startTime) / 1000,
    };
  }

  getOutput(): { stdout: string; stderr: string } {
    return { stdout: this.rawStdout, stderr: this.rawStderr };
  }
}
