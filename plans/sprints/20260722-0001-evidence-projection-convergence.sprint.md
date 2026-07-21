# Sprint: Evidence & Projection Convergence

> **Status**: Approved
> **Direction Approval**: Approved — Codex execution draft reviewed by Fable (2026-07-21) and by external GPT review (`docs/researches/20270721-EPC.research.md`), joint verdict: approve with required amendments. All required amendments are incorporated below as normative rules. Execution approved by the user on 2026-07-22.
> **Slug**: evidence-projection-convergence
> **Created**: 2026-07-22 00:01
> **Source Audit**: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (Sprint C backlog, EPC-01..09)
> **Source Spec**: `docs/spec.md`
> **HRD Runtime SHA**: `b5a98c903d3728002d2f663ba7a1b421913e368f` (PR #106 merge; historical fact, never re-pinned)
> **HRD Closeout**: PR #108 (`dbcfbe75`) merged 2026-07-21; HRD sprint header is `Done`. The closeout row of this sprint is already complete.
> **Acknowledged Parallel Change**: BDD2 followthrough PR #109 (merge `9e9dce6e1f817b766d21436c0b69477f6c67ca20`) landed after HRD closeout and touches `src/cli` and `assets` — both are benchmark subject inputs. The recovery baseline is therefore the **current pre-EPC baseline after HRD and acknowledged parallel changes**. No artifact in this Program may describe it as a pure post-HRD baseline.
> **Predecessor**: Hook Runtime Diet (Sprint B, Done). ESA (minus deferred ESA-06), LSC 8/8, and HRD-01..09 are frozen inputs, not change surfaces.
> **Successor Order**: Skill Surface & Discovery Convergence (SSD). `plans/plan-20260715-1140-skill-surface-discovery-convergence.md` stays Draft and no-touch until EPC-09 merges and `POST_EPC_SHA` is pinned.
> **Goal Mode**: incremental

This is the machine-operable Sprint C projection of the preserved Harness Loop
Program audit. Each backlog row is an independent work-package, worktree,
branch, PR, verification subject, and rollback boundary. EPC unifies the
evidence ledger, checkpointing, and recovery projections; it deletes shadow
authorities (`checks/latest` direct authoring, independent handoff/resume/
current writers) in the same packages that replace them. No alias, dual
read/write, semantic fallback, or steady-state migration shim is permitted
anywhere in this sprint.

## Program Rules (normative for every row)

### R1 — Successor-pinned SHA rule

A package records the exact base SHA it consumed. It never predicts or
records its own merge SHA. The first dependent successor fetches
`origin/main` after the predecessor merges, pins that exact SHA in its own
contract, and records it as `POST_<PREDECESSOR>_SHA`. Concretely:

- `VGBR_BASELINE_SHA` — pinned by the VGBR-R contract at fresh fetch time.
  First pinned `0852e9ab` (2026-07-22); superseded before any invocation
  consumed it — re-pinned after `vgbr-rf` merges (see Attempt ledger).
- `POST_VGBR_SHA` — pinned by the EPC-00 contract after VGBR-R merges.
- `POST_EPC_SHA` — pinned by the SSD activation contract after EPC-09 merges.

### R2 — Two-layer concurrency gate

Layer 1 (repository ownership): a package may start only if its candidate
changed paths intersect no other active package's `allowed_paths`.
Layer 2 (verification subject): while any package holds a frozen verification
subject, no PR whose changed paths intersect that subject's inputs may merge
to `main`. For the benchmark subject the inputs are: `package.json`,
`src/cli`, `assets`, `scripts/run-harness-profile-benchmark.ts`,
`scripts/validate-harness-profile-benchmark.ts`, `evals/harness/scenarios.json`,
and benchmark fixtures. Layer 2 dominates: path-disjointness alone never
authorizes a merge during a subject freeze.

### R3 — VGBR subject quiescence gate

From the moment VGBR-R pins `VGBR_BASELINE_SHA` until its report PR merges,
`main` is frozen for any PR touching the benchmark subject inputs listed in
R2. Parallel programs (including any future BDD2 slice) may continue in their
worktrees but must not merge inside the window. If an out-of-band merge lands
anyway, the attempt is void: stop, re-audit, re-pin — never rebase silently
and never reuse the stale attempt record.

### R4 — Serial by default

All rows execute serially in backlog order. EPC-02/03/04 may run as a
parallel wave only if, after EPC-01 merges, their three contracts jointly
prove: schema, trust matrix, and idempotency frozen; exact `allowed_paths`
disjoint; test fixtures disjoint; no shared barrel/export file; no shared
store writer; no shared projection writer. Any shared surface voids the
qualification and the wave reverts to serial. Parallelism is a qualification
to be earned, not a default to fall back from.

### R5 — Same-package cutover

Every authority cutover deletes the retired writer/authoring path in the same
package: EPC-05 deletes direct `checks/latest` authoring, EPC-07 deletes
retired recovery-view writers, EPC-08 completes the Context Packet cutover.
EPC-09 carries no live dual-mode migration; residue found there is a defect
of the earlier package, fixed by a follow-up to that package's surface.

### R6 — Contract template and machine gates

Every row's contract carries the full field set (Status, Task Profile, Owner/
reviewer/waiver policy, Base SHA/target branch/PR unit, Why, Goal, P1/P2/P3,
In/Out of Scope, Non-goals, Falsifier, Cheapest Sufficient Proof, exact
`allowed_paths`, forbidden paths/actions, Evidence Requirements, Delegation
Contract, Machine Exit Criteria, Manual Acceptance, Stop Conditions,
Rollback, Concurrency/ownership, No-compatibility declaration). Machine gates
for every row:

```text
HEAD == origin/main == pinned base SHA at start
worktree clean (fresh worktree from origin/main, never the root checkout)
candidate paths have no active owner (R2 layer 1)
changed paths ⊆ allowed_paths
subject hash frozen before acceptance; no drift after
fail-fix-reverify ≤ 3 rounds per issue, then stop and escalate
```

Preflight before execution, per row:

```bash
repo-harness run contract-run preflight --contract <contract> --repo <wt> --json
repo-harness run check-task-workflow --strict
```

## Backlog

Ordered execution queue. Every row is an independent PR with a
machine-checkable acceptance line.

| # | Status | Task | Mode | Acceptance | Plan |
|---:|:---:|---|---|---|---|
| 1 | [x] | `hrd-sprint-closeout` — HRD lifecycle ledger closeout | contract | Done via PR #108 (`dbcfbe75`); HRD sprint header `Done`, lifecycle projections reconciled, docs-only | `plans/plan-20260721-2104-hrd-sprint-closeout.md` |
| 2 | [ ] | `vgbr-rf` — benchmark runner subject immutability fix | contract | Runner setup provably mutates nothing in the frozen subject (observed defect: local-source install flips `src/cli/index.ts` and `src/cli/hook-entry.ts` from mode 0755 to 0777 mid-run); subject hash identical before/after a full runner setup, regression-guarded; in-flight branch `codex/vgbr-benchmark-runner-subject-immutability` is the candidate implementation, ownership adjudication pending | (in flight) |
| 3 | [ ] | `vgbr-r` — authoritative baseline recovery (eval-only) | contract | One authoritative 3×9 (27-arm) benchmark invocation at the re-pinned post-`vgbr-rf` `VGBR_BASELINE_SHA` in a detached clean subject checkout; validator + matrix test pass; attempt record shows exactly one invocation; report merged with parallel-change annotation | `plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md` |
| 4 | [ ] | `epc-00` — Program reconciliation and design freeze (docs-only) | contract | All nine design decisions (D1–D9 below) frozen with explicit choices; `POST_VGBR_SHA` pinned; sprint rows 5–13 confirmed machine-operable; no production code, `tasks/current.md`, or LSC/HRD semantics touched | (create at execution) |
| 5 | [ ] | `epc-01` — EvidenceEvent protocol and event store | contract | Single `EvidenceEvent` schema with frozen identity/trust/subject fields; atomic append-only per-worktree store with replay determinism and corrupt-tail recovery tests; no consumer cutover in this package | (create at execution) |
| 6 | [ ] | `epc-02` — authoritative verify producer | contract | Verify runner emits subject-bound `authoritative_machine` events only; non-subject-bound emission is impossible by construction; fixtures prove subject mismatch fails closed | (create at execution) |
| 7 | [ ] | `epc-03` — PostBash observed importer | contract | PostBash imports are `observed` trust class only and can never satisfy a machine gate; fixtures prove an observed-only ledger leaves gates unsatisfied | (create at execution) |
| 8 | [ ] | `epc-04` — manual/external attested import | contract | Manual and external evidence require trust, actor, reason, and subject fields; `external_attested` satisfies gates only where a contract explicitly allows; malformed imports fail closed | (create at execution) |
| 9 | [ ] | `epc-05` — checks/latest materializer | contract | `checks/latest` is materialized only from the ledger via exact-subject selection (D7); every direct authoring path deleted in this package; no-independent-authoring test passes | (create at execution) |
| 10 | [ ] | `epc-06` — checkpoint materialization | contract | One checkpoint materialization transaction: accepted events → canonical machine projection → deterministically derived human view; staged install with last-published marker; partial generation detected and rejected; Markdown never becomes writable authority | (create at execution) |
| 11 | [ ] | `epc-07` — recovery-view inventory and minimal cutover | contract | Consumer inventory for handoff/resume/current/task-handoff complete with keep/merge/retire verdicts; surviving views get one materializer each; retired writers deleted same-package; projection-drift and no-independent-authoring tests pass | (create at execution) |
| 12 | [ ] | `epc-08` — Context Packet cutover | contract | SessionStart Context Packet served from canonical projections; token budget and p95 measured against the audit's targets with evidence in the report; old assembly path deleted same-package | (create at execution) |
| 13 | [ ] | `epc-09` — drift check, matched post-eval, release closeout | contract | Cross-package projection-drift check green; deprecation residue scan clean; one matched post-EPC benchmark (same runner/manifest/profiles/rubric, one invocation, descriptive comparison); release notes and Program closeout merged | (create at execution) |

## Row 3 — VGBR-R protocol

`Task Profile: eval-only`. Purpose: recover a precise, current, verifiable
authoritative baseline before EPC. Not a re-litigation of history; the
Program annotation records the original VGBR ordering gap and the post-HRD
recovery decision (finalized in EPC-00).

### Dual-checkout structure (mandatory)

A single worktree cannot simultaneously hold uncommitted plan/contract files
and present a clean checkout at the pinned SHA, so:

- **Orchestration worktree** (`codex/vgbr-post-hrd-baseline-recovery`): owns
  plan, contract, review, notes, Program annotation edits, attempt record,
  and the final canonical report artifacts.
- **Detached subject checkout**: fresh checkout at exactly
  `VGBR_BASELINE_SHA`, detached HEAD, clean, read-only subject. No task
  workflow files, no active-plan projection, no commits, ever.

Contract variables: `CONTROL_REPO`, `SUBJECT_REPO`, `EXPECTED_BASE_SHA`,
`EXPECTED_SUBJECT_SHA`, `EXPECTED_SUBJECT_HASH`, `REPORT_STAGE_DIR`
(outside the subject checkout), `ATTEMPT_ID`.

### Attempt record (before invocation)

Written to the orchestration worktree's run evidence before the run starts:
`ATTEMPT_ID`, `EXPECTED_SUBJECT_SHA`, `EXPECTED_SUBJECT_HASH`, `started_at`,
`command_sha256`, `provider`, `provider_cli_version`. Outcome is exactly one
of `accepted | failed_before_provider | failed_during_run | invalid_report |
cancelled`. Any non-`accepted` outcome: no automatic rerun, no
`--regrade-existing`, no narrowed `--profile`/`--scenario` backfill — a new
run requires a new approved run-decision (waiver or new contract).

### Invocation (exactly once, in the detached subject checkout)

```bash
bun scripts/run-harness-profile-benchmark.ts \
  --require-authoritative \
  --provider codex \
  --manifest evals/harness/scenarios.json \
  --report "$REPORT_STAGE_DIR/profile-comparison.json"
```

Forbidden flags: `--profile`, `--scenario`, `--regrade-existing`.
Operator budget 25–40 minutes is advisory only; the runner's own 50-minute
wall-clock budget (`BENCHMARK_WALL_TIME_BUDGET_MS`) is the sole hard limit.
Exceeding 40 minutes but finishing under the hard wall does not invalidate
the attempt.

### Validation (same detached subject checkout), then promotion

```bash
bun scripts/validate-harness-profile-benchmark.ts \
  --report "$REPORT_STAGE_DIR/profile-comparison.json" \
  --require-authoritative \
  --format json

bun test tests/harness-benchmark-matrix.test.ts
```

Only after both pass are the artifacts copied into the orchestration
worktree's canonical paths (`evals/harness/reports/profile-comparison.json`,
`.md`, `.sha256.json`) and re-checked for byte binding there.

### Machine acceptance rubric (frozen before invocation)

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

The profile naming is fixed by the current runner: the matrix has no
independent Lite vs Standard arms (`adaptive-lite` deploys the standard
profile). VGBR-R restores the runner-defined authoritative 3×9 baseline; it
never claims to have independently verified Lite/Standard/Strict semantics.
A four-arm redesign would be a separate approved benchmark-design package,
out of scope here. The prior report at `606b02c1...` is historical evidence
only and satisfies nothing.

### Allowed paths

Only: this package's plan/contract/review/notes, the Program dependency
annotation, the attempt record, and the three canonical report files.
Forbidden: runner, manifest, tests, production `src/`, LSC/HRD/SSD
artifacts, any compatibility or fallback surface.

### Attempt ledger

- `vgbr-dbcfbe75-20260721-a01` (2026-07-21 21:41–22:18, base `dbcfbe75`,
  preserved at `origin/codex/vgbr-post-hrd-baseline-recovery` @ `40a33be4`):
  27/27 producer arms passed and the validator/matrix test passed, but the
  runner's local-source install step mutated the frozen subject mid-run
  (file modes `0755` → `0777` on `src/cli/index.ts`, `src/cli/hook-entry.ts`).
  Correctly self-classified `invalid_report`; no canonical report bytes were
  copied. Consumed; never rerun. Its recorded conclusion — a separately
  approved runner-fix package plus a new approved attempt contract — is what
  backlog row 2 (`vgbr-rf`) implements.
- The next attempt starts only after `vgbr-rf` merges: fresh fetch, re-pin
  `VGBR_BASELINE_SHA`, new contract, new attempt record, and a fresh branch
  name — the original slug's branch is attempt evidence, never revived.

## Row 4 — EPC-00 design freeze (D1–D9)

EPC-00 is the activation authorization for EPC-01: implementation may not
begin until each decision below is frozen in the EPC-00 deliverable.
Recommended defaults are listed; EPC-00 confirms or replaces them with
rationale.

- **D1 Ledger topology** — default: `.ai/harness/evidence/events/`
  per-worktree and gitignored; `.ai/harness/evidence/blobs/`
  content-addressed and gitignored; tracked reviews/receipts reference
  accepted event IDs and hashes only. No shared mutable store across
  worktrees. Retention, compaction, branch/reset behavior, and cleanup
  ownership decided here.
- **D2 Cutover epoch** — `ledger_epoch_start_sha` = exact EPC-01 cutover
  base. Pre-epoch artifacts are legacy evidence: readable, never backfilled.
- **D3 Subject identity** — richer than a HEAD SHA: authority/base/target
  commits, scope hash, subject hash, contract hash, command hash,
  environment/provider identity.
- **D4 Trust matrix** — `authoritative_machine` (exact subject only) |
  `observed` (never satisfies machine gates) | `human_acceptance` (manual
  gates only) | `external_attested` (only where a contract explicitly
  allows). Projections carry no independent trust and can never satisfy a
  gate. `checks/latest`, handoff, and Markdown projections can never be
  re-promoted to authority.
- **D5 Event identity and replay** — event-id generation, idempotency key,
  ordering, supersedes relation, duplicate-import behavior, replay
  determinism, corrupt-tail recovery.
- **D6 Blob and safety policy** — max payload, secret redaction,
  absolute-path prohibition, symlink handling, binary evidence, hash
  algorithm, blob ownership.
- **D7 `checks/latest` selection rule** — deterministic: current worktree +
  active contract + exact subject + accepted trust class + deterministic
  event order. Never mtime, filename recency, or last-writer-wins.
- **D8 Projection provenance** — every projection carries schema_version,
  generated_at, source_event_ids, source_checkpoint_id, subject_hash,
  materializer_version, so drift is provable.
- **D9 Recovery-view minimization** — consumer inventory over handoff /
  resume / `tasks/current` / task-handoff with an explicit keep/merge/retire
  verdict per view. Rebuilding all four is not a goal; surviving views only.

EPC-00 also: pins `POST_VGBR_SHA` (R1); records the original VGBR ordering
gap, the post-HRD recovery decision, and the acknowledged BDD2 parallel
change in the Program annotation; confirms rows 5–13 acceptance lines;
defines the Context Packet token/p95 acceptance numbers for EPC-08 from the
audit's targets; and confirms the EPC-09 matched post-eval decision below.

## Row 13 — EPC-09 matched post-eval decision

Decision (confirmed here, re-affirmed in EPC-00): EPC-09 runs **one matched
post-EPC benchmark** — same runner, same manifest, same three profile bases,
same provider/CLI, same acceptance rubric, frozen post-EPC subject, exactly
one invocation, same attempt-record and no-auto-rerun rules as VGBR-R. The
before/after comparison is reported as **descriptive evidence**, not causal
proof, because the runner does not pin the provider model. If the matched
run cannot be executed, the VGBR report must be relabeled `descriptive
pre-EPC baseline only` and the release closeout must not claim benchmark
improvement.

## SSD activation gate (successor handoff)

SSD activates only when all of the following hold, verified by the SSD
activation contract itself (R1):

```text
EPC-09 merged; fresh fetch; exact POST_EPC_SHA pinned in the SSD contract
no active EPC writer anywhere
cross-package projection-drift closeout green
SSD absorbs no EPC runtime, compatibility, or migration work
SSD keeps its own contract, worktree, branch, and PR
```

## Worktree and branch naming

```text
codex/vgbr-benchmark-runner-subject-immutability   (vgbr-rf, in flight)
codex/vgbr-r2-baseline-recovery                    (vgbr-r; fresh name — the
  original slug branch is voided-attempt evidence and is not revived)
codex/epc-00-program-canonicalization
codex/epc-01-evidence-event-store
codex/epc-02-authoritative-verify-producer
codex/epc-03-postbash-observed-importer
codex/epc-04-manual-external-attested-import
codex/epc-05-checks-latest-materializer
codex/epc-06-checkpoint-materialization
codex/epc-07-recovery-view-cutover
codex/epc-08-context-packet-cutover
codex/epc-09-drift-eval-release
```

Startup gates for every row: never the root checkout; fresh fetch and
re-verify `origin/main` equals the pinned base (stop and re-audit on drift,
never auto-rebase); no `--force` revival of retired HRD/LSC slugs; each
merge pins the next base via R1 before the dependent row starts.

## Verification surface

Implementation phase runs targeted checks only. Each code package runs its
full contract-required closeout evidence exactly once after code freeze.
Expensive evidence or semantic review already accepted against an unchanged
frozen subject is never regenerated. Root required checks
(`bun test`, `check-deploy-sql-order`, `check-architecture-sync`,
`check-task-sync`, `check-task-workflow --strict`, `inspect-project-state`,
`adopt --dry-run`) run at each package's closeout, not per-edit.
