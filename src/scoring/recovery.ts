// AgentEval — Recovery Scoring
// Failure injection and recovery behavior scoring

import type { TaskSpec, RecoveryScore } from '../types.js';

/**
 * Score recovery based on whether the agent recovered from an injected failure.
 *
 * - If no injection was defined: status = 'not_tested', score = 0 (excluded from composite)
 * - If injected and agent still passed all assertions: recovered
 *   Score = 100 - (extra_steps * 5), minimum 50
 * - If injected and agent failed: score = 0
 */
export function scoreRecovery(
  task: TaskSpec,
  injectionApplied: boolean,
  allAssertionsPassed: boolean,
  extraSteps: number,
): RecoveryScore {
  // No injection defined for this task
  if (!task.inject_failure) {
    return { score: 0, status: 'not_tested' };
  }

  // Injection was defined but never triggered (agent finished too fast)
  if (!injectionApplied) {
    return { score: 0, status: 'not_tested' };
  }

  // Injection was applied
  if (allAssertionsPassed) {
    const penalty = Math.max(0, extraSteps) * 5;
    const score = Math.max(50, 100 - penalty);
    return {
      score,
      status: 'recovered',
      extra_steps: extraSteps,
    };
  }

  return { score: 0, status: 'failed', extra_steps: extraSteps };
}
