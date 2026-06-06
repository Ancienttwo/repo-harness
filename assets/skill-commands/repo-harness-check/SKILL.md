---
name: repo-harness-check
description: Verification entrypoint for repo-harness workflow readiness. Runs workflow gates, task sync, contract checks, inspector, and migration dry-run before merge or release.
when_to_use: "repo-harness-check, check agentic workflow, verify harness, pre-merge workflow check, release readiness, validate tasks-first contract"
---

# repo-harness-check

Use this command when the user asks whether the harness, migration, or release surface is ready.

## Protocol

1. Confirm the repo path and report dirty-worktree boundaries.
2. Run the repo-local required checks that exist:
   - `bun test`
   - `bash scripts/check-deploy-sql-order.sh`
   - `bash scripts/check-task-sync.sh`
   - `bash scripts/check-task-workflow.sh --strict`
   - `bun scripts/inspect-project-state.ts --repo . --format text`
   - `bash scripts/migrate-project-template.sh --repo . --dry-run`
3. Run advisory readiness when available:
   - `bash scripts/check-agent-tooling.sh --host both --json`
4. Treat missing CodeGraph or missing Codex `health`/`check`/`mermaid` as hard failures.
5. Treat Waza staging drift and gbrain warnings as yellow readiness flags; report the fix or acceptance reason without failing the repo gate.
6. Report skill eval authority when release/readiness evidence depends on skill
   effectiveness:
   - authoritative: non-dry-run `bun run benchmark:skills --eval <slug>` with
     `full_test_count > 0`, `dry_run_ratio <= 30%`, and graders reported
   - non-authoritative: dry-run-heavy or all-dry-run evidence
   - unavailable: no current eval evidence; report the benchmark command needed
7. Summarize pass/fail evidence, yellow flags, eval authority metrics, and the next blocking command if any.

## Failure Modes

- If any required workflow gate fails, report the first blocking command and stop the readiness claim.
- If advisory tooling times out, report advisory evidence as unavailable instead of passing it.
- If eval evidence is missing or all dry-run, mark it non-authoritative or unavailable for skill effectiveness and name the repair command.

## Boundaries

- Does not mutate repo files by default.
- Does not silently ignore CodeGraph readiness failures, advisory tooling hangs, or skipped checks.
- Does not claim skill-effectiveness authority from dry-run benchmark output.
- Does not claim release readiness if source repo and installed runtime copy are out of sync.
