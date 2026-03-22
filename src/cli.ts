#!/usr/bin/env node
// AgentEval — CLI Entry Point
// Command-line interface for running evaluations, viewing reports, and managing tasks

import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadSuiteFile, loadTaskFile } from './tasks/loader.js';
import { loadConfig } from './config.js';
import { getAdapterById } from './adapters/protocol.js';
import { runSuite } from './runner/harness.js';
import { generateJsonReport, writeJsonReport } from './reports/json.js';
import { writeMarkdownReport } from './reports/markdown.js';
import { generateComparison, writeComparisonReport } from './reports/compare.js';
import { RunStore } from './store/runs.js';
import type { AgentEvalConfig } from './types.js';

const program = new Command();

program
  .name('agenteval')
  .description('AI agent evaluation framework — benchmark coding agents with reproducible tasks')
  .version('0.1.0');

// ── run command ──
program
  .command('run')
  .description('Run an evaluation suite against an agent')
  .argument('<suite>', 'Path to suite YAML file')
  .requiredOption('-a, --agent <adapter>', 'Agent adapter (claude-code, codex-cli, subprocess)')
  .option('-r, --runs <count>', 'Number of runs per task', '1')
  .option('-t, --timeout <seconds>', 'Override default timeout')
  .option('-o, --output <dir>', 'Output directory for reports', './results')
  .option('-f, --format <formats>', 'Output formats (comma-separated: json,markdown,html)', 'json,markdown')
  .option('--no-docker', 'Force tmpdir fallback (skip Docker)')
  .option('--command <cmd>', 'Command template for subprocess adapter')
  .option('-v, --verbose', 'Stream agent stdout/stderr to terminal')
  .option('--dry-run', 'Validate suite and print execution plan without running')
  .action(async (suitePath: string, opts: Record<string, any>) => {
    try {
      const config = loadConfig({
        output_dir: opts.output,
        formats: opts.format.split(','),
        sandbox: opts.docker === false ? 'tmpdir' : 'auto',
        verbose: opts.verbose ?? false,
        runs: parseInt(opts.runs, 10),
        timeout_s: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
      });

      // Load suite
      const { config: suiteConfig, tasks } = loadSuiteFile(suitePath);

      console.log(`\n╔══════════════════════════════════════════╗`);
      console.log(`║          AgentEval v0.1.0                ║`);
      console.log(`╚══════════════════════════════════════════╝`);
      console.log(`\nSuite: ${suiteConfig.name}`);
      console.log(`Agent: ${opts.agent}`);
      console.log(`Tasks: ${tasks.length}`);
      console.log(`Runs per task: ${config.runs}`);
      console.log(`Sandbox: ${config.sandbox}`);

      if (opts.dryRun) {
        console.log('\n── Dry Run: Execution Plan ──\n');
        for (const task of tasks) {
          console.log(`  ${task.id} (${task.difficulty}) — ${task.name}`);
          console.log(`    Assertions: ${task.assertions.length}`);
          console.log(`    Timeout: ${task.timeout_s}s`);
          if (task.inject_failure) {
            console.log(`    Recovery test: ${task.inject_failure.description}`);
          }
        }
        console.log('\nDry run complete. No agents were invoked.');
        return;
      }

      // Get adapter
      const adapter = getAdapterById(opts.agent, { command: opts.command });

      // Run
      console.log('\n── Starting Evaluation ──');
      const results = await runSuite(tasks, adapter, config.runs, {
        sandbox: {
          mode: config.sandbox,
          dockerImage: config.docker?.image,
          cpuLimit: config.docker?.cpu_limit,
          memoryLimit: config.docker?.memory_limit,
          network: config.docker?.network,
        },
        verbose: config.verbose,
      });

      // Store results
      const store = new RunStore();
      store.insertResults(suiteConfig.name, results);
      store.close();

      // Generate reports
      const jsonReport = generateJsonReport(results);
      const outputDir = resolve(config.output_dir);
      const agentSlug = opts.agent.replace(/[^a-z0-9-]/g, '-');

      if (config.formats.includes('json')) {
        const jsonPath = resolve(outputDir, `results-${agentSlug}.json`);
        writeJsonReport(jsonReport, jsonPath);
        console.log(`\n📄 JSON report: ${jsonPath}`);
      }

      if (config.formats.includes('markdown')) {
        const mdPath = resolve(outputDir, `results-${agentSlug}.md`);
        writeMarkdownReport(jsonReport, mdPath);
        console.log(`📄 Markdown report: ${mdPath}`);
      }

      // Summary
      console.log('\n── Summary ──');
      console.log(`Pass rate: ${(jsonReport.pass_rate * 100).toFixed(1)}%`);
      console.log(`Composite score: ${jsonReport.aggregate.composite.toFixed(1)}`);
      console.log(`Total cost: $${jsonReport.aggregate.total_cost_usd.toFixed(4)}`);
      console.log(`Total time: ${jsonReport.aggregate.total_time_s.toFixed(1)}s`);
    } catch (err: any) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

// ── compare command ──
program
  .command('compare')
  .description('Compare results from multiple agents')
  .argument('<results...>', 'Paths to JSON result files')
  .option('-o, --output <path>', 'Output path for comparison report', './results/comparison.md')
  .action(async (resultPaths: string[], opts: Record<string, any>) => {
    try {
      const { readFileSync } = await import('node:fs');
      const reports = resultPaths.map((p: string) => {
        const raw = readFileSync(resolve(p), 'utf-8');
        return JSON.parse(raw);
      });

      const comparison = generateComparison(reports);
      writeComparisonReport(comparison, opts.output);
      console.log(`Comparison report written to: ${resolve(opts.output)}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── history command ──
program
  .command('history')
  .description('View run history from the local database')
  .option('-a, --agent <id>', 'Filter by agent ID')
  .option('-s, --suite <name>', 'Filter by suite name')
  .option('-n, --limit <count>', 'Number of results to show', '20')
  .action(async (opts: Record<string, any>) => {
    try {
      const store = new RunStore();
      let runs;

      if (opts.agent) {
        runs = store.getRunsByAgent(opts.agent, parseInt(opts.limit, 10));
      } else if (opts.suite) {
        runs = store.getRunsBySuite(opts.suite);
      } else {
        // Show all agents
        const agents = store.getAllAgents();
        if (agents.length === 0) {
          console.log('No run history found. Run an evaluation first.');
          store.close();
          return;
        }
        console.log('Agents with run history:');
        for (const agent of agents) {
          const agentRuns = store.getRunsByAgent(agent, 1);
          console.log(`  ${agent} — ${agentRuns.length} run(s)`);
        }
        store.close();
        return;
      }

      if (runs.length === 0) {
        console.log('No runs found matching the filter.');
      } else {
        console.log(`\n${'Task'.padEnd(30)} ${'Status'.padEnd(10)} ${'Composite'.padEnd(10)} ${'Time'.padEnd(8)} ${'Date'.padEnd(20)}`);
        console.log('-'.repeat(78));
        for (const run of runs) {
          console.log(
            `${run.task_id.padEnd(30)} ${run.status.padEnd(10)} ${run.composite_score.toFixed(1).padEnd(10)} ` +
            `${run.wall_clock_s.toFixed(1).padEnd(8)}s ${run.created_at}`
          );
        }
      }

      store.close();
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── validate command ──
program
  .command('validate')
  .description('Validate a task or suite YAML file')
  .argument('<file>', 'Path to YAML file')
  .option('--suite', 'Validate as a suite file (default: task file)')
  .action(async (filePath: string, opts: Record<string, any>) => {
    try {
      if (opts.suite) {
        const { config, tasks } = loadSuiteFile(filePath);
        console.log(`Suite "${config.name}" is valid.`);
        console.log(`  Tasks: ${tasks.length}`);
        for (const task of tasks) {
          console.log(`    - ${task.id} (${task.difficulty}): ${task.name}`);
        }
      } else {
        const task = loadTaskFile(filePath);
        console.log(`Task "${task.id}" is valid.`);
        console.log(`  Name: ${task.name}`);
        console.log(`  Difficulty: ${task.difficulty}`);
        console.log(`  Category: ${task.category}`);
        console.log(`  Assertions: ${task.assertions.length}`);
        if (task.inject_failure) {
          console.log(`  Recovery test: ${task.inject_failure.description}`);
        }
      }
    } catch (err: any) {
      console.error(`Validation failed: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
