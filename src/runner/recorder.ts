// AgentEval — Action/Cost Recorder
// Captures agent actions, token usage, API costs, and timing data

import type { AgentMetrics } from '../types.js';

export interface RecordedAction {
  timestamp: number;
  type: 'stdout' | 'stderr' | 'step';
  content: string;
}

export class Recorder {
  private actions: RecordedAction[] = [];
  private startTime = 0;
  private endTime = 0;

  start(): void {
    this.startTime = Date.now();
    this.actions = [];
  }

  stop(): void {
    this.endTime = Date.now();
  }

  recordStdout(content: string): void {
    this.actions.push({
      timestamp: Date.now(),
      type: 'stdout',
      content,
    });
  }

  recordStderr(content: string): void {
    this.actions.push({
      timestamp: Date.now(),
      type: 'stderr',
      content,
    });
  }

  recordStep(description: string): void {
    this.actions.push({
      timestamp: Date.now(),
      type: 'step',
      content: description,
    });
  }

  getStepCount(): number {
    return this.actions.filter((a) => a.type === 'step').length;
  }

  getFullStdout(): string {
    return this.actions
      .filter((a) => a.type === 'stdout')
      .map((a) => a.content)
      .join('');
  }

  getFullStderr(): string {
    return this.actions
      .filter((a) => a.type === 'stderr')
      .map((a) => a.content)
      .join('');
  }

  getWallClockSeconds(): number {
    const end = this.endTime || Date.now();
    return (end - this.startTime) / 1000;
  }

  getAllActions(): RecordedAction[] {
    return [...this.actions];
  }

  /**
   * Merge adapter-reported metrics with recorded data.
   * Adapter metrics take priority for tokens/cost (they have direct access).
   * Recorder provides wall clock time and step counts as fallback.
   */
  mergeMetrics(adapterMetrics: AgentMetrics): AgentMetrics {
    return {
      tokens_input: adapterMetrics.tokens_input,
      tokens_output: adapterMetrics.tokens_output,
      total_tokens: adapterMetrics.total_tokens,
      cost_usd: adapterMetrics.cost_usd,
      steps: adapterMetrics.steps || this.getStepCount(),
      wall_clock_s: adapterMetrics.wall_clock_s || this.getWallClockSeconds(),
    };
  }
}
