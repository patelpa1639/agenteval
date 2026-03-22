// AgentEval — JSON Export
// Exports evaluation results as structured JSON

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { RunResult } from '../types.js';

export interface JsonReport {
  generated_at: string;
  agent_id: string;
  agent_name: string;
  total_tasks: number;
  total_runs: number;
  pass_rate: number;
  aggregate: {
    composite: number;
    correctness: number;
    efficiency: number;
    safety: number;
    recovery: number;
    total_cost_usd: number;
    total_time_s: number;
  };
  tasks: TaskSummary[];
}

interface AssertionDetail {
  type: string;
  passed: boolean;
  detail: string;
  description?: string;
}

interface RunDetail {
  run_number: number;
  status: string;
  correctness: number;
  assertions: AssertionDetail[];
}

interface TaskSummary {
  task_id: string;
  task_name: string;
  runs: number;
  pass_count: number;
  pass_rate: number;
  avg_composite: number;
  avg_correctness: number;
  avg_efficiency: number;
  avg_safety: number;
  avg_recovery: number;
  avg_cost_usd: number;
  avg_time_s: number;
  avg_steps: number;
  safety_violations: number;
  recovery_tested: boolean;
  recovery_rate: number;
  run_details: RunDetail[];
}

export function generateJsonReport(results: RunResult[]): JsonReport {
  if (results.length === 0) {
    throw new Error('No results to generate report from');
  }

  const agentId = results[0].agent_id;
  const agentName = results[0].agent_name;

  // Group by task
  const byTask = new Map<string, RunResult[]>();
  for (const r of results) {
    const group = byTask.get(r.task_id) ?? [];
    group.push(r);
    byTask.set(r.task_id, group);
  }

  const tasks: TaskSummary[] = [];
  let totalPassed = 0;

  for (const [taskId, taskRuns] of byTask) {
    const passCount = taskRuns.filter((r) => r.status === 'passed').length;
    totalPassed += passCount;

    const avg = (fn: (r: RunResult) => number) =>
      taskRuns.reduce((sum, r) => sum + fn(r), 0) / taskRuns.length;

    const recoveryRuns = taskRuns.filter((r) => r.scores.recovery.status !== 'not_tested');
    const recoveryRate = recoveryRuns.length > 0
      ? recoveryRuns.filter((r) => r.scores.recovery.status === 'recovered').length / recoveryRuns.length
      : 0;

    const runDetails: RunDetail[] = taskRuns.map((r) => ({
      run_number: r.run_number,
      status: r.status,
      correctness: r.scores.correctness.score,
      assertions: r.scores.correctness.results.map((ar) => ({
        type: ar.assertion.type,
        passed: ar.passed,
        detail: ar.detail,
        description: 'description' in ar.assertion ? (ar.assertion as any).description : undefined,
      })),
    }));

    tasks.push({
      task_id: taskId,
      task_name: taskRuns[0].task_name,
      runs: taskRuns.length,
      pass_count: passCount,
      pass_rate: passCount / taskRuns.length,
      avg_composite: avg((r) => r.scores.composite),
      avg_correctness: avg((r) => r.scores.correctness.score),
      avg_efficiency: avg((r) => r.scores.efficiency.score),
      avg_safety: avg((r) => r.scores.safety.score),
      avg_recovery: avg((r) => r.scores.recovery.score),
      avg_cost_usd: avg((r) => r.metrics.cost_usd),
      avg_time_s: avg((r) => r.metrics.wall_clock_s),
      avg_steps: avg((r) => r.metrics.steps),
      safety_violations: taskRuns.reduce((sum, r) => sum + r.scores.safety.violations.length, 0),
      recovery_tested: recoveryRuns.length > 0,
      recovery_rate: recoveryRate,
      run_details: runDetails,
    });
  }

  const avgScore = (fn: (t: TaskSummary) => number) =>
    tasks.reduce((sum, t) => sum + fn(t), 0) / tasks.length;

  return {
    generated_at: new Date().toISOString(),
    agent_id: agentId,
    agent_name: agentName,
    total_tasks: tasks.length,
    total_runs: results.length,
    pass_rate: totalPassed / results.length,
    aggregate: {
      composite: avgScore((t) => t.avg_composite),
      correctness: avgScore((t) => t.avg_correctness),
      efficiency: avgScore((t) => t.avg_efficiency),
      safety: avgScore((t) => t.avg_safety),
      recovery: avgScore((t) => t.avg_recovery),
      total_cost_usd: results.reduce((sum, r) => sum + r.metrics.cost_usd, 0),
      total_time_s: results.reduce((sum, r) => sum + r.metrics.wall_clock_s, 0),
    },
    tasks,
  };
}

export function writeJsonReport(report: JsonReport, outputPath: string): void {
  const absPath = resolve(outputPath);
  const dir = dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(absPath, JSON.stringify(report, null, 2) + '\n');
}
