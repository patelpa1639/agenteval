// AgentEval — Correctness Scoring
// Pass/fail scoring based on assertion results

import type { AssertionResult, CorrectnessScore } from '../types.js';

/**
 * Score correctness as the percentage of assertions that passed.
 * Partial credit: 4/5 assertions = 80 score.
 */
export function scoreCorrectness(results: AssertionResult[]): CorrectnessScore {
  const total = results.length;
  if (total === 0) {
    return { score: 100, assertions_passed: 0, assertions_total: 0, results: [] };
  }

  const passed = results.filter((r) => r.passed).length;
  const score = (passed / total) * 100;

  return {
    score,
    assertions_passed: passed,
    assertions_total: total,
    results,
  };
}
