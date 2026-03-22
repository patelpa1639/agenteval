// AgentEval — Task YAML Schema
// Zod schemas for validating task definition files

import { z } from 'zod';

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const TaskCategorySchema = z.enum(['bugfix', 'feature', 'refactor', 'debug', 'ops', 'multi-step']);

export const TaskSetupSchema = z.object({
  repo: z.string().min(1),
  branch: z.string().optional(),
  commands: z.array(z.string()).optional(),
});

export const AssertionCommandSchema = z.object({
  type: z.literal('command'),
  run: z.string().min(1),
  expect_exit: z.number().int().default(0),
  description: z.string().optional(),
});

export const AssertionFileChangedSchema = z.object({
  type: z.literal('file_changed'),
  path: z.string().min(1),
});

export const AssertionFileUnchangedSchema = z.object({
  type: z.literal('file_unchanged'),
  paths: z.array(z.string().min(1)).min(1),
});

export const AssertionFileExistsSchema = z.object({
  type: z.literal('file_exists'),
  path: z.string().min(1),
});

export const AssertionFileNotExistsSchema = z.object({
  type: z.literal('file_not_exists'),
  path: z.string().min(1),
});

export const AssertionContainsSchema = z.object({
  type: z.literal('contains'),
  path: z.string().min(1),
  pattern: z.string().min(1),
  description: z.string().optional(),
});

export const AssertionNotContainsSchema = z.object({
  type: z.literal('not_contains'),
  path: z.string().min(1),
  pattern: z.string().min(1),
  exclude: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const AssertionSchema = z.discriminatedUnion('type', [
  AssertionCommandSchema,
  AssertionFileChangedSchema,
  AssertionFileUnchangedSchema,
  AssertionFileExistsSchema,
  AssertionFileNotExistsSchema,
  AssertionContainsSchema,
  AssertionNotContainsSchema,
]);

export const InjectFailureSchema = z.object({
  after_step: z.number().int().positive(),
  action: z.string().min(1),
  description: z.string().min(1),
});

export const TaskSpecSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Task ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  difficulty: DifficultySchema,
  category: TaskCategorySchema,
  setup: TaskSetupSchema,
  prompt: z.string().min(1),
  timeout_s: z.number().positive().default(120),
  assertions: z.array(AssertionSchema).min(1),
  inject_failure: InjectFailureSchema.optional(),
});

export const SuiteConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tasks: z.array(z.string().min(1)).min(1),
  defaults: z.object({
    timeout_s: z.number().positive().optional(),
    agent: z.string().optional(),
    runs: z.number().int().positive().optional(),
  }).optional(),
});

export type ValidatedTaskSpec = z.infer<typeof TaskSpecSchema>;
export type ValidatedSuiteConfig = z.infer<typeof SuiteConfigSchema>;
