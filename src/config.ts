// AgentEval — Configuration Loading
// Reads and validates project-level and CLI configuration

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'js-yaml';
import { z } from 'zod';
import type { AgentEvalConfig } from './types.js';

const ConfigSchema = z.object({
  output_dir: z.string().default('./results'),
  formats: z.array(z.enum(['json', 'markdown', 'html'])).default(['json', 'markdown']),
  sandbox: z.enum(['docker', 'tmpdir', 'auto']).default('auto'),
  docker: z.object({
    image: z.string().optional(),
    cpu_limit: z.number().optional(),
    memory_limit: z.string().optional(),
    network: z.boolean().optional(),
  }).optional(),
  verbose: z.boolean().default(false),
  runs: z.number().int().positive().default(1),
  timeout_s: z.number().positive().default(120),
});

const CONFIG_FILE_NAMES = ['agenteval.config.yaml', 'agenteval.config.yml', '.agentevalrc.yaml'];

export function loadConfig(overrides?: Partial<AgentEvalConfig>): AgentEvalConfig {
  let fileConfig: Record<string, unknown> = {};

  // Look for config file
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = resolve(process.cwd(), name);
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8');
      fileConfig = (YAML.load(raw) as Record<string, unknown>) ?? {};
      break;
    }
  }

  // Merge: file config < CLI overrides
  const merged = { ...fileConfig, ...stripUndefined(overrides ?? {}) };
  const result = ConfigSchema.parse(merged);

  return result as AgentEvalConfig;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
