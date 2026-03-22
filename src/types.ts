// AgentEval — Core Type Definitions
// Shared types for tasks, runs, scores, and agent adapters

// ── Task Types ──

export type Difficulty = 'easy' | 'medium' | 'hard';
export type TaskCategory = 'bugfix' | 'feature' | 'refactor' | 'debug' | 'ops' | 'multi-step';

export interface TaskSetup {
  repo: string;
  branch?: string;
  commands?: string[];
}

export interface AssertionCommand {
  type: 'command';
  run: string;
  expect_exit?: number;
  description?: string;
}

export interface AssertionFileChanged {
  type: 'file_changed';
  path: string;
}

export interface AssertionFileUnchanged {
  type: 'file_unchanged';
  paths: string[];
}

export interface AssertionFileExists {
  type: 'file_exists';
  path: string;
}

export interface AssertionFileNotExists {
  type: 'file_not_exists';
  path: string;
}

export interface AssertionContains {
  type: 'contains';
  path: string;
  pattern: string;
  description?: string;
}

export interface AssertionNotContains {
  type: 'not_contains';
  path: string;
  pattern: string;
  exclude?: string[];
  description?: string;
}

export type Assertion =
  | AssertionCommand
  | AssertionFileChanged
  | AssertionFileUnchanged
  | AssertionFileExists
  | AssertionFileNotExists
  | AssertionContains
  | AssertionNotContains;

export interface InjectFailure {
  after_step: number;
  action: string;
  description: string;
}

export interface TaskSpec {
  id: string;
  name: string;
  difficulty: Difficulty;
  category: TaskCategory;
  setup: TaskSetup;
  prompt: string;
  timeout_s: number;
  assertions: Assertion[];
  inject_failure?: InjectFailure;
}

// ── Suite Types ──

export interface SuiteConfig {
  name: string;
  description?: string;
  tasks: string[];            // paths to task YAML files, or inline TaskSpec[]
  defaults?: {
    timeout_s?: number;
    agent?: string;
    runs?: number;
  };
}

// ── Agent Types ──

export interface AgentMetrics {
  tokens_input: number;
  tokens_output: number;
  total_tokens: number;
  cost_usd: number;
  steps: number;
  wall_clock_s: number;
}

export interface AgentProcess {
  pid: number;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  done: Promise<void>;
}

// ── Safety Types ──

export type ViolationSeverity = 'critical' | 'high' | 'medium';

export interface SafetyViolation {
  type: string;
  description: string;
  severity: ViolationSeverity;
  file?: string;
  command?: string;
}

// ── Scoring Types ──

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  detail: string;
}

export interface CorrectnessScore {
  score: number;                // 0-100
  assertions_passed: number;
  assertions_total: number;
  results: AssertionResult[];
}

export interface EfficiencyScore {
  score: number;                // 0-100 (normalized against best in suite)
  tokens: number;
  cost_usd: number;
  steps: number;
  wall_clock_s: number;
}

export interface SafetyScore {
  score: number;                // 0-100
  violations: SafetyViolation[];
}

export interface RecoveryScore {
  score: number;                // 0-100
  status: 'recovered' | 'failed' | 'not_tested';
  extra_steps?: number;
}

export interface DimensionScores {
  correctness: CorrectnessScore;
  efficiency: EfficiencyScore;
  safety: SafetyScore;
  recovery: RecoveryScore;
  composite: number;            // 0-100
}

// ── Run Types ──

export type RunStatus = 'passed' | 'failed' | 'timed_out' | 'error';

export interface FileSnapshot {
  [path: string]: string;       // path -> content hash
}

export interface RunResult {
  task_id: string;
  task_name: string;
  agent_id: string;
  agent_name: string;
  run_number: number;
  status: RunStatus;
  scores: DimensionScores;
  metrics: AgentMetrics;
  stdout: string;
  stderr: string;
  started_at: string;           // ISO 8601
  completed_at: string;         // ISO 8601
  sandbox_mode: 'docker' | 'tmpdir';
  pre_snapshot: FileSnapshot;
  post_snapshot: FileSnapshot;
}

export interface RunRecord {
  id: number;
  suite_name: string;
  task_id: string;
  agent_id: string;
  run_number: number;
  status: RunStatus;
  composite_score: number;
  correctness_score: number;
  efficiency_score: number;
  safety_score: number;
  recovery_score: number;
  tokens: number;
  cost_usd: number;
  steps: number;
  wall_clock_s: number;
  created_at: string;
}

// ── Config Types ──

export interface AgentEvalConfig {
  output_dir: string;
  formats: ('json' | 'markdown' | 'html')[];
  sandbox: 'docker' | 'tmpdir' | 'auto';
  docker?: {
    image?: string;
    cpu_limit?: number;
    memory_limit?: string;
    network?: boolean;
  };
  verbose: boolean;
  runs: number;
  timeout_s: number;
}
