# Architecture Module: verification/evals-checks

> **Capability ID**: `verification-evals-checks`
> **Matched Prefixes**: `tests`, `evals`, `scripts/run-skill-evals.ts`, `scripts/run-harness-profile-benchmark.ts`, `scripts/validate-harness-profile-benchmark.ts`, `scripts/run-bounded-verifier-command.ts`, `scripts/verify-contract.sh`, `scripts/verify-sprint.sh`, `scripts/check-task-workflow.sh`, `scripts/check-task-sync.sh`, `scripts/check-agent-tooling.sh`, `scripts/check-brain-manifest.sh`, `scripts/sync-brain-docs.sh`
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

- `check-deploy-sql-order.sh` reads optional `.ai/harness/policy.json#operations.deploy_sql`; a valid override selects its roots, naming modes, and invariant file, while absence selects direct `deploy/sql/` children with `ordered4` names. Malformed or unsafe configured paths fail closed instead of falling back to the default layout.
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

## 2026-07-14 Verifier Evidence Lifecycle Cutover

- `verify-contract.sh` is a bounded evidence consumer: one fixed 600-second
  deadline covers all declared tests and commands, each child runs in its own
  process group, and timeout terminates descendants while preserving duration,
  signal, exit, and timeout evidence.
- Verifier-owned command lists reject benchmark/provider production, adoption,
  evidence producers, and substantive install before execution. `verify-sprint`
  invokes contract verification read-only and validates an already-produced
  authoritative benchmark report without launching the matrix.
- The profile benchmark owns schema v2 evidence production. Its content subject
  binds runner/scenario/fixture/install/provider-schema inputs; its sidecar binds
  the final JSON and Markdown bytes. Three immutable profile bases feed 27
  isolated writable overlays, preserving the 3x9 matrix with three setup passes.
  Execution uses a fixed two-arm pool and a non-configurable 50-minute absolute
  deadline; provider arms are detached process groups and deadline expiry sends
  termination to the whole group, so producer cost cannot silently exceed its
  declared evidence SLO or orphan provider descendants.
- Each arm records its pre-provider baseline revision. Grading and workspace
  evidence compare that baseline to final `HEAD` plus the working tree, so a
  provider commit or fast-forward remains visible final content instead of
  disappearing from a `git status`-only view. Authoritative execution fails
  fast on the first invalid arm and terminates its in-flight sibling group.
- Workspace overlays are full `--no-hardlinks` clones whose `origin` is replaced
  by a bare repository owned by that arm;
  HOME overlays rebase absolute cache symlinks from the profile base to the arm
  copy. Provider-local merge/push/install behavior therefore cannot write back
  through Git remotes, shared object inodes, or copied absolute links.
- Strict arms create a private primary clone and expose the graded workspace as
  its linked `codex/benchmark` worktree. The active-worktree marker records that
  workspace's canonical real path, so StrictWorktreeGuard neither creates an
  ungraded second-level worktree nor rejects macOS `/var` versus `/private/var`
  aliases. Ignored runtime inputs such as the resume projection are materialized
  again in that linked workspace after creation; they cannot travel through the
  private primary's commit.
- At 10x scale the first failure would be evidence-production latency, not the
  verifier. Keeping production explicit and verification bounded prevents a
  closeout gate from becoming an unbounded job runner.

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
