// AgentEval — Result Verifier
// Runs assertions against agent output to determine pass/fail

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Assertion, AssertionResult, FileSnapshot } from '../types.js';

export function runAssertions(
  assertions: Assertion[],
  cwd: string,
  preSnapshot: FileSnapshot,
  postSnapshot: FileSnapshot,
): AssertionResult[] {
  return assertions.map((assertion) => runSingleAssertion(assertion, cwd, preSnapshot, postSnapshot));
}

function runSingleAssertion(
  assertion: Assertion,
  cwd: string,
  preSnapshot: FileSnapshot,
  postSnapshot: FileSnapshot,
): AssertionResult {
  switch (assertion.type) {
    case 'command':
      return assertCommand(assertion, cwd);
    case 'file_changed':
      return assertFileChanged(assertion, preSnapshot, postSnapshot);
    case 'file_unchanged':
      return assertFileUnchanged(assertion, preSnapshot, postSnapshot);
    case 'file_exists':
      return assertFileExists(assertion, cwd);
    case 'file_not_exists':
      return assertFileNotExists(assertion, cwd);
    case 'contains':
      return assertContains(assertion, cwd);
    case 'not_contains':
      return assertNotContains(assertion, cwd);
  }
}

function assertCommand(
  assertion: { type: 'command'; run: string; expect_exit?: number; description?: string },
  cwd: string,
): AssertionResult {
  const expectedExit = assertion.expect_exit ?? 0;
  try {
    const output = execSync(assertion.run, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    // execSync throws on non-zero exit, so if we're here exit code is 0
    const passed = expectedExit === 0;
    const stdoutStr = output?.toString().slice(-500) ?? '';
    return {
      assertion,
      passed,
      detail: passed
        ? `Command exited with 0. stdout (last 500): ${stdoutStr}`
        : `Command exited with 0 but expected ${expectedExit}`,
    };
  } catch (err: any) {
    const actualExit = err.status ?? 1;
    const passed = actualExit === expectedExit;
    const stderrStr = (err.stderr?.toString() ?? '').slice(0, 500);
    const stdoutStr = (err.stdout?.toString() ?? '').slice(0, 500);
    return {
      assertion,
      passed,
      detail: passed
        ? `Command exited with ${actualExit} as expected`
        : `Command exited with ${actualExit}, expected ${expectedExit}. stdout: ${stdoutStr} stderr: ${stderrStr}`,
    };
  }
}

function assertFileChanged(
  assertion: { type: 'file_changed'; path: string },
  preSnapshot: FileSnapshot,
  postSnapshot: FileSnapshot,
): AssertionResult {
  const pre = preSnapshot[assertion.path];
  const post = postSnapshot[assertion.path];

  if (!post) {
    return { assertion, passed: false, detail: `File ${assertion.path} does not exist after run` };
  }
  if (!pre) {
    return { assertion, passed: true, detail: `File ${assertion.path} was created (new file)` };
  }

  const changed = pre !== post;
  return {
    assertion,
    passed: changed,
    detail: changed
      ? `File ${assertion.path} was modified`
      : `File ${assertion.path} was NOT modified (expected change)`,
  };
}

function assertFileUnchanged(
  assertion: { type: 'file_unchanged'; paths: string[] },
  preSnapshot: FileSnapshot,
  postSnapshot: FileSnapshot,
): AssertionResult {
  const changed: string[] = [];
  const details: string[] = [];
  for (const p of assertion.paths) {
    const pre = preSnapshot[p];
    const post = postSnapshot[p];
    if (pre !== post) {
      changed.push(p);
      if (!pre) {
        details.push(`${p}: not in pre-snapshot (file was created)`);
      } else if (!post) {
        details.push(`${p}: not in post-snapshot (file was deleted)`);
      } else {
        details.push(`${p}: hash changed (${pre.slice(0, 8)}... -> ${post.slice(0, 8)}...)`);
      }
    }
  }

  if (changed.length === 0) {
    return { assertion, passed: true, detail: `All ${assertion.paths.length} files unchanged` };
  }
  return {
    assertion,
    passed: false,
    detail: `Files modified that should not have been: ${details.join('; ')}`,
  };
}

function assertFileExists(
  assertion: { type: 'file_exists'; path: string },
  cwd: string,
): AssertionResult {
  const fullPath = resolve(cwd, assertion.path);
  const exists = existsSync(fullPath);
  return {
    assertion,
    passed: exists,
    detail: exists ? `File ${assertion.path} exists` : `File ${assertion.path} not found`,
  };
}

function assertFileNotExists(
  assertion: { type: 'file_not_exists'; path: string },
  cwd: string,
): AssertionResult {
  const fullPath = resolve(cwd, assertion.path);
  const exists = existsSync(fullPath);
  return {
    assertion,
    passed: !exists,
    detail: !exists ? `File ${assertion.path} does not exist (good)` : `File ${assertion.path} exists but should not`,
  };
}

function assertContains(
  assertion: { type: 'contains'; path: string; pattern: string; description?: string },
  cwd: string,
): AssertionResult {
  const fullPath = resolve(cwd, assertion.path);
  if (!existsSync(fullPath)) {
    return { assertion, passed: false, detail: `File ${assertion.path} not found` };
  }
  const content = readFileSync(fullPath, 'utf-8');
  const regex = new RegExp(assertion.pattern);
  const matches = regex.test(content);
  return {
    assertion,
    passed: matches,
    detail: matches
      ? `File ${assertion.path} matches pattern /${assertion.pattern}/`
      : `File ${assertion.path} does not match pattern /${assertion.pattern}/`,
  };
}

function assertNotContains(
  assertion: { type: 'not_contains'; path: string; pattern: string; exclude?: string[]; description?: string },
  cwd: string,
): AssertionResult {
  const fullPath = resolve(cwd, assertion.path);
  if (!existsSync(fullPath)) {
    // File doesn't exist, so it can't contain the pattern
    return { assertion, passed: true, detail: `File ${assertion.path} not found (passes not_contains)` };
  }
  const content = readFileSync(fullPath, 'utf-8');
  const regex = new RegExp(assertion.pattern);
  const matches = regex.test(content);
  return {
    assertion,
    passed: !matches,
    detail: !matches
      ? `File ${assertion.path} does not contain pattern /${assertion.pattern}/ (good)`
      : `File ${assertion.path} contains forbidden pattern /${assertion.pattern}/`,
  };
}
