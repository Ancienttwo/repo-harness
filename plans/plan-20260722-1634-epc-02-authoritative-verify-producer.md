# Plan: EPC-02: Authoritative Verify Producer

> **Status**: Executing
> **Created**: 20260722-1634
> **Slug**: epc-02-authoritative-verify-producer
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-02
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Red-first fixtures prove: subject mismatch fails closed, dirty/untracked contract fails closed, emitted event is authoritative_machine with complete D3 subject identity and accepted by the EPC-01 fold, idempotent re-emission dedups, genesis written once with the epoch constant; the package's own verify-sprint acceptance run exercises the live emission path; full bun test and root required checks green
> **Rollback Surface**: Revert the single PR: new files (epoch constant, producer, CLI wrapper, test suite) plus one wiring edit in scripts/verify-sprint.sh; checks/latest authoring and all other surfaces unchanged
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md`
> **Task Review**: `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md`
> **Implementation Notes**: `tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-02
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md`
- Sprint contract: `tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md`
- Sprint review: `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md`
- Implementation notes: `tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md`
- Review file: `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md`
- Implementation notes file: `tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: new files (epoch constant, producer, CLI wrapper, test suite) plus one wiring edit in scripts/verify-sprint.sh; checks/latest authoring and all other surfaces unchanged
- **Verification boundary**: Red-first fixtures prove: subject mismatch fails closed, dirty/untracked contract fails closed, emitted event is authoritative_machine with complete D3 subject identity and accepted by the EPC-01 fold, idempotent re-emission dedups, genesis written once with the epoch constant; the package's own verify-sprint acceptance run exercises the live emission path; full bun test and root required checks green
- **Review/acceptance boundary**: `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md`, `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md`, and `tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: new files (epoch constant, producer, CLI wrapper, test suite) plus one wiring edit in scripts/verify-sprint.sh; checks/latest authoring and all other surfaces unchanged

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-02 implements Sprint C backlog row 6: the authoritative verify producer.
The verify runner (`verify-sprint` chain) emits subject-bound
`authoritative_machine` EvidenceEvents into the EPC-01 ledger, with
non-subject-bound emission impossible by construction. This package also
introduces the Program's single epoch constant
(`LEDGER_EPOCH_START_SHA = 5228d4ea0d7987cf6fb73be216d5b9cc638817c3`, the
base SHA the EPC-01 contract consumed per frozen D2) so later producers
(EPC-03/04) import one authority instead of duplicating literals. No
consumer cutover: `checks/latest` authoring is untouched (EPC-05 owns that
cutover); emission runs alongside the existing checks write. Base SHA pinned
per R1 at fresh fetch: `a8cae4d78f1a4451f3a5335b9fc345740c3c61db` (EPC-01
PR #117 merge plus row-flip commit).

## Why

Rows 9–12 (materializers, checkpoints, Context Packet) select accepted
events by trust class and exact subject; without a producer there is
nothing authoritative to select. The verify chain is the only surface
entitled to emit `authoritative_machine` (D4), and D3 requires emission
bound to a full subject identity, not a bare HEAD SHA. Emitting from the
runner itself — rather than from a side script a caller could skip —
matches D6's construction-invariant discipline and the audit's
"required gate 绑定 subject revision" acceptance.

## Goal

1. `src/effects/evidence/epoch.ts`: export the frozen epoch constant
   `LEDGER_EPOCH_START_SHA` (D2; value `5228d4ea...`), the single source
   for genesis initialization across all producers.
2. `src/effects/evidence/verify-producer.ts`: builds the full D3 subject
   identity from repo state and emits one `authoritative_machine` event
   via the EPC-01 writer. Construction rules:
   - `subject_hash` = the review-subject sha256 recomputed via the
     existing review-subject builder (`src/effects/review/diff-fingerprint.ts`,
     read-only import); if the caller supplies an expected subject hash
     and it differs from the recomputed value, emission fails closed.
   - `base_commit` = resolved `review_base` (policy `origin/main`) commit;
     `target_commit` = worktree HEAD; `scope_hash` = sha256 over the
     active contract's ordered `allowed_paths`; `contract_hash` = sha256
     of the active contract file; `command_hash` = sha256 of the exact
     verify command line; `env_provider_id` = host runner identity;
     `authority_commit` = last commit touching the active contract file.
   - Fail closed (no emission, non-zero exit) when: no active contract;
     contract file dirty or untracked (authority must be committed);
     subject mismatch; genesis/epoch violation from the EPC-01 store.
   - There is no API path that emits with a partial subject: the producer
     exposes a single entry that computes the identity itself.
3. `scripts/emit-verify-evidence.ts`: thin bun CLI wrapper so the bash
   verify chain can invoke the producer; no logic beyond arg parsing.
4. Wire `scripts/verify-sprint.sh`: after successful verification (both
   the `--prepare-acceptance` freeze path and the finalize path), invoke
   the producer with the verification result and the frozen
   `review_subject_sha256`; producer failure fails the verify run (no
   silent fallback, per the Program's no-fallback rule). Emission is
   additive: the existing `checks/latest.json` write is unchanged in this
   package.
5. Genesis: the producer initializes the per-worktree store on first
   emission with `LEDGER_EPOCH_START_SHA` (D1 fresh-store + D2 rule).
6. `tests/evidence-verify-producer.test.ts` fixtures prove: subject
   mismatch fails closed (no event appended); dirty/untracked contract
   fails closed; successful emission is `authoritative_machine` with the
   complete D3 field set; emitted event is accepted by the EPC-01 fold;
   a second identical emission dedups via idempotency key (no duplicate
   accepted event); genesis is written once with the epoch constant.
7. All root required checks green; one independent PR on
   `codex/epc-02-authoritative-verify-producer`.

## P1: Architecture Map

- Design authority: frozen D2/D3/D4/D5/D6 (sprint Frozen decisions) and
  EPC-01's shipped API (`src/core/evidence/`, `src/effects/evidence/` —
  read-only imports; no EPC-01 file may be modified).
- Wiring surface: `scripts/verify-sprint.sh` only. `verify-contract.sh`,
  `checks/latest` composition, acceptance-receipt, PostBash, handoff
  writers: untouched (owned by rows 7–11).
- EPC-01 residual notes apply: high-entropy redaction may over-redact
  long dot-free strings in payloads — keep event payloads structured and
  small (verdict, counts, run snapshot path) rather than embedding raw
  logs; large content belongs to blobs.

## P2: Concrete Trace

EPC-01 merges via PR #117 -> `main` advances to `a8cae4d7` (row-5 flip) ->
EPC-02 fresh-fetches, verifies `origin/main == a8cae4d7`, pins it (R1) ->
worktree opens on `codex/epc-02-authoritative-verify-producer` ->
epoch constant + producer + CLI wrapper + verify-sprint wiring + tests
land -> in this package's own acceptance run, `verify-sprint
--prepare-acceptance` itself exercises the new emission path (dogfood):
genesis written with the epoch constant, one `authoritative_machine`
event appended and accepted -> required checks green -> receipt recorded
immediately after evidence -> one PR merges -> EPC-03/04 pin their own
base per R1 and import the epoch constant.

## P3: Design Decision

- The epoch constant lives in this package, not EPC-01 (which shipped a
  parameterized API) and not duplicated per-producer: one authority, no
  literal drift — this is also why EPC-02 runs serially before an
  EPC-03/04 wave (the constant would otherwise be a shared surface
  violating R4's wave qualification).
- Producer failure fails the verify run: emission is part of the runner's
  contract now; swallowing emission errors would be a semantic fallback
  the Program forbids. The blast radius is acceptable because the
  emission path is exercised by this package's own acceptance before
  merge.
- Authority must be committed (dirty contract fails closed): a
  subject-bound event that points at uncommitted authority text would be
  unverifiable after the fact, defeating D3's purpose.
- CLI wrapper in `scripts/` (not a `src/cli` subcommand): the verify
  chain is bash and already invokes bun scripts; a full CLI subcommand
  would widen the public surface for no consumer benefit (rows 9+ import
  the module directly).

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base `a8cae4d7`; fill contract.
- [ ] `epoch.ts` + `verify-producer.ts` (construction-invariant subject
      binding, fail-closed paths).
- [ ] `scripts/emit-verify-evidence.ts` wrapper; wire
      `scripts/verify-sprint.sh` (additive emission, fail-closed).
- [ ] Tests red-first for every Goal-6 fixture.
- [ ] Required checks; commit; receipt; PR.

## Scope

- In scope: `src/effects/evidence/epoch.ts`,
  `src/effects/evidence/verify-producer.ts`,
  `scripts/emit-verify-evidence.ts`, `scripts/verify-sprint.sh` (wiring
  edit only), `tests/evidence-verify-producer.test.ts`, this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-02-authoritative-verify-producer.json`.
- Out of scope: every EPC-01 file (read-only), `checks/latest`
  composition or any direct-authoring deletion (EPC-05), PostBash
  (EPC-03), acceptance-receipt (EPC-04), handoff/resume/current writers
  (EPC-07), `verify-contract.sh`, `tasks/current.md`, the sprint
  document, any new npm dependency.
- Non-goals: gate cutover (gates still read `checks/latest`); event
  consumption by any existing surface; supersedes emission (nothing to
  supersede yet).

## Stop Conditions

- Stop if `origin/main` moves past `a8cae4d7` before worktree creation.
- Stop if correct emission would require modifying an EPC-01 module or
  `verify-contract.sh` — report, do not widen scope.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if subject-bound emission cannot be built from the
existing review-subject builder without modifying it, or if the verify
chain cannot tolerate fail-closed emission (i.e. the dogfood acceptance
run of this very package cannot pass with emission enabled). Cheapest
proof: this package's own `verify-sprint --prepare-acceptance` run
appends exactly one accepted `authoritative_machine` event to the
worktree ledger and still passes.

## Cheapest Sufficient Proof

- Fresh fetch equals `a8cae4d7` at pin time; contract records it.
- New test suite green red-first; full `bun test` green; root required
  checks green in the worktree.
- The package's own acceptance run wrote genesis (epoch constant) plus
  one accepted `authoritative_machine` event in
  `.ai/harness/evidence/events/` of the worktree.
- `git diff --name-only a8cae4d7..HEAD` ⊆ `allowed_paths`; no EPC-01
  file modified.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch equals pinned base `a8cae4d7`; fill contract.
- [ ] `epoch.ts` + `verify-producer.ts` (construction-invariant subject
- [ ] `scripts/emit-verify-evidence.ts` wrapper; wire
- [ ] Tests red-first for every Goal-6 fixture.
- [ ] Required checks; commit; receipt; PR.
