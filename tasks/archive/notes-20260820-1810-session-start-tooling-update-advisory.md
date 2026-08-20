> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Implementation Notes: session-start-tooling-update-advisory

## Context

SessionStart now surfaces update-only Agent actions from
`repo-harness setup check --check-updates --json`, including stale
`repo-harness` CLI and external tooling dependency updates such as CodeGraph.

## Decisions

- Reuse the setup-check action contract instead of reimplementing version
  comparison in shell. The hook filters to `cli.update` and
  `tooling.*.update`, so readiness repairs, security review, and user-level
  instruction actions do not become version-update prompts.
- Keep the default SessionStart path non-blocking. When the cached report is
  stale, the hook starts an asynchronous refresh and renders the previous cache
  if one exists. `REPO_HARNESS_TOOLING_ADVISORY_SYNC=1` exists for tests and
  manual smoke checks only.
- Store the advisory cache under `.ai/harness/security/` because that directory
  is already ignored runtime state. This avoids widening the tracked workflow
  contract for a small advisory cache.
- Preserve the existing route registry and PostToolUse hot path. The behavior
  lives in `session-start-context.sh`, after higher-priority resume/current
  context and before the final SessionStart JSON payload is rendered.

## Verification

- `bun test tests/hook-runtime.test.ts --test-name-pattern "session-start-context|tooling update"`
- `bun test tests/hook-contracts.test.ts tests/cli/hook.test.ts tests/cli/init-hook.test.ts`
- `HOOK_HOST=codex REPO_HARNESS_TOOLING_ADVISORY_SYNC=1 bash .ai/hooks/session-start-context.sh`
