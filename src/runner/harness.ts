// AgentEval — Agent Execution Harness
// Orchestrates task setup, agent invocation, and result collection

import { execSync } from 'node:child_process';
import type { AgentAdapter } from '../adapters/protocol.js';
import { createSandbox, type SandboxOptions } from './sandbox.js';
import { Recorder } from './recorder.js';
import { runAssertions } from '../tasks/verifier.js';
import { scoreCorrectness } from '../scoring/correctness.js';
import { scoreEfficiency, type EfficiencyBaseline } from '../scoring/efficiency.js';
import { scoreSafety } from '../scoring/safety.js';
import { scoreRecovery } from '../scoring/recovery.js';
import { computeComposite } from '../scoring/composite.js';
import type {
  TaskSpec,
  RunResult,
  RunStatus,
  AgentMetrics,
  FileSnapshot,
  DimensionScores,
} from '../types.js';

export interface HarnessOptions {
  sandbox: SandboxOptions;
  verbose: boolean;
  efficiencyBaseline?: EfficiencyBaseline;
}

export async function runTask(
  task: TaskSpec,
  adapter: AgentAdapter,
  runNumber: number,
  options: HarnessOptions,
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const recorder = new Recorder();

  // Create sandbox
  const sandbox = await createSandbox(task.setup, options.sandbox);
  const cwd = sandbox.workDir;

  let status: RunStatus = 'error';
  let metrics: AgentMetrics = emptyMetrics();
  let stdout = '';
  let stderr = '';
  let preSnapshot: FileSnapshot = {};
  let postSnapshot: FileSnapshot = {};
  let scores: DimensionScores = emptyScores();

  try {
    // Snapshot before agent runs
    preSnapshot = sandbox.snapshot();

    // Start the agent
    recorder.start();
    const agentProcess = await adapter.start(task, cwd, task.prompt);

    if (options.verbose) {
      console.log(`  [run ${runNumber}] Agent started (PID: ${agentProcess.pid})`);
    }

    // Set up timeout
    const timeoutMs = task.timeout_s * 1000;
    let timedOut = false;
    const timer = setTimeout(async () => {
      timedOut = true;
      await adapter.stop();
    }, timeoutMs);

    // If there's a failure injection, set it up
    let injectionApplied = false;
    let stepsBeforeInjection = 0;
    if (task.inject_failure) {
      // Poll for step count and inject when threshold is reached
      const injectionInterval = setInterval(() => {
        if (!injectionApplied && recorder.getStepCount() >= task.inject_failure!.after_step) {
          injectionApplied = true;
          stepsBeforeInjection = recorder.getStepCount();
          try {
            execSync(task.inject_failure!.action, { cwd, stdio: 'ignore', timeout: 10_000 });
            if (options.verbose) {
              console.log(`  [run ${runNumber}] Injected failure: ${task.inject_failure!.description}`);
            }
          } catch {
            // Injection command failed — log but continue
          }
          clearInterval(injectionInterval);
        }
      }, 500);

      agentProcess.done.finally(() => clearInterval(injectionInterval));
    }

    // Wait for agent to complete
    await agentProcess.done;
    clearTimeout(timer);
    recorder.stop();

    // Get metrics and output from adapter
    const adapterMetrics = await adapter.getMetrics();
    metrics = recorder.mergeMetrics(adapterMetrics);
    const adapterOutput = adapter.getOutput();
    stdout = adapterOutput.stdout;
    stderr = adapterOutput.stderr;

    if (timedOut) {
      status = 'timed_out';
    } else {
      // Snapshot after agent runs
      postSnapshot = sandbox.snapshot();

      // Run assertions
      const assertionResults = runAssertions(task.assertions, cwd, preSnapshot, postSnapshot);

      if (options.verbose) {
        for (const ar of assertionResults) {
          const icon = ar.passed ? '✓' : '✗';
          console.log(`    ${icon} [${ar.assertion.type}] ${ar.detail}`);
        }
      }

      const correctness = scoreCorrectness(assertionResults);
      const efficiency = scoreEfficiency(metrics, options.efficiencyBaseline);
      const safety = scoreSafety(cwd, preSnapshot, postSnapshot, stdout + stderr);
      const recovery = scoreRecovery(
        task,
        injectionApplied,
        assertionResults.every((r) => r.passed),
        metrics.steps - stepsBeforeInjection,
      );
      const composite = computeComposite(correctness, efficiency, safety, recovery);

      scores = { correctness, efficiency, safety, recovery, composite };

      // Determine status
      if (correctness.score >= 100) {
        status = 'passed';
      } else {
        status = 'failed';
      }
    }
  } catch (err: any) {
    status = 'error';
    stderr += `\nHarness error: ${err.message}`;
  } finally {
    sandbox.cleanup();
  }

  return {
    task_id: task.id,
    task_name: task.name,
    agent_id: adapter.id,
    agent_name: adapter.name,
    run_number: runNumber,
    status,
    scores,
    metrics,
    stdout,
    stderr,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    sandbox_mode: options.sandbox.mode === 'auto' ? 'tmpdir' : options.sandbox.mode as 'docker' | 'tmpdir',
    pre_snapshot: preSnapshot,
    post_snapshot: postSnapshot,
  };
}

export async function runSuite(
  tasks: TaskSpec[],
  adapter: AgentAdapter,
  runs: number,
  options: HarnessOptions,
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  for (const task of tasks) {
    console.log(`\n▸ Task: ${task.name} (${task.id})`);

    for (let r = 1; r <= runs; r++) {
      console.log(`  Run ${r}/${runs}...`);
      const result = await runTask(task, adapter, r, options);
      results.push(result);

      const icon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '⚠';
      console.log(
        `  ${icon} ${result.status} | ` +
        `correctness: ${result.scores.correctness.score.toFixed(0)} | ` +
        `efficiency: ${result.scores.efficiency.score.toFixed(0)} | ` +
        `safety: ${result.scores.safety.score.toFixed(0)} | ` +
        `composite: ${result.scores.composite.toFixed(0)} | ` +
        `${result.metrics.wall_clock_s.toFixed(1)}s`
      );
    }
  }

  return results;
}

function emptyMetrics(): AgentMetrics {
  return { tokens_input: 0, tokens_output: 0, total_tokens: 0, cost_usd: 0, steps: 0, wall_clock_s: 0 };
}

function emptyScores(): DimensionScores {
  return {
    correctness: { score: 0, assertions_passed: 0, assertions_total: 0, results: [] },
    efficiency: { score: 0, tokens: 0, cost_usd: 0, steps: 0, wall_clock_s: 0 },
    safety: { score: 100, violations: [] },
    recovery: { score: 0, status: 'not_tested' },
    composite: 0,
  };
}
