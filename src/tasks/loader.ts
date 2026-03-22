// AgentEval — Task Loader
// Loads and validates task YAML files from suite directories

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import YAML from 'js-yaml';
import { TaskSpecSchema, SuiteConfigSchema } from './schema.js';
import type { TaskSpec, SuiteConfig } from '../types.js';

export function loadTaskFile(filePath: string): TaskSpec {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`Task file not found: ${absPath}`);
  }

  const raw = readFileSync(absPath, 'utf-8');
  const parsed = YAML.load(raw);

  const result = TaskSpecSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid task file ${absPath}:\n${errors}`);
  }

  return result.data as TaskSpec;
}

export function loadSuiteFile(filePath: string): { config: SuiteConfig; tasks: TaskSpec[] } {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`Suite file not found: ${absPath}`);
  }

  const raw = readFileSync(absPath, 'utf-8');
  const parsed = YAML.load(raw);

  const result = SuiteConfigSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid suite file ${absPath}:\n${errors}`);
  }

  const config = result.data as SuiteConfig;
  const suiteDir = dirname(absPath);

  const tasks: TaskSpec[] = config.tasks.map((taskPath) => {
    const resolvedPath = resolve(suiteDir, taskPath);
    return loadTaskFile(resolvedPath);
  });

  return { config, tasks };
}

export function loadTasksFromDirectory(dirPath: string): TaskSpec[] {
  const absDir = resolve(dirPath);
  if (!existsSync(absDir)) {
    throw new Error(`Task directory not found: ${absDir}`);
  }

  const files: string[] = readdirSync(absDir)
    .filter((f: string) => (f.endsWith('.yaml') || f.endsWith('.yml')) && f !== 'suite.yaml' && f !== 'suite.yml')
    .sort();

  return files.map((f: string) => loadTaskFile(resolve(absDir, f)));
}
