// AgentEval — Sandbox
// Docker and tmpdir sandboxing for isolated agent execution

import { mkdtempSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import type { TaskSetup, FileSnapshot } from '../types.js';

export interface Sandbox {
  mode: 'docker' | 'tmpdir';
  workDir: string;
  containerId?: string;
  snapshot(): FileSnapshot;
  cleanup(): void;
}

export interface SandboxOptions {
  mode: 'docker' | 'tmpdir' | 'auto';
  dockerImage?: string;
  cpuLimit?: number;
  memoryLimit?: string;
  network?: boolean;
}

function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function createSandbox(setup: TaskSetup, options: SandboxOptions): Promise<Sandbox> {
  let mode = options.mode;

  if (mode === 'auto') {
    mode = isDockerAvailable() ? 'docker' : 'tmpdir';
  }

  if (mode === 'docker') {
    return createDockerSandbox(setup, options);
  }
  return createTmpdirSandbox(setup);
}

async function createDockerSandbox(setup: TaskSetup, options: SandboxOptions): Promise<Sandbox> {
  const image = options.dockerImage ?? 'node:22-slim';
  const cpuLimit = options.cpuLimit ?? 2;
  const memoryLimit = options.memoryLimit ?? '4g';
  const network = options.network ? 'bridge' : 'none';

  // Create a temp dir on host for the workspace
  const hostDir = mkdtempSync(join(tmpdir(), 'agenteval-'));

  // Clone the repo
  const branch = setup.branch ? `--branch ${setup.branch}` : '';
  execSync(`git clone --depth 1 ${branch} ${setup.repo} ${hostDir}/workspace`, {
    stdio: 'pipe',
    timeout: 60_000,
  });

  const workDir = join(hostDir, 'workspace');

  // Run setup commands if any
  if (setup.commands) {
    for (const cmd of setup.commands) {
      execSync(cmd, { cwd: workDir, stdio: 'pipe', timeout: 120_000 });
    }
  }

  // Start docker container with the workspace mounted
  const containerName = `agenteval-${Date.now()}`;
  const dockerRun = [
    'docker', 'run', '-d',
    '--name', containerName,
    `--cpus=${cpuLimit}`,
    `--memory=${memoryLimit}`,
    `--network=${network}`,
    '-v', `${workDir}:/workspace`,
    '-w', '/workspace',
    image,
    'tail', '-f', '/dev/null', // Keep container running
  ].join(' ');

  const containerId = execSync(dockerRun, { stdio: 'pipe' }).toString().trim();

  return {
    mode: 'docker',
    workDir,
    containerId,
    snapshot: () => snapshotDirectory(workDir),
    cleanup: () => {
      try {
        execSync(`docker rm -f ${containerId}`, { stdio: 'ignore' });
      } catch { /* ignore */ }
      try {
        rmSync(hostDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    },
  };
}

async function createTmpdirSandbox(setup: TaskSetup): Promise<Sandbox> {
  // Create a parent temp dir, then clone into a 'workspace' subdirectory.
  // git clone requires the target directory to not already exist, so we
  // must NOT clone directly into the mkdtemp dir (which already exists).
  const baseDir = mkdtempSync(join(tmpdir(), 'agenteval-'));

  // Clone the repo into a fresh subdirectory that git will create
  const branch = setup.branch ? `--branch ${setup.branch}` : '';
  const workDir = join(baseDir, 'workspace');
  execSync(`git clone --depth 1 ${branch} ${setup.repo} ${workDir}`, {
    stdio: 'pipe',
    timeout: 60_000,
  });

  // Run setup commands if any
  if (setup.commands) {
    for (const cmd of setup.commands) {
      execSync(cmd, { cwd: workDir, stdio: 'pipe', timeout: 120_000 });
    }
  }

  return {
    mode: 'tmpdir',
    workDir,
    snapshot: () => snapshotDirectory(workDir),
    cleanup: () => {
      try {
        rmSync(baseDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    },
  };
}

function snapshotDirectory(dir: string): FileSnapshot {
  const snapshot: FileSnapshot = {};
  walkDir(dir, dir, snapshot);
  return snapshot;
}

function walkDir(baseDir: string, currentDir: string, snapshot: FileSnapshot): void {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    // Skip node_modules, .git, and other large dirs
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    if (entry.isDirectory()) {
      walkDir(baseDir, fullPath, snapshot);
    } else if (entry.isFile()) {
      const relPath = relative(baseDir, fullPath);
      try {
        const content = readFileSync(fullPath);
        snapshot[relPath] = createHash('sha256').update(content).digest('hex');
      } catch {
        // Skip files we can't read
      }
    }
  }
}
