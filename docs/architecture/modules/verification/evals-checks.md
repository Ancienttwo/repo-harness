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
- `repo-harness adopt --repo . --dry-run`
- non-dry-run `bun run benchmark:skills --eval <slug>` runs when release or
  readiness evidence depends on skill effectiveness.
- `bun scripts/run-harness-profile-benchmark.ts --execute --provider
  <codex|claude>` owns the 3x9 No Harness / Adaptive Lite / Strict comparison.
  Each report uses exactly one provider. No Harness uses an auth-only isolated
  Codex home plus `--ignore-user-config --ignore-rules --ephemeral`, or Claude
  `--safe-mode`; every arm binds `HOME`/settings and `BUN_INSTALL` to its
  disposable run root.
  `--require-authoritative` additionally requires every provider execution,
  deterministic grader, task status, and No Harness isolation proof to pass.
  The report binds one run ID to source commit, provider version, and
  runner/manifest/fixture/workspace evidence hashes.

Non-authoritative smoke:

- `bun run benchmark:skills --dry-run` only proves eval harness wiring. It is not
  skill-effectiveness evidence for release/readiness claims.
- The profile benchmark without `--execute` is also non-authoritative and keeps
  every provider-owned metric null rather than estimating it.
- `--regrade-existing` may recompute deterministic acceptance against retained
  run workspaces after a grader bug fix. It cannot change provider streams or
  make an unavailable usage record authoritative.

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

## 2026-06-12 Architecture Queue Closeout

- The strict workflow required-file surface now tracks
  `scripts/architecture-queue.sh` instead of the retired
  `scripts/architecture-drift.sh`.
- Focused coverage for queue behavior lives in `tests/architecture-queue.test.ts`
  and covers card merge, reindex self-heal, cutoff triage, gate modes, and
  archive roundtrip.
- Existing hook/runtime/contract tests continue to assert hook parity and the
  advisory PostToolUse behavior around architecture queue failures.

## Optimization Backlog

- Add capability registry validation to strict workflow checks once the new registry has one more real edit cycle.
- Keep external tooling probes read-only unless a command explicitly targets tooling maintenance.
- The 2026-07-13 Claude matrix passed 27/27 but measured Adaptive Lite at 496 s,
  69 model calls, and 68 s of hooks versus Strict at 391 s, 55 calls, and 60 s
  of hooks. Optimize cold hook execution and Standard/Strict promotion cost
  before claiming a performance win; do not lower deterministic risk floors.
