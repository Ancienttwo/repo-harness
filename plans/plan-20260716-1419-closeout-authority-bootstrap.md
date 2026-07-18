# Plan: Closeout Evidence Scope & Freeze Receipt

> **Status**: Executing
> **Created**: 20260716-1419
> **Slug**: closeout-authority-bootstrap
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Original Base**: `origin/main@be3e93ce` (parked 2026-07-16; WIP checkpoint `3dd89785`)
> **Execution Base**: `origin/main@351139fd` (post-LSC-08; rebased `0f7c274b`, full suite 1687 pass / 0 fail)
> **Verification Boundary**: Seven named failing regressions, full required check surface, canonical self-ship as end-to-end proof
> **Rollback Surface**: Revert this isolated branch; receipt schema addition is strict-by-default with no persistent migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md`
> **Task Review**: `tasks/reviews/20260716-1419-closeout-authority-bootstrap.review.md`
> **Implementation Notes**: `tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260716-1419-closeout-authority-bootstrap.md`
- Sprint contract: `tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md`
- Sprint review: `tasks/reviews/20260716-1419-closeout-authority-bootstrap.review.md`
- Implementation notes: `tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260716-1419-closeout-authority-bootstrap.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260716-1419-closeout-authority-bootstrap.md`.

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
- Contract file: `tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md`
- Review file: `tasks/reviews/20260716-1419-closeout-authority-bootstrap.review.md`
- Implementation notes file: `tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260716-1419-closeout-authority-bootstrap.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert this isolated branch; receipt schema addition is strict-by-default with no persistent migration
- **Verification boundary**: Seven named failing regressions, full required check surface, canonical self-ship as end-to-end proof
- **Review/acceptance boundary**: `tasks/reviews/20260716-1419-closeout-authority-bootstrap.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260716-1419-closeout-authority-bootstrap.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md`, `tasks/reviews/20260716-1419-closeout-authority-bootstrap.review.md`, and `tasks/notes/20260716-1419-closeout-authority-bootstrap.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260716-1419-closeout-authority-bootstrap.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert this isolated branch; receipt schema addition is strict-by-default with no persistent migration

## Captured Planning Output

# Plan Body: Closeout Evidence Scope & Freeze Receipt

## Goal

Repair the two canonical closeout-authority defects that block CRG-01 (and any future contract whose diff moves the benchmark subject) from shipping through `ship-worktrees --ready` without rerunning or falsifying the existing 3x9 benchmark evidence:

1. **Contract-scoped benchmark evidence applicability.** The active contract explicitly declares whether benchmark evidence is `required` or `not_applicable` via a machine-readable `evidence_requirements` block. Acceptance and checks gates consume the declaration; mere presence of `evals/harness/reports/profile-comparison.*` never creates a validation requirement by itself. Missing, malformed, unknown, or contradictory declarations fail closed. No inference from Task Profile, natural language, report presence, or changed filenames.
2. **Freeze-before-archive merge-gate topology.** `contract-worktree.sh finish` freezes the implementation candidate (commit F) and runs the merge gate against F while the goal plan still exists, then performs lifecycle archive mutation as a separate commit L. The receipt binds F plus an exact post-freeze lifecycle path allowlist and the goal identity/hash; receipt verification accepts L only when F is an ancestor of L and the F..L delta touches only allowlisted paths. Any production, test, or contract semantic delta after freeze invalidates the receipt.

This is a bounded prerequisite PR. It does not implement Evidence Ledger, Loop Semantics, Skill Surface, Harness Loop, CRG-02, or old-test retirement.

## P1: Architecture Map

- `assets/hooks/lib/workflow-state.sh` is the canonical hook library, projected to `.ai/hooks/lib/workflow-state.sh` by `bun scripts/sync-hook-sources.ts --write` (checked by `--check` and `tests/hook-source-projection.test.ts`). It owns external-acceptance authority (`workflow_external_acceptance_status` :1518-1642), benchmark evidence derivation (`workflow_benchmark_evidence_json/fingerprint/subject` :1654-1681), and checks binding (`workflow_benchmark_evidence_checks_match` :1683-1726, `workflow_checks_pass` :1728+).
- `scripts/*` helpers are canonical, mirrored to `assets/templates/helpers/*` by `bun scripts/sync-helper-sources.ts --write` (checked by `--check`).
- `scripts/verify-sprint.sh` :510-522 derives `benchmark_evidence.status` purely from tool/filesystem presence and projects it into `.ai/harness/checks/latest.json` (:639-641, :742-745).
- `scripts/contract-worktree.sh finish` :640-716 currently runs: acceptance check → verify-sprint → scope check → `archive_finished_workflow` → clean markers → backfill sprint backlog → single combined commit → `run_merge_gate --goal "$active_plan"` (a path archive already moved) → receipt verify → ff-merge.
- `scripts/merge-gate.ts` owns the receipt (`~/.repo-harness/gates/<sha256(repo-root)>/merge-gate.latest.json`), binding base/head SHA, whole-diff `diff_fingerprint`, verification-evidence fingerprint, host-runtime and helper fingerprints, and the goal *path string only* (no content hash). `verify` is exact-match with zero post-receipt tolerance. `resolveGoal` (:397-420) has a `plans/archive/<stem>{,-v*}.md` glob fallback that is load-bearing today only because archive precedes the gate.
- `scripts/ship-worktrees.sh` runs `require_finish_ready` (acceptance + verify-sprint + checks, all pre-finish) → `contract-worktree.sh finish --no-merge --gate-base <ref>` → receipt verify → push → draft PR.
- `benchmarkSubject()` (`scripts/run-harness-profile-benchmark.ts:341`) hashes the runner file, scenario manifest, fixture seed tree, `{package.json, src/cli, assets}`, and the provider invocation schema. Any `assets/**` change moves the subject — including this PR itself, so this PR's own contract must declare `benchmark: not_applicable` and its own ship is an end-to-end proof of invariant 1.
- Contract files use scalar blockquote fields plus fenced yaml blocks (`allowed_paths`, `exit_criteria`), parsed ad hoc per consumer; `evidence_requirements` exists nowhere today (repo-wide grep: zero hits) — greenfield.

## P2: Concrete Trace

Reproduced blocker (CRG worktree): `ship-worktrees --ready` → `require_finish_ready` → `workflow_external_acceptance_status` → rubric v2 branch → file-presence benchmark inference (workflow-state.sh:1626) → `validate-harness-profile-benchmark.ts --require-authoritative` fails with `benchmark subject changed at benchmark_subject_sha256` (the checked-in report is authoritative for source commit `606b02c1`, subject `sha256:c2c55a74...`, not for a candidate that changed `scripts/run-harness-profile-benchmark.ts`) → `fail ... Current benchmark evidence is present but invalid.` → ship restores pre-ship state.

Even with acceptance repaired, `finish` would archive the live plan at :662 and pass the moved path to `run_merge_gate` at :688; `resolveGoal`'s glob fallback silently substitutes the archived copy, and the gate reviews a diff already containing archive mutations that the frozen external acceptance never covered (`isOperationalReviewPath` excludes reviews/checks/handoff but not live plan/contract/notes deletions plus archived projections).

## P3: Decision Rationale

1. Applicability is a reviewed contract declaration, not an inference. Two values only: `required | not_applicable`. Anything else fails closed with an explicit message.
2. `not_applicable` preserves reports on disk and excludes them from this contract's acceptance/check binding: the review's `Benchmark Evidence SHA256` must be literally `not-applicable`, checks must record status `not_applicable`, and report presence no longer fails the checks match. Contradictions (review records a sha under `not_applicable`, or checks say `present`) fail.
3. `required` keeps existing strictness: current authoritative report fingerprint+subject must validate, and review + checks must bind to them byte-exactly; absence of reports under `required` fails.
4. The contract is resolved from the review path stem (`tasks/reviews/<stem>.review.md` → `tasks/contracts/<stem>.contract.md`) inside `workflow_external_acceptance_status`; a missing contract fails closed. `workflow_benchmark_evidence_checks_match` reads the same declaration from the checks-recorded contract path.
5. Freeze-before-archive: finish commits implementation candidate F first, runs the gate at F with the live goal, then archives and commits lifecycle delta L, then verifies the receipt against L (F ancestor + allowlist). The single combined commit becomes two commits: implementation (existing `--message` default) and a deterministic lifecycle commit.
6. Receipt schema/verification extension lives in `scripts/merge-gate.ts` — it cannot remain in `contract-worktree.sh` because `verify`'s exact `diff_fingerprint` match rejects any post-gate commit. New receipt fields: `post_freeze_allowlist: string[]` (exact repo-relative paths, supplied by finish at run time) and `goal_sha256` (sha256 of goal bytes read at run time — closes the "goal never content-hashed" gap). `verify` keeps the exact-match path when HEAD == receipt.head_sha; when HEAD differs it passes only if the allowlist is non-empty, receipt.head_sha is an ancestor of HEAD, `git diff --name-only receipt.head_sha..HEAD` ⊆ allowlist, and every other binding (base sha, frozen diff fingerprint base..F, verification evidence, host runtime, helper) still matches exactly. A receipt without `post_freeze_allowlist` gets zero tolerance — strict default, not a compatibility shim.
7. Remove `resolveGoal`'s `plans/archive` glob fallback in this same work-package: once the gate precedes archive it is dead code, and it is the semantic fallback that masked the deleted-goal defect. Direct regular-file resolution under `plans/` and `plans/archive/` remains.
8. No `src/effects/review/diff-fingerprint.ts` change: acceptance and gate both evaluate pre-archive, so the reviewed normalized subject stays valid; no broad review-freshness exclusions are added.
9. Archive destination collision (`plans/archive/<stem>-v2.md`) intentionally fails the allowlist check and aborts the transaction — fail closed; the operator resolves the collision.
10. Regression 3 (`required` + valid evidence passes, drift fails) is tested at the bash seam with a fixture-local stub `scripts/validate-harness-profile-benchmark.ts` (already the resolution order of `workflow_benchmark_evidence_json`); no 3x9 authoritative-report fixture builder is built in this bounded slice. The real validator keeps its own authority checks and release evidence.
11. The contract template ships the block explicitly as `benchmark: not_applicable` with a comment instructing `required` when the contract consumes the harness profile benchmark matrix; every generated contract therefore carries an explicit reviewed declaration.

## Scope

### In scope

- `assets/hooks/lib/workflow-state.sh` (canonical edit) + `.ai/hooks/lib/workflow-state.sh` (projection)
- `scripts/verify-sprint.sh`, `scripts/verify-contract.sh`, `scripts/contract-worktree.sh`, `scripts/merge-gate.ts` + their `assets/templates/helpers/*` mirrors
- `assets/templates/contract.template.md` + `.claude/templates/contract.template.md`
- `tests/workflow-state-lib.test.ts`, `tests/helper-scripts.test.ts`, `tests/merge-gate.test.ts`, `tests/archive-evidence-gates.test.ts` (bounded)
- This work-package's own plan/contract/review/notes artifacts; `docs/reference-configs/sprint-contracts.md` only if it documents contract fields
- `tasks/current.md`, `tasks/todos.md` sync

### Out of scope / no-touch

- The CRG worktree and the effective-state-test-retirement worktree
- `evals/harness/reports/profile-comparison.{json,md,sha256.json}` (no modify/delete/hide/regenerate/rebind)
- Running the 3x9 benchmark; pointing the validator at an old checkout
- Bypassing `ship-worktrees`, external acceptance, `verify-sprint`, or merge gate with direct Git/GitHub commands
- Broad exclusion of plans/contracts/notes from review freshness
- Evidence Ledger, Loop Semantics, Skill Surface, Harness Loop, CRG-02, unrelated old-test cleanup

## Detailed Design

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `assets/hooks/lib/workflow-state.sh` | edit | Add `workflow_contract_evidence_requirement <contract>` (fenced-yaml block parser, fail-closed); replace file-presence inference in `workflow_external_acceptance_status` with contract-declared semantics; make `workflow_benchmark_evidence_checks_match` declaration-aware |
| `.ai/hooks/lib/workflow-state.sh` | generated | `bun scripts/sync-hook-sources.ts --write` |
| `scripts/verify-sprint.sh` | edit | Derive `benchmark_evidence.status` from the resolved contract's declaration: `required` → present-or-invalid(fail); `not_applicable` → `not_applicable` regardless of report presence; invalid declaration → invalid + fail |
| `scripts/verify-contract.sh` | edit | Validate the `evidence_requirements` block exists and is well-formed on the active contract |
| `scripts/contract-worktree.sh` | edit | Finish reorder (freeze commit F → gate at F with live goal → archive/markers/backfill → lifecycle commit L → receipt verify vs L); compute exact post-freeze allowlist; pass allowlist to `merge-gate.ts run` |
| `scripts/merge-gate.ts` | edit | Receipt fields `post_freeze_allowlist`, `goal_sha256`; `verify` ancestor+allowlist acceptance path; remove `resolveGoal` archive glob fallback |
| `assets/templates/helpers/*` | generated | `bun scripts/sync-helper-sources.ts --write` |
| `assets/templates/contract.template.md`, `.claude/templates/contract.template.md` | edit | New `## Evidence Requirements` fenced yaml block, explicit `benchmark: not_applicable` default with guidance comment |
| `tasks/contracts/<this-stem>.contract.md` | edit | After Part A lands, add the block declaring `benchmark: not_applicable` to this work-package's own active contract (this PR changes `assets/**`, so the subject moves and this contract does not consume the matrix) |
| tests (4 files above) | edit | Failing regressions 1-7 first, then green |

### Post-freeze allowlist (computed by finish, exact paths, no wildcards)

`plans/<basename active_plan>`, `plans/archive/<basename>`, `tasks/contracts/<stem>.contract.md`, `tasks/reviews/<stem>.review.md`, `tasks/notes/<stem>.notes.md` (when present), `tasks/current.md`, `tasks/todos.md`, and the sprint backlog file parsed from the plan's `Source Ref` (when present). The slice-2 worker derives the authoritative final set empirically from the existing finish e2e fixture (`tests/helper-scripts.test.ts:1565`) and keeps it exact-path.

## Required Failing Regressions Before Patch

| # | Regression | Test surface |
|---|-----------|--------------|
| 1 | Stale global reports present + contract declares `not_applicable` → matching acceptance and checks pass without deleting or validating those reports | `tests/workflow-state-lib.test.ts` |
| 2 | Same fixture with `required` → fails closed on the stale report | `tests/workflow-state-lib.test.ts` |
| 3 | `required` + current authoritative evidence (stub-validator seam) passes; byte/subject drift fails | `tests/workflow-state-lib.test.ts` |
| 4 | `finish --no-merge --gate-base ...` never passes a deleted goal path to the merge gate (gate runs while the plan is live) | `tests/helper-scripts.test.ts` |
| 5 | Archive-only post-freeze delta within the receipt allowlist passes receipt verify | `tests/merge-gate.test.ts` / `tests/helper-scripts.test.ts` |
| 6 | A single production, test, or contract semantic change after freeze fails receipt verify | `tests/merge-gate.test.ts` / `tests/helper-scripts.test.ts` |
| 7 | Existing ship topology still invokes `verify-sprint` exactly once | `tests/helper-scripts.test.ts` |

Cap each fail → fix → reverify invariant at three rounds; on the third failure stop and escalate.

## Task Breakdown

- [x] S1-R: Author failing regressions 1-3 (contract-scoped benchmark evidence) and confirm they fail against current code
- [x] S1-I: Implement Part A (workflow-state.sh canonical + projection, verify-sprint.sh, verify-contract.sh, contract templates, helper mirrors); regressions 1-3 green; focused suites green
- [x] S1-C: Add `## Evidence Requirements` (`benchmark: not_applicable`) to this work-package's own active contract
- [x] S2-R: Author failing regressions 4-7 (freeze receipt + topology) and confirm they fail against current code
- [x] S2-I: Implement Part B (contract-worktree.sh finish reorder + allowlist, merge-gate.ts receipt/verify/goal-resolution, helper mirrors); regressions 4-7 green
- [x] S2-H1: Fail closed on evidence-parser marker injection and YAML-equivalent quoted/spaced duplicate keys; targeted regressions green
- [x] S2-H2: Bind exact post-freeze semantic destination bytes through a trusted-driver scratch manifest and host receipt; tampered-destination regression green
- [x] V: Full required checks green (`bun test`, deploy-sql-order, architecture-sync, task-sync, `check-task-workflow --strict`, inspect-project-state, `adopt --repo . --dry-run`, `sync-hook-sources --check`, `sync-helper-sources --check`); docs/tasks sync
- [x] G: Gatekeeper acceptance on the full diff against this plan
- [ ] E: External acceptance (host-aware: Codex via codex-review, since the executing host is Claude) recorded on the frozen normalized subject with `Benchmark Evidence SHA256: not-applicable`
- [ ] SHIP: independent PR to main after gatekeeper acceptance (CRG-01 resumption framing overtaken: CRG-01 and LSC-01..08 already shipped via the documented manual pattern; this package retires that pattern for future closeouts)

## Verification

```bash
bun test tests/workflow-state-lib.test.ts tests/helper-scripts.test.ts tests/merge-gate.test.ts tests/archive-evidence-gates.test.ts
bun scripts/sync-hook-sources.ts --check
bun scripts/sync-helper-sources.ts --check
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Finish reorder breaks an untested caller ordering assumption | Medium | High | Regression 7 + existing e2e finish/ship fixtures must stay green; two-commit topology is asserted explicitly |
| Allowlist under-enumerates real archive side effects | Medium | Medium | Derive empirically from the e2e fixture; under-enumeration fails closed (transaction aborts), never silently passes |
| Contract-declaration parser diverges between bash consumers | Low | Medium | One parser function in workflow-state.sh; verify-sprint/verify-contract consume it via the sourced lib, no re-implementation |
| Receipt schema change breaks host-side verify of older receipts | Low | Low | Missing allowlist → exact-match only (strict default); no migration shim |
| Own-ship deadlock (this PR's subject moves but old acceptance code runs pre-merge) | Low | High | Acceptance/checks gates for THIS candidate run from this candidate's own updated lib (hook_source: repo pins `.ai/hooks/` as live runtime); verified during V |

## Promotion Gate

- **Merge/PR unit**: Independent prerequisite PR; must land on `main` before CRG-01 rebinding and retry.
- **Rollback surface**: Revert this isolated branch; receipt schema addition is strict-by-default with no persistent migration.
- **Verification boundary**: Seven named failing regressions plus the full required check surface plus canonical self-ship as end-to-end proof.
- **Review/acceptance boundary**: External Claude acceptance on the frozen normalized subject under the new contract declaration.
- **High-risk surface**: Merge-gate receipt semantics and closeout transaction ordering — the repo's ship authority.
- **Why not checklist row**: Multi-file authority change across hook lib, three helpers, the trusted gate helper, and templates, with its own external acceptance and merge boundary.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] S1-R: Author failing regressions 1-3 (contract-scoped benchmark evidence) and confirm they fail against current code
- [x] S1-I: Implement Part A (workflow-state.sh canonical + projection, verify-sprint.sh, verify-contract.sh, contract templates, helper mirrors); regressions 1-3 green; focused suites green
- [x] S1-C: Add `## Evidence Requirements` (`benchmark: not_applicable`) to this work-package's own active contract
- [x] S2-R: Author failing regressions 4-7 (freeze receipt + topology) and confirm they fail against current code
- [x] S2-I: Implement Part B (contract-worktree.sh finish reorder + allowlist, merge-gate.ts receipt/verify/goal-resolution, helper mirrors); regressions 4-7 green
- [x] V: Full required checks green (`bun test`, deploy-sql-order, architecture-sync, task-sync, `check-task-workflow --strict`, inspect-project-state, `adopt --repo . --dry-run`, `sync-hook-sources --check`, `sync-helper-sources --check`); docs/tasks sync
- [x] G: Gatekeeper acceptance on the full diff against this plan
- [x] E: External acceptance (host-aware: Codex via codex-review, since the executing host is Claude) recorded on the frozen normalized subject with `Benchmark Evidence SHA256: not-applicable`
- [ ] SHIP: independent PR to main after gatekeeper acceptance (CRG-01 resumption framing overtaken: CRG-01 and LSC-01..08 already shipped via the documented manual pattern; this package retires that pattern for future closeouts)
