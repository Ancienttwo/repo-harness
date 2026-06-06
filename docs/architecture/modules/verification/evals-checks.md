# Architecture Module: verification/evals-checks

> **Capability ID**: `verification-evals-checks`
> **Matched Prefixes**: `tests`, `evals`, `scripts/run-skill-evals.ts`, `scripts/check-task-workflow.sh`, `scripts/check-task-sync.sh`, `scripts/check-agent-tooling.sh`, `scripts/check-brain-manifest.sh`, `scripts/sync-brain-docs.sh`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

Verification is split into regression tests, repo-local workflow gates, migration
dry-runs, eval fixtures, and advisory external-tooling probes.

Authoritative checks:

- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/sync-brain-docs.sh --check` for opted-in default-brain mirrors.
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- non-dry-run `bun run benchmark:skills --eval <slug>` runs when release or
  readiness evidence depends on skill effectiveness.

Non-authoritative smoke:

- `bun run benchmark:skills --dry-run` only proves eval harness wiring. It is not
  skill-effectiveness evidence for release/readiness claims.

## P2 Trace

Concrete route: pre-merge `repo-harness-check` -> reports dirty worktree
boundaries -> runs unit/regression tests -> checks task sync -> checks workflow
strict readiness -> inspects repo state -> dry-runs self-migration -> reports
whether release or merge readiness is blocked.

Inputs are current git state, tracked files, ignored runtime paths, required
CodeGraph readiness, advisory tooling state, and skill eval metrics when a
release/readiness claim uses skill-effectiveness evidence. Outputs are command
exit codes, `full_test_count`, `dry_run_ratio`, `grader_pass_rate`,
`effectiveness_authority`, and concise readiness evidence.

Error paths:

- `check-task-sync.sh` fails when substantive repo changes lack `tasks/` synchronization.
- `check-task-workflow.sh --strict` fails for missing contract files, legacy docs, missing JSON runtime, broken deploy SQL order, or brain manifest drift.
- Skill eval evidence is non-authoritative when it is missing or dry-run-heavy;
  release filings must record the missing evidence or the repair command.
- External tooling update checks may be skipped or timed out; CodeGraph host/index readiness is required for agent code navigation, while version freshness and other external tooling remain advisory unless the user explicitly asks for tooling maintenance.

## P3 Decision

Verification is broad because this repo is both source and self-hosted example.
The invariant is that self-hosted runtime files, generated templates, and
installable copies must not drift silently.

At 10x repo size, the first failure would be full-test cost. The current split
lets small slices run focused tests while release/pre-merge runs the full gate.

## Optimization Backlog

- Add capability registry validation to strict workflow checks once the new registry has one more real edit cycle.
- Keep external tooling probes read-only unless a command explicitly targets tooling maintenance.
