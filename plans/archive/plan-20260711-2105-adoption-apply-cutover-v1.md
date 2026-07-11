# Plan: TypeScript Adoption Apply Cutover v1

> **Status**: Archived
> **Created**: 20260711-2105
> **Slug**: adoption-apply-cutover-v1
> **Planning Source**: waza-think
> **Orchestration Kind**: adoption-breaking-cutover
> **Source Ref**: docs/architecture/transactional-adoption-planner.md
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Adoption mutation authority, transaction recovery, CLI contract, and shell-route removal must cut over together.
> **Rollback Surface**: Revert the reviewed cutover commits; downstream apply manifests retain explicit rollback.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md`
> **Task Review**: `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md`

## Agentic Routing
- Selected route: think
- Routing reason: Captured from waza-think planning output.
- Source ref: docs/architecture/transactional-adoption-planner.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260711-2105-adoption-apply-cutover-v1.md`
- Sprint contract: `tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md`
- Sprint review: `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md`
- Implementation notes: `tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260711-2105-adoption-apply-cutover-v1.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260711-2105-adoption-apply-cutover-v1.md`.

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
- Contract file: `tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md`
- Review file: `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md`
- Implementation notes file: `tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260711-2105-adoption-apply-cutover-v1.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the reviewed cutover commits; downstream apply manifests retain explicit rollback.
- **Verification boundary**: Adoption mutation authority, transaction recovery, CLI contract, and shell-route removal must cut over together.
- **Review/acceptance boundary**: `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260711-2105-adoption-apply-cutover-v1.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md`, `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md`, and `tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the reviewed cutover commits; downstream apply manifests retain explicit rollback.

## Captured Planning Output

# TypeScript Adoption Apply Cutover v1 — Decision-Complete Plan

## Goal

Make the TypeScript adoption plan and transaction executor the only mutation
authority for `repo-harness adopt`.  Default standard adoption must preserve the
current repo-local migration outcome, register the adopted repository, perform
the existing CodeGraph/verification post-apply work, and return one structured
result.  Delete the experimental switch and the shell migration route in the
same breaking work-package; no legacy apply flag, alias, or shell fallback is
permitted.

## P1: Architecture Map

- Public route: `src/cli/index.ts` owns `adopt` option parsing and currently
  selects TypeScript dry-run, opt-in TS apply, or `runInit()` default apply.
- Current mutation authority: `src/cli/commands/init.ts#runInit` invokes
  `scripts/migrate-project-template.sh`, which orchestrates hook cleanup and
  projection, workflow-document migration, template/reference/policy/context
  installation, ops/research migration, package-script updates, `.gitignore`,
  version stamp, and strict verification.
- Target authority: `src/core/adoption/` owns deterministic operation planning;
  `src/effects/fs-transaction.ts` owns containment, locking, durable writes,
  backups, transaction manifests, and rollback; `adopt-plan.ts` owns the
  CLI-facing apply result plus registry/CodeGraph/verification effects.
- Source assets and ownership boundaries: `assets/workflow-contract.v1.json`,
  `assets/templates/`, `assets/hooks/`, and `assets/reference-configs/` are
  canonical product bytes.  The planner may only overwrite known-generated
  targets, archive legacy workflow artifacts before moving them, and must
  preserve custom hooks, app scripts, `_ref/`, `_ops/`, and secrets.
- Consumer/test surface: adoption planner, init, migration-script, hook
  projection, reclaim-runtime, helper-contract, action-skill, and architecture
  docs/tests.

## P2: Concrete Trace

Today, `repo-harness adopt --apply` parses options in `index.ts` -> builds
`runInit()` options -> invokes the shell migrator -> the shell mutates the repo
from assets and helpers -> `runInit()` registers the repo, ensures CodeGraph,
and verifies the workflow.  In parallel, `adopt --dry-run` and
`--experimental-ts-apply` go through `planAdoption()` ->
`applyAdoptionPlan()` -> transaction backup/manifest -> registry registration.
This has two apply authorities with different visible results.

After cutover, every repo-local mutation follows one trace:

```text
adopt CLI -> validate target/mode -> planAdoption -> preflight full operation set
         -> applyAdoptionPlan transaction -> manifest/rollback evidence
         -> register repo -> CodeGraph readiness -> handoff + strict workflow check
         -> one structured adoption result
```

## P3: Decision

Choose one breaking cutover: first express every current standard shell
migration mutation as a deterministic TypeScript operation, then route standard
apply to that plan and delete the shell migration entry.  This is the smallest
coherent change because merely defaulting existing safe-subset TS apply would
silently omit hooks, legacy archives, policy/context, reference docs, ops, and
package-script work.  A `--legacy-shell-apply` route is rejected: it preserves
dual authority and violates the explicit no-compatibility rule.

The fragile assumption is that every shell-owned mutation can be classified as
known-generated or user-owned using current assets and fixtures.  If a target
cannot be classified, planning must fail before writes rather than infer
ownership.  At 10x, transaction manifests and deterministic operation order are
the limiting correctness boundary; a global operation preflight plus recoverable
partial-apply evidence is required before default routing.

## Scope

### In Scope

1. Extend the operation model and transaction executor to represent the current
   standard shell migration exactly: asset projection/replacement,
   managed-block update, merge-JSON, archive/move, known-generated remove and
   untrack, package-script merge, workflow/context/policy/state generation,
   legacy workflow/doc/ops migration, hook projection, and verification steps.
2. Make the planner produce one ordered standard-mode operation list from the
   canonical assets and existing ownership classifiers; preflight the full list
   before the first mutation, persist applied/failed operation evidence, and
   make rollback fail closed when post-apply user edits are detected.
3. Promote the TypeScript apply path to ordinary `adopt` standard apply;
   preserve repo registration, CodeGraph readiness, handoff refresh, and strict
   workflow verification in `adopt-plan.ts` as explicit post-apply effects.
4. Delete `--experimental-ts-apply`, its report schema, the shell-default
   routing, `scripts/migrate-project-template.sh`, its packaged helper entry,
   and all active docs/tests/workflow-contract references.  Remove retired
   no-op compatibility switches from the `adopt` command at the same time.
5. Keep `minimal` as a fully supported planner/applicator mode.  Keep
   `self-host` apply fail-closed before writes until its manual runtime-review
   operation has a deterministic ownership model; it has no shell default
   apply behavior to preserve.  Make reclaim/compact explicit planner-backed
   post-apply operations or reject them before writes if their operation plan
   is not complete; do not route them to `runInit()`.
6. Update public architecture/reference/setup docs and regression fixtures so
   the documented and executable adoption contract have one source of truth.

### Out of Scope

- User-level host adapter installation, global skill installation, global
  CodeGraph MCP configuration, or brain-root setup; public `adopt` already
  disables them and they remain `install`/`setup` responsibilities.
- A monorepo, new package, external service, or new runtime dependency.
- Changing the semantics of custom user-owned files or automatically resolving
  an ambiguous ownership classification.
- Release publication.  This work-package ends at a reviewed PR and verified
  repository state.

## Public Contract Changes

- Removed: `repo-harness adopt --experimental-ts-apply` and its
  `experimentalTsApply` JSON field.
- Removed: `adopt` compatibility no-op flags and shell-migrator behavior.
- Changed: ordinary `repo-harness adopt --mode standard` returns the
  transaction-backed structured adoption result; `--dry-run` is the same plan
  with no write effects.
- Preserved: `adopt rollback --transaction <manifest>`, explicit `--repo`,
  `--dry-run`, JSON/text plan rendering, `minimal`, and fail-closed
  `self-host` apply.

## Implementation Steps

1. Inventory the shell migrator's writes against assets and existing tests;
   encode their ownership and ordering in the operation model rather than
   copying shell orchestration into a second TypeScript interpreter.
2. Implement the missing operation applicators and a full-plan preflight /
   transaction manifest path.  For each destructive operation, record the
   exact rollback strategy and reject ambiguous or user-modified targets.
3. Move deterministic legacy-document, sprint, ops, hook, reference-config,
   policy/context, state-surface, and package-script transformations into
   planner-owned modules.  Delete the corresponding adoption uses of shell
   helpers after their tests prove parity.
4. Replace `index.ts` routing with the canonical apply result, run the explicit
   registry/CodeGraph/handoff/workflow post-apply sequence, and make every
   unsupported mode/option fail before writes.
5. Delete the experimental/shell public surfaces and update contract inventory,
   docs, fixtures, tests, and architecture records in the same commit series.

## Verification

```bash
bun test tests/cli/adoption-plan.test.ts tests/cli/init.test.ts tests/cli/init-hook.test.ts tests/migration-script.test.ts tests/hook-recursive-copy.test.ts tests/helper-scripts.test.ts tests/reclaim-runtime.test.ts
bun run check:type
bun run check:hooks
bun run check:helpers
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun test
```

Manual acceptance:

- Standard and minimal dry-run/apply produce the same operation authority and
  an executable transaction manifest.
- Fixture repos prove current shell-migrator outcomes are reproduced without
  invoking a shell apply path.
- A mixed unsupported/ambiguous plan fails before any write; a forced apply
  failure records recoverable state and never reports success.
- Rollback restores only transaction-owned changes and refuses post-apply user
  edits.
- `rg` over active source/docs/tests/workflow contract finds no shell adoption
  route, experimental flag, alias, or legacy fallback.

## Rollback

Revert the reviewed B2 commit series.  Downstream adoption transactions retain
their manifests and use `repo-harness adopt rollback --transaction <manifest>`;
no database, hosted configuration, or user-level credential state changes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Implementation Safety Clarification

The captured shell inventory moved selected `_ops/` files and retired
repo-local adapter configuration. That conflicts with the stated invariant to
preserve `_ops/`, secrets, and custom hooks, because neither surface has a
deterministic generated-ownership proof. The TypeScript planner therefore
preserves both surfaces, fails closed on archive or move collisions, and only
removes byte-identical known-generated assets. `--reclaim-runtime` and
`--compact` are rejected before writes until they can be represented in the
same transaction and rollback manifest.

## Task Breakdown
- [x] B2-01 model the complete standard adoption operation set and prove ownership/preflight before mutation
- [x] B2-02 extend the transaction executor, manifest, and rollback guards for every supported destructive operation
- [x] B2-03 move shell-owned workflow, hook, context, reference, deploy scaffold, legacy-archive, and package-script transformations into the planner
- [x] B2-04 route ordinary adopt through the canonical TS result and preserve only explicit registry/CodeGraph/handoff/workflow effects
- [x] B2-05 delete experimental, shell, helper-contract, and no-op compatibility surfaces; update active documentation and fixtures
- [x] B2-06 run parity, focused, full, workflow, review, archive, and PR closeout evidence
