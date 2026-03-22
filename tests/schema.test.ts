import { describe, it, expect } from 'vitest';
import { TaskSpecSchema, SuiteConfigSchema } from '../src/tasks/schema.js';

describe('TaskSpecSchema', () => {
  const validTask = {
    id: 'fix-string-escape',
    name: 'Fix HTML string escaping bug',
    difficulty: 'easy',
    category: 'bugfix',
    setup: {
      repo: 'https://github.com/test/fixture.git',
      branch: 'broken',
      commands: ['npm install'],
    },
    prompt: 'The test suite has a failing test. Fix it.',
    timeout_s: 120,
    assertions: [
      { type: 'command', run: 'npm test' },
      { type: 'file_unchanged', paths: ['test/sanitize.test.js', 'package.json'] },
    ],
  };

  it('validates a correct task spec', () => {
    const result = TaskSpecSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it('rejects task with missing id', () => {
    const { id, ...noId } = validTask;
    const result = TaskSpecSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it('rejects task with invalid difficulty', () => {
    const result = TaskSpecSchema.safeParse({ ...validTask, difficulty: 'impossible' });
    expect(result.success).toBe(false);
  });

  it('rejects task with no assertions', () => {
    const result = TaskSpecSchema.safeParse({ ...validTask, assertions: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid task ID format', () => {
    const result = TaskSpecSchema.safeParse({ ...validTask, id: 'Fix Bug!' });
    expect(result.success).toBe(false);
  });

  it('accepts task with inject_failure', () => {
    const result = TaskSpecSchema.safeParse({
      ...validTask,
      inject_failure: {
        after_step: 3,
        action: 'rm -rf node_modules',
        description: 'Delete dependencies mid-task',
      },
    });
    expect(result.success).toBe(true);
  });

  it('defaults timeout_s to 120', () => {
    const { timeout_s, ...noTimeout } = validTask;
    const result = TaskSpecSchema.parse(noTimeout);
    expect(result.timeout_s).toBe(120);
  });

  it('defaults expect_exit to 0 for command assertions', () => {
    const result = TaskSpecSchema.parse(validTask);
    const cmdAssertion = result.assertions.find((a) => a.type === 'command');
    expect(cmdAssertion).toBeDefined();
    if (cmdAssertion?.type === 'command') {
      expect(cmdAssertion.expect_exit).toBe(0);
    }
  });
});

describe('SuiteConfigSchema', () => {
  it('validates a correct suite config', () => {
    const result = SuiteConfigSchema.safeParse({
      name: 'coding-mvp',
      description: 'MVP coding tasks',
      tasks: ['tasks/fix-string-escape.yaml', 'tasks/add-validation.yaml'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects suite with no tasks', () => {
    const result = SuiteConfigSchema.safeParse({
      name: 'empty',
      tasks: [],
    });
    expect(result.success).toBe(false);
  });
});
