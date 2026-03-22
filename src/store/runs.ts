// AgentEval — Run History Store
// SQLite-backed storage for evaluation run data

import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import type { RunResult, RunRecord } from '../types.js';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suite_name TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  run_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  composite_score REAL NOT NULL,
  correctness_score REAL NOT NULL,
  efficiency_score REAL NOT NULL,
  safety_score REAL NOT NULL,
  recovery_score REAL NOT NULL,
  tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  steps INTEGER NOT NULL,
  wall_clock_s REAL NOT NULL,
  stdout TEXT,
  stderr TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  sandbox_mode TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export class RunStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? resolve(process.cwd(), '.agenteval', 'runs.db');
    const dir = resolve(path, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLE);
  }

  insertRun(suiteName: string, result: RunResult): number {
    const stmt = this.db.prepare(`
      INSERT INTO runs (
        suite_name, task_id, agent_id, run_number, status,
        composite_score, correctness_score, efficiency_score,
        safety_score, recovery_score,
        tokens, cost_usd, steps, wall_clock_s,
        stdout, stderr, started_at, completed_at, sandbox_mode
      ) VALUES (
        @suite_name, @task_id, @agent_id, @run_number, @status,
        @composite_score, @correctness_score, @efficiency_score,
        @safety_score, @recovery_score,
        @tokens, @cost_usd, @steps, @wall_clock_s,
        @stdout, @stderr, @started_at, @completed_at, @sandbox_mode
      )
    `);

    const info = stmt.run({
      suite_name: suiteName,
      task_id: result.task_id,
      agent_id: result.agent_id,
      run_number: result.run_number,
      status: result.status,
      composite_score: result.scores.composite,
      correctness_score: result.scores.correctness.score,
      efficiency_score: result.scores.efficiency.score,
      safety_score: result.scores.safety.score,
      recovery_score: result.scores.recovery.score,
      tokens: result.metrics.total_tokens,
      cost_usd: result.metrics.cost_usd,
      steps: result.metrics.steps,
      wall_clock_s: result.metrics.wall_clock_s,
      stdout: result.stdout,
      stderr: result.stderr,
      started_at: result.started_at,
      completed_at: result.completed_at,
      sandbox_mode: result.sandbox_mode,
    });

    return info.lastInsertRowid as number;
  }

  insertResults(suiteName: string, results: RunResult[]): void {
    const transaction = this.db.transaction((items: RunResult[]) => {
      for (const result of items) {
        this.insertRun(suiteName, result);
      }
    });
    transaction(results);
  }

  getRunsByAgent(agentId: string, limit = 50): RunRecord[] {
    return this.db
      .prepare('SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(agentId, limit) as RunRecord[];
  }

  getRunsBySuite(suiteName: string): RunRecord[] {
    return this.db
      .prepare('SELECT * FROM runs WHERE suite_name = ? ORDER BY created_at DESC')
      .all(suiteName) as RunRecord[];
  }

  getRunsByTask(taskId: string): RunRecord[] {
    return this.db
      .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as RunRecord[];
  }

  getLatestResults(suiteName: string, agentId: string): RunRecord[] {
    return this.db.prepare(`
      SELECT * FROM runs
      WHERE suite_name = ? AND agent_id = ?
      ORDER BY created_at DESC
    `).all(suiteName, agentId) as RunRecord[];
  }

  getAllAgents(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT agent_id FROM runs ORDER BY agent_id')
      .all() as { agent_id: string }[];
    return rows.map((r) => r.agent_id);
  }

  close(): void {
    this.db.close();
  }
}
