# Architecture Domain: Runtime Harness

> **Source**: `.ai/context/capabilities.json`
> **Owner**: Hook implementation, adapter settings, runtime event files, handoff, and context-pressure state.

## Purpose

The runtime harness gives Claude and Codex a file-backed workflow shell. The
shared implementation lives under `.ai/hooks/`; adapters point into that layer
instead of becoming separate hook sources of truth.

## Capabilities

- `runtime-harness-hook-adapters` -> `docs/architecture/modules/runtime-harness/hook-adapters.md`

## Stable Rules

- `.ai/hooks/` is the shared hook implementation.
- `.claude/settings.json` is the Claude adapter surface.
- Repo-local `.codex/` is not a committed contract surface. Use `.ai/` for repo-local implementation and reserve `~/.codex` for global Codex runtime state.
- Runtime files under `.ai/harness/checks`, `.ai/harness/handoff`, `.ai/harness/failures`, `.ai/harness/context-budget`, `.ai/harness/architecture/events.jsonl`, `.ai/harness/worktrees`, and `.ai/harness/runs` are ignored state, not durable deliverables.

## Verification Surface

- `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/workflow-contract.test.ts`
- `bash scripts/check-task-workflow.sh --strict`
