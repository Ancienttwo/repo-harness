# Sprint: Loop Semantics Convergence

> **Status**: Approved
> **Slug**: loop-semantics-convergence
> **Created**: 2026-07-16 01:01
> **Updated**: 2026-07-16 04:22
> **Source PRD**: (none; source authority is the Harness Loop audit)
> **Source Audit**: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
> **Source Spec**: `docs/spec.md`
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d`
> **Program Planning Base**: `origin/main@be3e93ce72c812a33045a15c4d97452c59fa3fbb` (PR #80)
> **LSC-01 Execution Base**: Pending the exact live `origin/main` SHA after CRG-01 merges
> **Predecessor**: Closeout Runner Guardrails (CRG-01), independently based on `be3e93ce72c812a33045a15c4d97452c59fa3fbb`; Effective State Authority Convergence remains the semantic baseline
> **Successor Order**: Hook Runtime Diet -> Evidence & Projection Convergence -> Skill Surface & Discovery Convergence
> **Goal Mode**: incremental

This is the machine-operable Sprint A projection of the preserved Harness Loop
Program audit. Each backlog row is an independent work-package, worktree,
branch, PR, verification subject, and rollback boundary. CRG-01 changes only
closeout control-plane mechanics and must merge first. LSC-01 must merge before
any semantic row starts. Every successor pins the live `origin/main`
produced by its predecessor.

## PRD

### Problem

Effective State now provides the stable core/effects and adapter seams, but
edit, stop, and ship still expose different artifact, readiness, and revision
semantics across Lite, Standard, and Strict. Changing those semantics before
freezing the current matrix would destroy the migration baseline and mix
characterization with behavioral acceptance.

### Users

- Agents and operators who need one explainable edit/stop/ship decision.
- CLI, MCP, Hook, and Skill adapters that must consume the same authority.
- Maintainers who need each semantic cutover to remain independently
  reviewable, reversible, and SHA-bound.

### Success Criteria

- Current behavior is frozen first for Lite/Standard/Strict x edit/stop/ship.
- Artifact requirements, readiness, revisions, and state-version publication
  each gain one authority in ordered, independent semantic packages.
- Stop consumes the shared readiness result without install fallback, mtime
  freshness, or cache authority.
- CLI, MCP, Hook, and Skill agree on profile, operation, decision, reason, and
  readiness for the same fixture.
- No steady-state compatibility code, dual authority, semantic fallback, or
  silent migration is introduced.

### Acceptance Scenarios

- Standard with an approved work-package and no separate contract has one
  documented answer across State, PreEdit, Stop, and Skill guidance.
- Strict without its required contract or worktree remains fail-closed.
- A task may be allowed to stop while still not ready to ship, and every
  adapter reports that distinction identically.
- Projection-only refreshes do not advance authority revision or progress
  token, and unstable source retries publish no observable state version.

### Non-goals

- No public Hook route, CLI command, or MCP tool rename.
- No Hook Runtime Diet, Evidence Ledger, checkpoint migration, or Skill
  surface implementation inside this Sprint.
- No production-path change in LSC-01.
- No compatibility alias, shim, fallback, dual evaluator, or shadow authority.
- No combining ESA, LSC, HRD, EPC, or SSD in one work-package, worktree,
  branch, or PR.

## Architecture Notes

### Capabilities Touched

- Effective State core/effects seams established by ESA.
- Artifact requirement and operation-readiness policy.
- Authority, subject, evidence, projection, and progress revisions.
- PreEdit/Stop/ship consumers and CLI/MCP/Hook/Skill parity.

### Concrete Trace

For one repository fixture, resolve repository authority once, project the
profile, evaluate edit/stop/ship, then compare the CLI, PreEdit, Stop, MCP, and
ship-gate observations. LSC-01 records current verdicts, reasons, exit codes,
ordering, and side effects without changing them. Later rows replace duplicate
semantic owners one at a time.

### Design Decision

Reuse ESA contracts, core/effects seams, and goldens as inputs, but keep the
Loop semantics delivery boundary separate. Characterization and target deltas
are data; production policy starts only in LSC-02. Each authority cutover
removes the retired authoring path in the same package and fails closed when
its approved contract is not satisfied.

### Dependency Order

```text
ESA@3b33cea2 -> Program@be3e93ce -> CRG-01
    -> LSC-01 -> LSC-02 -> LSC-03 -> LSC-04
    -> LSC-05 -> LSC-06 -> LSC-07 -> LSC-08
    -> HRD -> EPC -> SSD
```

### LSC-01 Start Gate

LSC-01 starts only after CRG-01 is independently committed, pushed, reviewed,
and merged. Fetch live `origin/main`, record its exact post-CRG SHA, and run the
explicit `sprint-backlog start-task`
command from a clean primary checkout or standalone non-linked control
checkout. Do not run it from this linked planning worktree: a linked worktree
cannot create the required independent contract worktree, and its ignored
active-sprint marker does not merge.

```bash
repo-harness run sprint-backlog start-task \
  --sprint plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md \
  --task lsc-01-profile-operation-characterization \
  --execute
```

Immediately after generation, calibrate both the plan and contract before any
implementation:

- set Task Profile to `eval-only`;
- record both the post-ESA Program baseline and the exact LSC-01 execution
  base;
- replace the generated allowlist with exact test/eval/docs/workflow paths and
  exclude `src/`, Hook runtime, installer, Skill, and every other production
  path;
- make the P1 architecture map, P2 concrete trace, P3 design decision,
  non-goals, stop conditions, and machine/manual acceptance self-contained;
- run `repo-harness run contract-run preflight --contract <contract> --repo . --json`,
  `repo-harness run check-task-workflow --strict`, and
  `repo-harness state resolve --json`; confirm the readback is `eval-only`, the
  allowlist is exact, and blockers are empty.

The generated defaults are not acceptance evidence. Any `code-change` profile
or production/config path in the calibrated plan or contract fails this gate.

### Risks

- A characterization test that normalizes semantic fields would hide the
  baseline; only nondeterministic path/time/PID data may be normalized.
- A row that starts from stale local `main` could bind the wrong authority;
  every row must fetch and pin live `origin/main` after its predecessor merges.
- A shared PR would make review and rollback ambiguous; rows remain serial and
  independently merged.
- Final expensive evidence runs once after each package's code freeze; any
  fail-fix-reverify issue stops after three rounds and escalates.

## Backlog

Ordered execution queue. Every row uses the full plan -> contract -> worktree
flow and lands through an independent PR.

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [ ] | lsc-01-profile-operation-characterization | contract | Task Profile is `eval-only`; reuse ESA goldens and freeze Lite/Standard/Strict x edit/stop/ship as 9 named current-behavior cells plus approved target deltas; `bun test tests/state/loop-semantics-characterization.test.ts` passes; the calibrated contract lists exact test/eval/docs/workflow paths and all production paths remain untouched | (pending) |
| 2 | [ ] | lsc-02-artifact-requirement-policy | contract | In an independent PR, establish one pure `ArtifactRequirementPolicy` matrix for Lite/Standard/Strict with positive/negative fixtures; do not switch consumers or implement readiness in this package | (pending) |
| 3 | [ ] | lsc-03-standard-contract-semantic-cutover | contract | In an independent PR, make the approved Standard work-package contract policy identical across State, PreEdit, Stop, docs, and Skill guidance while Strict missing-contract/worktree states remain fail-closed | (pending) |
| 4 | [ ] | lsc-04-revision-partition-and-progress-token | contract | In an independent PR, separate authority, subject, evidence, and projection revisions, define a progress token, and make circuit keys consume it; projection-only rendering changes neither authority revision, progress token, nor no-progress detection | (pending) |
| 5 | [ ] | lsc-05-stable-state-version-allocation | contract | In an independent PR, publish state versions only after a stable source snapshot is confirmed; source-mutation retries and failed transactions consume no observable version and concurrency fixtures pass | (pending) |
| 6 | [ ] | lsc-06-operation-readiness-evaluator | contract | In an independent PR, establish one `evaluateReadiness` result with allowedToEdit, allowedToStop, readyToShip, requirements, and nextAction; 9-cell positive/negative fixtures pass and adapters do not recompute semantics | (pending) |
| 7 | [ ] | lsc-07-stop-semantics-cutover | contract | In an independent PR, make Stop consume shared readiness and remove install-profile fallback, mtime freshness touch, and cache-as-authority; the allowed-to-stop/not-ready-to-ship fixture passes and public routes remain unchanged | (pending) |
| 8 | [ ] | lsc-08-adapter-parity-and-docs | contract | In an independent PR, prove CLI/MCP/Hook/Skill parity for profile, operation, decision, reason, and readiness on the same fixtures; public route/tool/CLI names remain unchanged and parity/docs gates pass | (pending) |

## Definition of Done

- LSC-01 characterization is merged separately from every semantic change and
  its diff contains no production path.
- Standard separate-contract policy has one answer while Strict remains
  fail-closed.
- allowedToEdit, allowedToStop, and readyToShip are independently queryable
  projections of one readiness authority.
- Authority/subject/evidence/projection revisions are distinct; projection
  churn does not change progress, and circuit keys consume the progress token.
- State version publishes only after stable observation; Stop has no install
  fallback, mtime touch, or cache authority.
- CLI/MCP/Hook/Skill parity holds and public route/tool/CLI names remain stable.
- No compatibility code, dual authority, semantic fallback, or silent
  migration exists.
- Every semantic PR records profile, operation, before/after behavior, and a
  migration note for each old-behavior difference.
- Each row has targeted and root checks, fresh review/external acceptance,
  merge-gate, commit/push/merge evidence, backlog backfill, and the next exact
  remote-main SHA.

## Execution Log

`repo-harness run sprint-backlog complete-task` appends completed rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
