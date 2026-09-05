# Plan: Context map drift check and one-shot repair

> **Status**: Executing
> **Created**: 20260906-0323
> **Slug**: context-map-drift-check
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Fixture tests, writer regression, check:context-map on this repo, helper projection, integrity checks; no full suite
> **Rollback Surface**: Revert only codex/context-map-drift-check
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260906-0323-context-map-drift-check.contract.md`
> **Task Review**: `tasks/reviews/20260906-0323-context-map-drift-check.review.md`
> **Implementation Notes**: `tasks/notes/20260906-0323-context-map-drift-check.notes.md`
> **Substantive Change SHA256**: `sha256:f4e9864858657599be3e72e39abf23cdc6bd2e347160ed2be3d185dcd5b9bc1e`

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

- Active plan: `plans/plan-20260906-0323-context-map-drift-check.md`
- Sprint contract: `tasks/contracts/20260906-0323-context-map-drift-check.contract.md`
- Sprint review: `tasks/reviews/20260906-0323-context-map-drift-check.review.md`
- Implementation notes: `tasks/notes/20260906-0323-context-map-drift-check.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260906-0323-context-map-drift-check.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260906-0323-context-map-drift-check.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260906-0323-context-map-drift-check.md`.

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
- Contract file: `tasks/contracts/20260906-0323-context-map-drift-check.contract.md`
- Review file: `tasks/reviews/20260906-0323-context-map-drift-check.review.md`
- Implementation notes file: `tasks/notes/20260906-0323-context-map-drift-check.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260906-0323-context-map-drift-check.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260906-0323-context-map-drift-check.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert only codex/context-map-drift-check
- **Verification boundary**: Fixture tests, writer regression, check:context-map on this repo, helper projection, integrity checks; no full suite
- **Review/acceptance boundary**: `tasks/reviews/20260906-0323-context-map-drift-check.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260906-0323-context-map-drift-check.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260906-0323-context-map-drift-check.contract.md`, `tasks/reviews/20260906-0323-context-map-drift-check.review.md`, and `tasks/notes/20260906-0323-context-map-drift-check.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260906-0323-context-map-drift-check.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert only codex/context-map-drift-check

## Captured Planning Output

## Goal
`.ai/context/context-map.json#discoverable_contexts` becomes a checked projection: a `check:context-map` gate fails when a capability-contract entry points at a missing file, a root context file, a capability with no live archcontext node, or a matched prefix the node does not own; when two entries share a path; or when a nested contract file on disk with an `ARCHITECTURE CONTRACT` block is not mapped. The current map is repaired once in the same change, and both writers stop emitting the entries the gate forbids.

## P1 Map
`.ai/context/context-map.json` has 18 `discoverable_contexts` entries: 14 `purpose: capability-contract` entries plus 2 glob entries (`docs/reference-configs/*.md`, `tasks/workstreams/**/*.md`) plus root-file entries. Writers: `scripts/context-contract-sync.sh:320-350` and `scripts/architecture-event.ts:1125-1145` (same push-if-path-absent logic, copied; both projected into `assets/templates/helpers/`). Readers: no `src/` runtime consumer reads `discoverable_contexts`; `src/effects/evidence/recovery-materializer.ts:386` only resolves the file path; `src/core/adoption/standard-plan.ts:851` scaffolds an empty array on init. `scripts/check-task-workflow.sh:1158` only asserts the file exists. Capability authority is archcontext nodes (`.archcontext/model/nodes/*.yaml`, 56 nodes, `policy.json#context.capability_source = "archcontext"`); `src/core/capabilities/registry.ts` (`capabilityRegistryFromArchcontextNodes`, `archcontextIncludeToPrefix`, `matchCapabilityPath`) is the one resolver from node to prefix. `assets/hooks/projection.json` declares `.ai/hooks/` as a generated projection of `assets/hooks/`. Contract files on disk (non-root, containing `BEGIN ARCHITECTURE CONTRACT`): `assets/{CLAUDE,AGENTS}.md`, `assets/hooks/{CLAUDE,AGENTS}.md`, `scripts/{CLAUDE,AGENTS}.md`, and the generated `.ai/hooks/{CLAUDE,AGENTS}.md`.

## P2 Trace
An architecture event for a changed path resolves a capability and matched prefix, renders the contract block into `<prefix>/CLAUDE.md` and `AGENTS.md`, then calls the writer, which pushes a map entry keyed by path if absent. When the matched prefix is the repo root (nodes whose include is a root file such as `SKILL.md`, `README.md`, `package.json`), the contract path is root `CLAUDE.md`, so the writer appended root entries. Observed result: root `CLAUDE.md` and `AGENTS.md` each appear 5 times under 5 different `capability_id`s (`public-surface-root-router`, `public-surface-action-commands`, `workflow-engine-inspection-migration`, `verification-codegraph-readiness`, `verification-evals-checks`). The path-dedupe did not stop this because the entries predate it or because the dedupe is by path only after the first insertion per writer invocation; the plan does not depend on which. Nothing ever prunes, so a removed or renamed contract stays mapped forever. The pressure point is a writer with no invariant and a projection with no check.

## P3 Decision
Add `scripts/check-context-map.ts` (bun, self-host and projected helper like the other `check:*` scripts if the helper projection requires it) with two modes: default check, and `--write` one-shot repair. The check derives facts only from existing authorities: archcontext nodes through `capabilityRegistryFromArchcontextNodes` for capability ids, domains, and include prefixes; `policy.json#context.map_file` for the map path; `assets/hooks/projection.json` (or the policy field that names it, if one exists) for the generated-projection exemption; disk for file existence and `BEGIN ARCHITECTURE CONTRACT` presence. Invariants, each reported with the offending entry or path:
1. No two `discoverable_contexts` entries share a `path`.
2. A `capability-contract` entry's `path` exists, is not one of `root_context_files`, and its directory equals `matched_prefix`.
3. Its `capability_id` resolves to a live archcontext node whose include prefixes contain `matched_prefix`; `architecture_domain` and `architecture_capability` match that node.
4. Every non-root `CLAUDE.md`/`AGENTS.md` on disk containing `BEGIN ARCHITECTURE CONTRACT` is mapped, except files under a declared generated projection target.
Non-contract glob entries are left untouched and validated only for rule 1. `--write` rebuilds the `capability-contract` subset from rule 4's disk set plus the node facts, preserving glob and other entries and existing `verification_hint` values where the path is retained; it fails closed if any disk contract cannot be resolved to a node. Both writers gain the same guard at the push site: skip and log when the contract path is a root context file. Wire `check:context-map` in `package.json` and as a named `[ci] context map` step in `scripts/check-ci.sh` in the workflow-checks block. Tradeoff: two duplicated writers are guarded rather than unified; unification is a separate slice because `context-contract-sync.sh` is a projected shell helper with its own downstream consumers. At 10x nodes, rule 4's disk walk is the first cost; it is bounded to `CLAUDE.md`/`AGENTS.md` names and skips ignored roots.

## Scope
`scripts/check-context-map.ts` (new); `tests/check-context-map.test.ts` (new); `scripts/context-contract-sync.sh` and `scripts/architecture-event.ts` root-path guard plus their `assets/templates/helpers/` projections; `.ai/context/context-map.json` one-shot repair; `package.json`; `scripts/check-ci.sh`; `tests/bootstrap-files.test.ts` if it asserts the step list; this plan. No changes to archcontext nodes, `src/core/capabilities/registry.ts`, root `CLAUDE.md`/`AGENTS.md`, or any nested contract file content.

## Task Breakdown
- [x] RED tests in a disposable fixture repo: duplicate path, missing file, root path, dead capability id, prefix not owned by node, unmapped disk contract, and generated-projection exemption each fail the check with a named finding; a clean fixture passes; `--write` repairs and re-check passes.
- [x] Implement `scripts/check-context-map.ts` using `capabilityRegistryFromArchcontextNodes` and the policy map path; fail closed on unreadable map, nodes, or policy.
- [x] Add the root-path guard to both writers and regenerate helper projections; add a regression test on the existing writer test surface (`tests/architecture-event.test.ts` or `tests/hook-contracts.test.ts`) proving a root-prefix event no longer appends a root entry.
- [x] Run `--write` once on this repo, commit the repaired map, and record before/after entry counts in Verification Results.
- [x] Wire `check:context-map` in package.json and the named step in check-ci.sh; run the verification commands.

## Promotion Gate

- **Merge/PR unit**: one PR adding the gate, the writer guard, and the repaired map.
- **Rollback surface**: revert the branch; the map returns to its prior drifted content, nothing else migrates.
- **Verification boundary**: new focused test file, writer regression test, `bun run check:context-map` on this repo, helper projection check, integrity checks.
- **Review/acceptance boundary**: gatekeeper review against this plan.
- **High-risk surface**: `--write` deleting entries that something depends on. Mitigation: no `src/` consumer exists (P1); the removed entries are exactly the root duplicates; the diff of the map is reviewed line by line.
- **Why not checklist row**: independent gate with its own merge and rollback boundary and a one-shot data repair.

## Evidence Contract

- **State/progress path**: this plan's Task Breakdown.
- **Verification evidence**: Verification Results below.
- **Evaluator rubric**: `check:context-map` is red on `origin/main`'s map and green after `--write`; each of the seven fixture cases fails with its named finding; a root-prefix architecture event no longer appends a root entry; `check-ci.sh` carries the named step.
- **Stop condition**: Task Breakdown complete and verification commands pass; report blockers without widening scope.
- **Rollback surface**: revert only this branch.

## Verification Commands

```bash
bun test tests/check-context-map.test.ts --timeout 60000
bun test tests/architecture-event.test.ts tests/hook-contracts.test.ts --timeout 60000
bun run check:context-map
bun run check:helpers
bash -n scripts/check-ci.sh
bun run check:type
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

Focused fixture tests plus the writer regression and projection checks cover this slice; the writer guard is a skip branch with no other behavior change, so no full suite.

## Verification Results

Falsifier (`rg -n 'discoverable_contexts' src scripts --glob '*.ts'`): five hits, no runtime consumer. `scripts/architecture-event.ts:1103,1129,1136,1137` is the writer; `src/core/adoption/standard-plan.ts:854` scaffolds an empty array. No reader resolves an entry by `capability_id`, so the root duplicates are safe to remove.

Pre-repair run (`/tmp/context-map-repo-red.log`): `bun scripts/check-context-map.ts` exit 1 with 18 findings -- 10 `root_path` and 8 `duplicate_path` on root `CLAUDE.md` / `AGENTS.md`.

Map repair: **18 entries / 16 capability-contract before**, **8 entries / 6 capability-contract after**; the diff is 150 deleted lines and no other change. Removed entries:

| Path | Capability id |
|------|---------------|
| `CLAUDE.md` | `public-surface-root-router` |
| `AGENTS.md` | `public-surface-root-router` |
| `CLAUDE.md` | `public-surface-action-commands` |
| `AGENTS.md` | `public-surface-action-commands` |
| `CLAUDE.md` | `workflow-engine-inspection-migration` |
| `AGENTS.md` | `workflow-engine-inspection-migration` |
| `CLAUDE.md` | `verification-codegraph-readiness` |
| `AGENTS.md` | `verification-codegraph-readiness` |
| `CLAUDE.md` | `verification-evals-checks` |
| `AGENTS.md` | `verification-evals-checks` |

Retained: `assets/{CLAUDE,AGENTS}.md`, `assets/hooks/{CLAUDE,AGENTS}.md`, `scripts/{CLAUDE,AGENTS}.md`, plus the two untouched glob entries. `.ai/hooks/{CLAUDE,AGENTS}.md` stay exempt as the declared `assets/hooks` projection target.

| Command | Outcome |
|---------|---------|
| `bun test tests/check-context-map.test.ts --timeout 60000` | 14 pass, 0 fail |
| `bun test tests/architecture-event.test.ts tests/hook-contracts.test.ts --timeout 60000` | 35 pass, 0 fail |
| `bun run check:context-map` | OK, 6 capability-contract entries, 8 total |
| `bun run check:helpers` | projection OK: 56 helpers |
| `bash -n scripts/check-ci.sh` | exit 0 |
| `bun run check:type` | exit 0 |
| `bash scripts/check-deploy-sql-order.sh` | `[deploy-sql] OK` |
| `bash scripts/check-architecture-sync.sh` | `mode=strict changed_capabilities=4 blocking=0`; projection `state=ready blocking=0` |
| `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh` | bound canonical evidence `sha256:f4e98648...`, exit 0 |
| `bash scripts/check-task-workflow.sh --strict` | `[workflow] OK` |
| `bun scripts/inspect-project-state.ts --repo . --format text` | `drift_signals: (none)`, exit 0 |
| `bun src/cli/index.ts init --repo . --dry-run` | exit 0 |

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] RED tests in a disposable fixture repo: duplicate path, missing file, root path, dead capability id, prefix not owned by node, unmapped disk contract, and generated-projection exemption each fail the check with a named finding; a clean fixture passes; `--write` repairs and re-check passes.
- [x] Implement `scripts/check-context-map.ts` using `capabilityRegistryFromArchcontextNodes` and the policy map path; fail closed on unreadable map, nodes, or policy.
- [x] Add the root-path guard to both writers and regenerate helper projections; add a regression test on the existing writer test surface (`tests/architecture-event.test.ts` or `tests/hook-contracts.test.ts`) proving a root-prefix event no longer appends a root entry.
- [x] Run `--write` once on this repo, commit the repaired map, and record before/after entry counts in Verification Results.
- [x] Wire `check:context-map` in package.json and the named step in check-ci.sh; run the verification commands.
