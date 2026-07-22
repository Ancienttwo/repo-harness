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

## PRD

### Problem

Verification evidence and recovery projections have no single authority.
`checks/latest` files are authored directly by whichever writer runs last;
handoff, resume, `tasks/current`, and task-handoff are written by independent
scripts; and gates read these mutable surfaces as if they were truth. Trust
levels are implicit, so an observed PostBash side effect is indistinguishable
from authoritative verification, and a hand-edited Markdown projection can
silently satisfy an acceptance gate. The Program also lost its ordered
benchmark baseline: the only authoritative report predates ESA-era `src/cli`
and `assets` changes, and the first recovery attempt was voided by the runner
itself mutating the frozen subject mid-run.

### Users

- Agents whose edit/stop/ship gates must consume evidence that is provably
  authoritative, subject-bound, and current.
- Maintainers who need recovery surfaces (handoff/resume/current) to be
  reproducible projections of one ledger instead of divergent hand-written
  files.
- Operators who need a trustworthy pre-EPC benchmark baseline and a matched
  post-EPC comparison to judge what the convergence cost or bought.

### Success Criteria

- One `EvidenceEvent` ledger with typed trust classes is the sole evidence
  authority; every gate decision traces to accepted event IDs.
- `checks/latest`, checkpoints, and every surviving recovery view are
  deterministic materializations with provenance, and their legacy writers
  are deleted in the same packages that replace them.
- The Context Packet is served from canonical projections within the audit's
  token and p95 targets, with measured evidence.
- An authoritative 27-arm benchmark baseline exists for the exact pre-EPC
  subject, produced by a runner that provably cannot mutate that subject, and
  a matched post-EPC run reports the descriptive delta.

### Non-goals

- Re-implementing or re-verifying frozen ESA, LSC, or HRD semantics.
- Any SSD skill-surface or discovery work before `POST_EPC_SHA` is pinned.
- Benchmark redesign (four-arm split, provider pinning) — separate approved
  packages if ever wanted.
- Steady-state compatibility: no alias, dual read/write, fallback, or
  long-lived migration shim anywhere in this Program.

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
  Pinned: `ba0e3970e733b34306a2c16cec31547483a2c648` (2026-07-22, fresh
  fetch verified equal to `origin/main` and local `main` at pin time; the
  VGBR-R row-flip commit).
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

## Program annotation — VGBR baseline provenance (finalized by EPC-00)

The Program originally lost its ordered benchmark baseline: the only
prior authoritative report (`606b02c1...`) predates ESA-era `src/cli`
and `assets` changes and the runner's subject-immutability fix, so it
satisfies nothing under the current subject definition. VGBR-R was
therefore run *after* HRD closeout as a deliberate recovery — not a
re-litigation of history and never a claim that LSC or any earlier
package consumed this baseline at the time. The authoritative baseline
is `VGBR_BASELINE_SHA = b32b3282`, attempt
`vgbr-b32b3282-20260722-a01`, 27/27 arms, canonical reports at
`evals/harness/reports/profile-comparison.{json,md,sha256.json}`.
Because BDD2 follow-through (PR #109, merge `9e9dce6e...`) landed after
HRD closeout and touched `src/cli` and `assets` — both benchmark
subject inputs — this baseline is annotated as the **current pre-EPC
baseline after HRD and acknowledged parallel changes**, and no artifact
in this Program may describe it as a pure post-HRD baseline.
`POST_VGBR_SHA = ba0e3970...` (VGBR-R PR #115 merged; subject
quiescence lifted) is the EPC-00-pinned base for the EPC arc.

## Backlog

Ordered execution queue. Every row is an independent PR with a
machine-checkable acceptance line.

| # | Status | Task | Mode | Acceptance | Plan |
|---:|:---:|---|---|---|---|
| 1 | [x] | `hrd-sprint-closeout` — HRD lifecycle ledger closeout | contract | Done via PR #108 (`dbcfbe75`); HRD sprint header `Done`, lifecycle projections reconciled, docs-only | `plans/plan-20260721-2104-hrd-sprint-closeout.md` |
| 2 | [x] | `vgbr-rf` — benchmark runner subject immutability fix | contract | Done via PR #113 (`51a2ee7d`): ROOT is no longer an install source (external hash-pinned pack artifact, isolated `BUN_INSTALL`), subject re-asserted fail-closed at four phases, mode-drift regression guard red-then-green; 28/28 exit criteria + external_pass receipt at base `61b5ec59` | `plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md` |
| 3 | [x] | `vgbr-r` — authoritative baseline recovery (eval-only) | contract | Done via PR #115 (`904cd024`): one authoritative invocation at `VGBR_BASELINE_SHA = b32b3282` (attempt `vgbr-b32b3282-20260722-a01`, 27/27 arms, 15m37s), subject frozen and recomputed identical, validator byte-binding held at stage and canonical, 12/12 criteria + external_pass receipt; baseline annotated as current pre-EPC after HRD and acknowledged parallel changes | `plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md` |
| 4 | [x] | `epc-00` — Program reconciliation and design freeze (docs-only) | contract | Done via PR #116 (`7871f174`): `POST_VGBR_SHA` pinned at `ba0e3970`, D1–D9 frozen with closed sub-decisions, Program annotation finalized, rows 5–11 confirmed machine-operable as written, rows 12/13 amended machine-checkable; docs-only, external_pass receipt at base `ba0e3970` | `plans/plan-20260722-1107-epc-00-program-canonicalization.md` |
| 5 | [x] | `epc-01` — EvidenceEvent protocol and event store | contract | Done via PR #117 (`d94d1364`): EvidenceEvent schema per frozen D3/D4/D5, atomic append-only store with genesis/epoch fail-closed (D2), blob store with D6 construction invariants, deterministic replay + corrupt-tail quarantine; 31 red-first tests, full suite 1711 pass; zero consumer cutover; external_pass receipt at base `5228d4ea` | `plans/plan-20260722-1151-epc-01-evidence-event-store.md` |
| 6 | [x] | `epc-02` — authoritative verify producer | contract | Done via PR #118 (`61657769`): verify runner emits subject-bound `authoritative_machine` events with construction-computed D3 identity; epoch constant `LEDGER_EPOCH_START_SHA` single-sourced; cannot-bind refusals skip (exit 3, no fabrication), subject mismatch fails closed; live ledger dogfood readback; 11 red-first tests, full suite 1722 pass; external_pass receipt at base `a8cae4d7` | `plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md` |
| 7 | [x] | `epc-03` — PostBash observed importer | contract | Done via PR #119 (`691930c0`): PostBash observations import as `observed`-only events with unbound-sentinel identity degradation; observed-only ledger provably leaves the authoritative filter empty; failure semantics match the existing write path; 12 red-first tests, full suite 1734 pass; wave disjointness with EPC-04 held; external_pass receipt at base `8861b40d` | `plans/plan-20260722-1810-epc-03-postbash-observed-importer.md` |
| 8 | [x] | `epc-04` — manual/external attested import | contract | Done via PR #120 (`79f1190a`): receipt record imports as attested events via closed trust mapping with required actor/reason/subject fields fail-closed; CLI wiring adjudicated unskippable (sole production entry); default-deny proven at fold level; 16 red-first tests, full suite 1738 pass; wave disjointness with EPC-03 held; external_pass receipt recorded through the new wiring itself | `plans/plan-20260722-1810-epc-04-manual-external-attested-import.md` |
| 9 | [x] | `epc-05` — checks/latest materializer | contract | Done via PR #121 (`f07a11c9`): checks/latest materialized only from the ledger (frozen D7 predicate + 9-field D8 provenance); three direct authoring paths deleted/closed same-package (verify-sprint cp, workflow-state bootstrap, mutation-observed continuous-verification redirect); D6 redaction typed-field exemption fixed the round-1 CRITICAL; no-independent-authoring + behavioral tests green; full suite 1779 pass; own receipt recorded against materialized evidence; round-2 gatekeeper PASS; external_pass receipt at base `82215336` | `plans/plan-20260722-1929-epc-05-checks-latest-materializer.md` |
| 10 | [ ] | `epc-06` — checkpoint materialization | contract | One checkpoint materialization transaction: accepted events → canonical machine projection → deterministically derived human view; staged install with last-published marker; partial generation detected and rejected; Markdown never becomes writable authority | (create at execution) |
| 11 | [ ] | `epc-07` — recovery-view inventory and minimal cutover | contract | Consumer inventory for handoff/resume/current/task-handoff complete with keep/merge/retire verdicts; surviving views get one materializer each; retired writers deleted same-package; projection-drift and no-independent-authoring tests pass | (create at execution) |
| 12 | [ ] | `epc-08` — Context Packet cutover | contract | SessionStart Context Packet served from canonical projections; across the 27-state Authority×Profile panel every sample has estimated_tokens <= 1500 and within_budget == true, and panel p95(estimated_tokens) <= 700 (method utf8_bytes_div_4), with the per-sample table in the report; old assembly path deleted same-package | (create at execution) |
| 13 | [ ] | `epc-09` — drift check, matched post-eval, release closeout | contract | Cross-package projection-drift check green; deprecation residue scan clean against a checked-in retired-paths/symbols list (union of EPC-05/07/08 deletions, zero hits); one matched post-EPC benchmark (same runner/manifest/profiles/rubric, one invocation, descriptive comparison) or, if not executed, the VGBR report relabeled "descriptive pre-EPC baseline only" with no benchmark-improvement claim as a checked closeout assertion; release notes and Program closeout merged | (create at execution) |

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
  branch `codex/vgbr-post-hrd-baseline-recovery` @ `40a33be4` — deleted with
  its worktree after this ledger captured the conclusions, user decision
  2026-07-22):
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

### Frozen decisions (EPC-00, 2026-07-22)

Frozen by EPC-00 at `POST_VGBR_SHA = ba0e3970`. Each decision below is
the Program's design authority for rows 5–13; later contracts cite
these decisions and do not re-decide them. Current-state anchors:
`verify-sprint` writes `.ai/harness/checks/latest.json`
(`scripts/verify-sprint.sh:504`); the PostBash importer writes
`checks/post-bash-latest.json` with `source: "post-bash"`
(`src/cli/hook/command-observed.ts:220`); four independent
recovery-view writers exist (`workflow_write_handoff`,
`codex-handoff-resume.sh`, `refresh-current-status.sh`,
`prepare-codex-handoff.sh`); the Context Packet budget is
`SESSION_CONTEXT_TOKEN_BUDGET = 1500` with estimator
`ceil(utf8_bytes/4)` (`src/cli/hook/session-context-budget.ts:5,52`);
the repo's uniform hash algorithm is sha256.

**D1 — Ledger topology (CONFIRMED, sub-decisions closed).**
`.ai/harness/evidence/events/` per-worktree and gitignored;
`.ai/harness/evidence/blobs/` content-addressed and gitignored; tracked
reviews/receipts reference accepted event IDs and hashes only; no
shared mutable store across worktrees. Retention: append-only within
the worktree lifetime; monthly rotation to
`.ai/harness/evidence/archive/events-YYYYMM.jsonl` (gitignored),
mirroring the existing `.ai/harness/archive/` precedent; never prune an
event while it is the newest accepted evidence for the active subject.
Compaction: checkpoint-driven only (EPC-06), never mtime; once a newer
checkpoint supersedes older events for the same `subject_hash`, the
superseded events may move to archive; the live log is never rewritten
in place. Branch/reset behavior: the store is untracked and
per-worktree, so `checkout`/`branch`/`reset --hard`/`merge` never add,
drop, or reorder events; evidence outlives a working-tree reset; a
fresh worktree starts with an empty store and writes a genesis record
on first evidence. Cleanup ownership: the worktree owns its store;
`contract-worktree finish` is the cleanup point — durable conclusions
are already promoted into tracked reviews/receipts at finish, so the
per-worktree `events/` + `blobs/` are archived or discarded with the
worktree. No global GC daemon, no cross-worktree sweep.

**D2 — Cutover epoch (REPLACED with a successor-pinned rule).**
`ledger_epoch_start_sha` is not knowable at EPC-00 time; the rule is
frozen instead: the EvidenceEvent store's genesis record captures
`ledger_epoch_start_sha` = the exact base SHA the EPC-01 contract pins
at its own fresh fetch (R1). Writing the genesis record is a hard
precondition of the first append. Pre-epoch artifacts — today's
`events.jsonl`, `checks/latest.json`, `checks/post-bash-latest.json`,
`journal/post-edit/`, `runs/*.json` — are legacy evidence:
human/tool-readable, never parsed as `EvidenceEvent`s, never
backfilled, and can never satisfy an EPC gate. Any consumer that tries
to read a pre-epoch file as an `EvidenceEvent` fails closed.

**D3 — Subject identity (CONFIRMED, exact field list frozen).**
Envelope: `schema_version`, `worktree_id`. Identity fields:
`authority_commit` (plan/contract-authorizing commit) · `base_commit`
(worktree base = the R1-pinned SHA) · `target_commit` (HEAD candidate
under evaluation) · `scope_hash` (sha256 of the ordered
`allowed_paths` set) · `subject_hash` (content hash over the frozen
subject inputs, same construction the benchmark runner uses) ·
`contract_hash` (sha256 of the active contract file) · `command_hash`
(sha256 of the exact verification command; equals the attempt-record
field `command_sha256`) · `env_provider_id` (provider +
`provider_cli_version` + isolated workspace/home id). This generalizes
the existing `subject_sha256`/`verification_evidence_sha256` binding so
a gate can distinguish "same content, different authority/target".

**D4 — Trust matrix (CONFIRMED; external_attested placement pinned).**
Four classes: `authoritative_machine` (exact-subject machine
verification only) | `observed` (never satisfies a machine gate) |
`human_acceptance` (manual gates only) | `external_attested`
(contract-gated). `external_attested` satisfies a machine gate only
where the active contract's Acceptance Policy explicitly enumerates it
(grounded in the existing `acceptance_receipt.disposition:
"external_pass"` + contract Acceptance Policy block). Default is deny:
absent an explicit allow, `external_attested` is treated as `observed`
for that gate. Projections (`checks/latest`, handoff, resume,
`tasks/current`, any Markdown) carry no independent trust and can
never be re-promoted to authority.

**D5 — Event identity and replay (REPLACED with concrete mechanics).**
`event_id`: lexicographically sortable time-embedding ULID,
`evt-<ULID>`; the existing `run-...` value is recorded as
`correlation_run_id`, not the primary key. Idempotency key:
`sha256(canonical(subject_identity ‖ event_type ‖ trust_class ‖
payload_hash ‖ producer))`; identical key ⇒ no-op dedup (re-importing
the same external attestation twice yields exactly one accepted
event). Ordering: total order by append position in the per-worktree
log — never `ts`, never mtime; `ts` and ULID are descriptive/tie-break
only. Supersedes: an event may carry `supersedes: [event_id...]`;
superseded events remain in the immutable log but are excluded from
the accepted projection; supersession is monotonic and acyclic.
Replay determinism: folding the log from genesis with the D7 selection
is a pure function — identical accepted set and identical
`checks/latest` bytes on every replay. Corrupt-tail recovery: records
append atomically (whole-line append + fsync; checkpoints use
temp-file + rename); on read, the first unparseable/truncated record
truncates the accepted log at the last valid offset (fail-closed —
never skip a corrupt middle record and continue); the discarded tail
is quarantined to `events.corrupt-<ts>` for audit.

**D6 — Blob and safety policy (CONFIRMED, numbers/rules closed).**
Max inline payload: 200 lines or 8 KiB, whichever first (reusing the
PostBash offload precedent); overflow goes to a content-addressed
blob; the event keeps only `blob_sha256` + `blob_bytes`. Redaction:
deny-by-construction — events store structured fields and hashes only;
raw environment is never captured; a fixed secret denylist (the
existing `GH_TOKEN`/`ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN`/
`SSH_AUTH_SOCK` family) plus a high-entropy-token pattern replaces any
match with `sha256:<hash>` before write; this must be a construction
invariant of the event writer, not a post-hoc scrubber. Path rules:
absolute paths prohibited in payloads — repo-relative only; fail
closed on any path escaping the repo root. Symlinks: never
dereferenced when hashing/reading subject or blob inputs; recorded as
metadata (link + target hash). Binary evidence: always offloaded to
`blobs/`, never inline (`blob_sha256`, `blob_bytes`, `content_type`).
Hash algorithm: sha256, hex, `sha256:`-prefixed — the single algorithm
already used repo-wide. Blob ownership: write-once, immutable, name =
content hash, per-worktree, no cross-worktree dedup; orphan blobs
swept at worktree finish.

**D7 — `checks/latest` selection rule (CONFIRMED, predicate frozen).**

```text
accepted := events WHERE
     worktree_id   == current worktree
 AND contract_id   == active contract
 AND subject_hash  == frozen-subject hash        (exact equality)
 AND trust_class ∈ {authoritative_machine}       (human_acceptance /
                    external_attested admitted only where the contract's
                    Acceptance Policy enumerates them — D4)
 AND event_id NOT ∈ (union of supersedes[])
winner := last(accepted ORDER BY append_position ASC)
          -- never mtime / filename recency / last-writer-wins
materialize := deterministic projection -> checks/latest.json
               carrying D8 provenance
```

No exact `subject_hash` match ⇒ `checks/latest` reports
`status: "unsatisfied"` (fail-closed); it never falls back to a stale
or different-subject event.

**D8 — Projection provenance (CONFIRMED, exact field list frozen).**
Every projection carries: `schema_version` · `generated_at` ·
`materializer_version` · `source_event_ids` (ordered accepted IDs
folded) · `source_checkpoint_id` (null when materialized directly from
the log) · `subject_hash` · `content_hash` (sha256 of the projection
payload itself) · `worktree_id` · `contract_id`. The EPC-09 drift
check recomputes a projection from `source_event_ids` and compares
`content_hash`; zero drift is green.

**D9 — Recovery-view minimization (framework + preliminary verdicts
frozen; EPC-07 completes the inventory).**
Framework: exactly one materializer per surviving view, sourced from
the checkpoint/ledger; every retired independent writer deleted
same-package (R5). Preliminary verdicts over the four known writers:
handoff (`handoff/current.md`, `workflow_write_handoff`) — KEEP as the
primary per-worktree recovery projection; retire the bash writer,
regenerate from checkpoint. resume (`handoff/resume.md`,
`codex-handoff-resume.sh`) — MERGE into the handoff materializer: one
materializer emits both views deterministically; the separate resume
writer retires. tasks-current (`tasks/current.md`,
`refresh-current-status.sh`) — KEEP as a deterministic tracked
projection; materializer rewiring deferred to EPC-07. task-handoff
(Codex-global packet, `prepare-codex-handoff.sh`) — MERGE payload /
RETIRE independent writer: its unique payload becomes an additional
output target of the single handoff/resume materializer. If EPC-07's
inventory finds an undeclared fifth consumer, the merge/retire map is
revised in EPC-07's contract, not ad hoc.

### Rows 5–13 machine-operability confirmation (EPC-00)

Rows 5–11 (`epc-01`..`epc-07`) are confirmed machine-operable as
written; their design terms resolve to frozen decisions D1–D9 (row 9's
"every direct authoring path" is exactly `scripts/verify-sprint.sh:504`
and the `{}` bootstrap in `.ai/hooks/lib/workflow-state.sh`; row 11's
inventory enumerates the four writers named in D9). Row 12's
acceptance line is replaced and row 13's is amended by EPC-00 (see the
backlog table); both are clarifications, not scope changes. The EPC-08
token gate derives from the audit LOOP-12 targets (`max 1500`, `p95 ≤
700 tokens`) with the measurement method fixed to the existing
estimator (`utf8_bytes_div_4`) over a 27-state Authority×Profile panel
(9 authority states × 3 profiles, one deterministic sample per state).
SessionStart latency is reported descriptively (≥20 iterations per
state, matching HRD-08); the audit sets no SessionStart-latency gate,
so EPC-08 gates only on the two token numbers. The Row 13 matched
post-eval decision is re-affirmed as written, with its rubric frozen
before invocation exactly as VGBR-R's was, and its cannot-execute
fallback (relabel `descriptive pre-EPC baseline only`; no
benchmark-improvement claim) is a checked closeout assertion, not
prose.

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
