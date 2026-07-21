# Task Contract: vgbr-post-hrd-baseline-recovery

> **Status**: Active
> **Plan**: plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `b32b328208da5b07418c4fd815491bcc3913ff9f` (`VGBR_BASELINE_SHA`, re-pinned after `vgbr-rf` PR #113 merged; fresh-fetch verified equal to `origin/main` at pin time)
> **Target Branch**: main (via one independent PR after Phase 2 report promotion)
> **Working Branch**: `codex/vgbr-r2-baseline-recovery` (fresh name; the voided attempt's slug `codex/vgbr-post-hrd-baseline-recovery` is deleted evidence and is never revived)
> **PR Unit**: one independent PR carrying the three canonical report artifacts plus the Program dependency annotation edit; this package opens no PR in Phase 1
> **Capability ID**: root
> **Last Updated**: 2026-07-22 06:02
> **Review File**: `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md`
> **Notes File**: `tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Sprint C (Evidence & Projection Convergence) backlog row 3 needs a precise,
current, verifiable authoritative benchmark baseline before EPC-00..09 can
start. The first VGBR-R attempt (`vgbr-dbcfbe75-20260721-a01`, base
`dbcfbe75`, 2026-07-21 21:41-22:18) ran the full invocation and passed 27/27
producer arms plus the validator/matrix test, but the runner's own
local-source install step mutated the frozen subject mid-run (`src/cli/index.ts`
and `src/cli/hook-entry.ts` file modes `0755` -> `0777`). That attempt
correctly self-classified `invalid_report`, copied no canonical report bytes,
and was consumed — never rerun. Sprint C backlog row 2 (`vgbr-rf`, PR #113,
`51a2ee7d`) fixed the runner: it packs an external hash-pinned artifact and no
longer installs from ROOT, with a red-then-green mode-drift regression guard
(28/28 exit criteria, `external_pass` receipt at base `61b5ec59`). Two more
harness fixes landed after that: PR #111 (`REPO_HARNESS_HELPER_SOURCE_PATH`
env-leak that broke `bun test` under `verify-sprint`) and PR #114 (acceptance
recorder now resolves `review_base` like the validator). `origin/main` now
stands at `b32b328208da5b07418c4fd815491bcc3913ff9f`. Shipping wrong here a
second time means either another mutated-subject `invalid_report`, or the
Program mislabeling the recovered baseline as "pure post-HRD" when
substantial acknowledged parallel work landed first. This contract governs
both Phase 1 (setup, this package's current execution) and Phase 2 (the
actual invocation, under separate authorization); Phase 1 alone changes no
runtime, benchmark, or production behavior.

## Goal

Phase 1 (this contract's current execution):

1. Re-pin `VGBR_BASELINE_SHA` at `b32b328208da5b07418c4fd815491bcc3913ff9f`
   via fresh fetch, verified equal to local `main` HEAD.
2. Open the orchestration worktree on the fresh branch
   `codex/vgbr-r2-baseline-recovery` from a disposable control clone (never
   the root checkout, never the voided attempt's slug).
3. Create a detached, read-only subject checkout at the same pinned commit,
   outside both the root checkout and the orchestration worktree; verify it
   clean and pinned.
4. Create an empty `REPORT_STAGE_DIR` outside the subject checkout.
5. Write one attempt record with `outcome: null`, `started_at: null`, and
   `EXPECTED_SUBJECT_HASH: null` (computed by Phase 2's own preflight, not
   here).
6. Pass contract preflight and `check-task-workflow --strict`.
7. Commit plan/contract/notes/attempt-record locally in the orchestration
   worktree. No push, no PR, no benchmark or validator invocation.

Phase 2 (separate authorization, not executed by this contract's current
run):

1. Compute `EXPECTED_SUBJECT_HASH` from the detached subject checkout as part
   of Phase 2's own preflight.
2. Run the exactly-once authoritative invocation in that checkout.
3. Validate the report and the matrix test in the same checkout.
4. Copy validated artifacts into this worktree's canonical report paths and
   re-check byte binding there.
5. Record the attempt outcome, finish the contract worktree, open and merge
   the report PR carrying the mandatory annotation below.

## P1: Architecture Map

- Effective State, Loop Semantics, Hook Runtime Diet, and `vgbr-rf`'s runner
  fix are frozen predecessor authorities; this package consumes them and does
  not re-touch their surfaces.
- This package owns exactly one Program slice: authoritative baseline
  recovery. EPC-00..09 and SSD remain no-touch and unblocked by this
  package's existence, but `main` is frozen for benchmark-subject-touching
  PRs from the moment `VGBR_BASELINE_SHA` is pinned until this package's
  report PR merges (sprint R3). PR #112 (bulk plan archive) touches none of
  the benchmark subject inputs and is exempt from that freeze.
- The runner, its manifest (`evals/harness/scenarios.json`), its fixture seed
  (`evals/fixtures/harness-matrix`), and the validator are frozen inputs for
  this package; none of them may be edited here.

## P2: Concrete Trace

`origin/main@dbcfbe75` (first attempt base) -> subject mutated mid-run by the
runner's install step -> attempt self-classified `invalid_report`, consumed,
never rerun -> `vgbr-rf` (PR #113) fixes the runner -> `origin/main` advances
through PR #110/#111/#113/#114 to `b32b3282` -> fresh fetch verifies
`origin/main@b32b3282` equals local `main` HEAD -> this contract re-pins it as
`VGBR_BASELINE_SHA`/`EXPECTED_BASE_SHA` -> a disposable control clone
(`/private/tmp/repo-harness-vgbr-r2-control-20260722-0556`) is cloned
`--local` from the root checkout, origin repointed to the real remote,
fetched, and fast-forwarded to that exact commit -> the orchestration
worktree branches from the control clone's `origin/main` on
`codex/vgbr-r2-baseline-recovery` -> a detached subject checkout at the same
commit is created outside both checkouts -> the attempt record freezes
`ATTEMPT_ID`, `EXPECTED_SUBJECT_SHA`, `command_sha256`, `provider`,
`provider_cli_version`, `outcome: null`, with `EXPECTED_SUBJECT_HASH` left
`null` -> contract preflight and `check-task-workflow --strict` pass -> Phase
1 commits land locally, unpushed -> (separate authorization) Phase 2's own
preflight computes `EXPECTED_SUBJECT_HASH` from the detached checkout, then
runs the exactly-once invocation -> validator and matrix test pass ->
artifacts promote into this worktree's canonical report paths -> the report
PR merges into `main` carrying the mandatory annotation -> EPC-00
fresh-fetches `origin/main` and pins `POST_VGBR_SHA`.

## P3: Design Decision

- Dual-checkout structure is mandatory (sprint Row 3): a single worktree
  cannot simultaneously hold uncommitted plan/contract files and present a
  clean checkout at the pinned SHA for the benchmark subject.
- The orchestration worktree opens from a disposable control clone, never
  the root checkout directly, matching the pattern already used by `vgbr-rf`
  and the (deleted) first VGBR-R attempt.
- `EXPECTED_SUBJECT_HASH` is deliberately left `null` in Phase 1. Phase 2's
  own preflight computes it as a git-blob-identity hash over exactly the
  benchmark subject inputs (`package.json`, `src/cli`, `assets`,
  `scripts/run-harness-profile-benchmark.ts`,
  `scripts/validate-harness-profile-benchmark.ts`,
  `evals/harness/scenarios.json`, `evals/fixtures/harness-matrix`) via
  `git ls-tree -r <sha> -- <paths> | sort | shasum -a 256` from the detached
  checkout immediately before invocation — independent of, and in addition
  to, the runner's own internal evidence hashes.
- No compatibility, alias, dual authority, or steady-state shim: this
  package neither retires nor replaces anything; it only recovers evidence.
  See the No-Compatibility Declaration below.
- The profile-base naming is fixed by the current runner (`no-harness` /
  `adaptive-lite` / `strict-harness`, `adaptive-lite` deploying the standard
  profile); this package restores that runner-defined baseline and does not
  redesign it. A four-arm Lite/Standard/Strict redesign is explicitly out of
  scope.

## Scope

- In scope: this package's plan/contract/review/notes; the attempt record
  under `.ai/harness/runs/vgbr-r/`; the disposable control clone and detached
  subject checkout and `REPORT_STAGE_DIR` as ephemeral working directories
  (no git history of their own); (Phase 2 only) the three canonical report
  artifacts `evals/harness/reports/profile-comparison.{json,md,sha256.json}`
  and the Program dependency annotation recording the recovered baseline.
- Out of scope: `scripts/run-harness-profile-benchmark.ts`,
  `scripts/validate-harness-profile-benchmark.ts`, the benchmark manifest,
  fixtures, and matrix test (frozen, read-only); any production `src/` path;
  any LSC/HRD/SSD/`vgbr-rf`/BDD2 artifact; running the benchmark itself in
  Phase 1; any `--profile`/`--scenario`/`--regrade-existing` flag; a
  four-arm benchmark redesign; push, PR open, or merge in Phase 1.
- Non-goals: re-verifying `vgbr-rf`'s own fix or ESA/LSC/HRD semantics;
  independently proving Lite/Standard/Strict profile equivalence beyond what
  the runner already defines; re-litigating the original VGBR ordering gap
  beyond the one Program annotation edit; producing a causal (rather than
  descriptive) before/after comparison — that determination belongs to
  EPC-09's matched post-eval decision, not this package.
- Taste constraints: match the sprint's Row 3 protocol text verbatim where it
  specifies exact commands, rubric lines, or forbidden flags; smallest
  change that satisfies Phase 1's goal.

## Stop Conditions

- Stop and hand back to the parent if a required edit falls outside this
  contract's exact `allowed_paths`.
- Stop if `origin/main` has moved past `b32b328208da5b07418c4fd815491bcc3913ff9f`
  before the control clone, orchestration worktree, or subject checkout are
  created — re-fetch and re-audit, never silently rebase or re-pin without
  reporting.
- Stop if the canonical tooling refuses or requires input this package
  cannot supply; report the exact error instead of hand-building a bypass.
- Stop if any Phase-1 step would require running the benchmark runner or
  validator, or passing `--profile`/`--scenario`/`--regrade-existing`.
- Stop after three fail-fix-reverify rounds for one preflight issue.

## Falsifier

The direction is wrong if recovering the baseline requires editing the
runner, manifest, fixtures, validator, or any production `src/` path in
Phase 1, or if the recovered baseline could be described as a pure post-HRD
baseline without the full acknowledged-parallel-change annotation. Cheapest
proof: diff the detached subject checkout against `VGBR_BASELINE_SHA` after
Phase 1 setup and confirm it is byte-identical and untouched (`git status
--porcelain` empty, `git rev-parse HEAD` unchanged), and confirm the mandatory
annotation text is present verbatim and the phrase "pure post-HRD" never
appears in this plan, contract, or notes.

## Cheapest Sufficient Proof

- `origin/main` fresh fetch equals local `main` HEAD equals
  `VGBR_BASELINE_SHA` (`b32b328208da5b07418c4fd815491bcc3913ff9f`) at start.
- Control clone: repointed to the real remote, fast-forwarded, `git
  rev-parse HEAD` equals the pinned SHA, `git status --porcelain` empty.
- Orchestration worktree branch is exactly `codex/vgbr-r2-baseline-recovery`,
  HEAD equals the pinned SHA.
- Detached subject checkout: `git status --porcelain` empty, `git rev-parse
  HEAD` equals the pinned SHA, no writes performed inside it.
- `REPORT_STAGE_DIR` exists and is empty.
- Attempt record exists with `outcome: null`, `started_at: null`,
  `EXPECTED_SUBJECT_HASH: null` (by design), and every other Row-3 field
  concrete (`ATTEMPT_ID`, `EXPECTED_SUBJECT_SHA`, `command_sha256`,
  `provider`, `provider_cli_version`).
- `contract-run preflight --json` and `check-task-workflow --strict` both
  pass.
- Every changed path in the Phase 1 commit is inside `allowed_paths` below.

## Root Cause Evidence

Not applicable: this is `eval-only`, not `bugfix`.

## Concurrency and Ownership

- This package owns exactly the paths in `allowed_paths` below; it does not
  touch any other package's plan, contract, review, notes, or code surface,
  including the currently in-flight `vgbr-benchmark-runner-subject-immutability`
  worktree (already merged as `vgbr-rf`, but its worktree/branch remain a
  separate package's surface until that package's own closeout removes them).
- From the moment `VGBR_BASELINE_SHA` is pinned until this package's report
  PR merges, `main` is frozen for any PR touching `package.json`, `src/cli`,
  `assets`, the runner/validator scripts, `evals/harness/scenarios.json`, or
  benchmark fixtures (sprint R2/R3). PR #112 (bulk plan archive) is exempt.
  Parallel programs may continue in their own worktrees but must not merge a
  subject-touching change inside this window.
- If an out-of-band merge lands on `main` touching the benchmark subject
  during the freeze, the attempt is void: stop, re-audit, re-pin — never
  rebase silently and never reuse the stale attempt record.

## No-Compatibility Declaration

This package introduces no alias, dual read/write path, semantic fallback,
or steady-state migration shim. It does not retire or replace any existing
authority; it only recovers one authoritative benchmark baseline. The prior
`invalid_report` attempt and its branch/worktree are deleted evidence,
captured in the sprint's Attempt ledger and this contract's `Why`/`P2`
sections — never silently reused, aliased, or re-authored.

## Workflow Inventory

- Source plan: `plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md`
- Deferred-goal ledger: `tasks/todos.md` (untouched by this package)
- Review file: `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md`
- Notes file: `tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots / attempt record: `.ai/harness/runs/vgbr-r/`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate (Phase 2 closeout, not this run): `verify-sprint
  --prepare-acceptance`, one typed AcceptanceReceipt under the Acceptance
  Policy below, then `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md
  - tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md
  - tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md
  - tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md
  - .ai/harness/runs/vgbr-r/
  - .ai/harness/worktrees/vgbr-r2-baseline-recovery.json
  - plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md
  - evals/harness/reports/profile-comparison.json
  - evals/harness/reports/profile-comparison.md
  - evals/harness/reports/profile-comparison.sha256.json
```

## Forbidden Paths and Actions

```yaml
forbidden:
  paths:
    - scripts/run-harness-profile-benchmark.ts
    - scripts/validate-harness-profile-benchmark.ts
    - evals/harness/scenarios.json
    - evals/fixtures/harness-matrix
    - src/
    - assets/
    - package.json
    - any LSC/HRD/SSD artifact
    - any BDD2 or vgbr-rf plan/contract/review/notes/code artifact
  flags:
    - --profile
    - --scenario
    - --regrade-existing
    - any git --force flag
  actions:
    - running the benchmark runner or validator in Phase 1
    - git restore/stash/clean/reset in the root checkout
    - push, PR open, or merge in Phase 1
```

## Evidence Requirements

```yaml
evidence_requirements:
  # This contract consumes the harness profile benchmark matrix (Phase 2).
  benchmark: required
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: 1
    wall_time_minutes: 40
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md
    - tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md
    - tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md
    - tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/vgbr-r/attempt-vgbr-b32b3282-20260722-a01.json
  tests_pass:
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Detached subject checkout git status --porcelain is empty and git rev-parse HEAD equals b32b328208da5b07418c4fd815491bcc3913ff9f"
    - "REPORT_STAGE_DIR exists and is empty"
    - "Mandatory annotation wording is present verbatim in the plan and never says 'pure post-HRD'"
```

### Machine acceptance rubric (Phase 2 closeout — frozen verbatim from the sprint, not evaluated by this Phase-1 run)

```text
authoritative == true
source_commit == EXPECTED_SUBJECT_SHA
subject hash matches the detached checkout
profile bases exactly: no-harness / adaptive-lite / strict-harness
scenarios exactly 9; records exactly 27; each (profile_base, scenario_id) unique
workspace and provider home isolated and unique
structured provider/grader records complete; report byte binding valid
validator and matrix test pass; no subject drift; no second invocation
```

## Manual Acceptance

- Reviewer (`Claude`, per Acceptance Policy) confirms, at Phase 2 closeout
  only: the mandatory annotation wording is present verbatim and "pure
  post-HRD" never appears; the attempt record shows exactly one invocation
  with a terminal outcome; the frozen rubric above is satisfied by the
  promoted report; no path outside `allowed_paths` changed.
- For this Phase-1 run specifically: reviewer confirms the detached subject
  checkout is untouched, `REPORT_STAGE_DIR` is empty, and the attempt
  record's `outcome`/`started_at`/`EXPECTED_SUBJECT_HASH` are all `null`
  (no invocation has occurred).

## Acceptance Notes (Human Review)

- Functional behavior: Phase 1 changes no runtime, benchmark, or production
  behavior — only workflow artifacts, an ephemeral control clone, a detached
  read-only checkout, and an empty staging directory.
- Edge cases: `origin/main` moving during Phase 1 setup (stop and re-audit,
  per Stop Conditions); the known Edit-tool-in-sibling-worktree hook defect
  (worked around with Bash read-modify-write where it manifested; see notes).
- Regression risks: none in Phase 1 (no code path executes); Phase 2 carries
  the risk that the `vgbr-rf` fix does not fully eliminate subject drift,
  mitigated by the frozen rubric's `subject hash matches the detached
  checkout` and `no subject drift` checks.

## Rollback

Phase 1 produces only local, unpushed commits in the orchestration worktree
plus three ephemeral directories with no git history of their own: the
control clone, the detached subject checkout, and `REPORT_STAGE_DIR`.
Rollback: delete the orchestration worktree's local commits or discard the
worktree entirely with `git worktree remove` (run from the control clone,
never the root checkout); remove the detached subject checkout with `git
worktree remove` (safe: read-only and clean by construction); delete the
control clone and `REPORT_STAGE_DIR` directories outright (plain
directories outside any tracked git history). The root checkout is untouched
throughout Phase 1 and requires no rollback action.
