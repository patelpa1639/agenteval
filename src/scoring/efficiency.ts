// AgentEval — Efficiency Scoring
// Cost, time, and step-count scoring

import type { AgentMetrics, EfficiencyScore } from '../types.js';

export interface EfficiencyBaseline {
  best_tokens: number;
  best_cost_usd: number;
  best_steps: number;
  best_wall_clock_s: number;
}

/**
 * Score efficiency by normalizing each metric against the best observed value.
 * If no baseline is provided, the agent gets a perfect score (it's the only run).
 * Each sub-metric: score = (best / actual) * 100, capped at 100.
 * Final score = average of the four sub-metrics.
 */
export function scoreEfficiency(
  metrics: AgentMetrics,
  baseline?: EfficiencyBaseline,
): EfficiencyScore {
  if (!baseline) {
    // No comparison available — default to 100
    return {
      score: 100,
      tokens: metrics.total_tokens,
      cost_usd: metrics.cost_usd,
      steps: metrics.steps,
      wall_clock_s: metrics.wall_clock_s,
    };
  }

  const subScores: number[] = [];

  // Tokens
  if (metrics.total_tokens > 0 && baseline.best_tokens > 0) {
    subScores.push(Math.min(100, (baseline.best_tokens / metrics.total_tokens) * 100));
  } else {
    subScores.push(100);
  }

  // Cost
  if (metrics.cost_usd > 0 && baseline.best_cost_usd > 0) {
    subScores.push(Math.min(100, (baseline.best_cost_usd / metrics.cost_usd) * 100));
  } else {
    subScores.push(100);
  }

  // Steps
  if (metrics.steps > 0 && baseline.best_steps > 0) {
    subScores.push(Math.min(100, (baseline.best_steps / metrics.steps) * 100));
  } else {
    subScores.push(100);
  }

  // Wall clock time
  if (metrics.wall_clock_s > 0 && baseline.best_wall_clock_s > 0) {
    subScores.push(Math.min(100, (baseline.best_wall_clock_s / metrics.wall_clock_s) * 100));
  } else {
    subScores.push(100);
  }

  const score = subScores.reduce((a, b) => a + b, 0) / subScores.length;

  return {
    score,
    tokens: metrics.total_tokens,
    cost_usd: metrics.cost_usd,
    steps: metrics.steps,
    wall_clock_s: metrics.wall_clock_s,
  };
}

/**
 * Compute the best baseline from a set of metrics across multiple runs/agents.
 */
export function computeBaseline(allMetrics: AgentMetrics[]): EfficiencyBaseline {
  if (allMetrics.length === 0) {
    return { best_tokens: 0, best_cost_usd: 0, best_steps: 0, best_wall_clock_s: 0 };
  }

  return {
    best_tokens: Math.min(...allMetrics.map((m) => m.total_tokens).filter((t) => t > 0)),
    best_cost_usd: Math.min(...allMetrics.map((m) => m.cost_usd).filter((c) => c > 0)),
    best_steps: Math.min(...allMetrics.map((m) => m.steps).filter((s) => s > 0)),
    best_wall_clock_s: Math.min(...allMetrics.map((m) => m.wall_clock_s).filter((t) => t > 0)),
  };
}
