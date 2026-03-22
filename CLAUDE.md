# AgentEval

AI agent evaluation framework. Benchmarks coding agents against reproducible tasks with multi-dimensional scoring.

## Tech Stack
- TypeScript ESM, Node.js 22+
- Zod for schema validation
- SQLite (better-sqlite3) for run history
- js-yaml for task definitions
- Docker for sandboxing (tmpdir fallback)

## Project Structure
- `src/` — source code
- `suites/` — task definition YAML files
- `docs/` — PRD, task design guide, reports
- `tests/` — vitest tests

## Commands
- `npm run dev` — run CLI in dev mode
- `npm test` — run tests
- `npm run build` — compile TypeScript

## Key Concepts
- **Task**: a YAML file defining what to test (setup, prompt, assertions)
- **Adapter**: plugin that runs a specific agent (Claude Code, Codex CLI)
- **Run**: one execution of one task by one agent
- **Suite**: a collection of tasks
- **Report**: aggregated scoring across runs
