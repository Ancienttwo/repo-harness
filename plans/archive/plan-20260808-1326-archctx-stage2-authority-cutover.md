# Plan: Stage 2: archcontext capability authority cutover (self-host)

> **Status**: Archived
> **Created**: 20260808-1326
> **Slug**: archctx-stage2-authority-cutover
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: handoff-20260808-s4-plus-20260705-s7
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: round-trip equality gate, full bun test, required checks, capability resolution smoke
> **Rollback Surface**: single squash PR revert restores registry authority
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md`
> **Task Review**: `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md`
> **Implementation Notes**: `tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: handoff-20260808-s4-plus-20260705-s7
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260808-1326-archctx-stage2-authority-cutover.md`
- Sprint contract: `tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md`
- Sprint review: `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md`
- Implementation notes: `tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260808-1326-archctx-stage2-authority-cutover.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260808-1326-archctx-stage2-authority-cutover.md`.

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
- Contract file: `tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md`
- Review file: `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md`
- Implementation notes file: `tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260808-1326-archctx-stage2-authority-cutover.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single squash PR revert restores registry authority
- **Verification boundary**: round-trip equality gate, full bun test, required checks, capability resolution smoke
- **Review/acceptance boundary**: `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260808-1326-archctx-stage2-authority-cutover.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md`, `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md`, and `tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260808-1326-archctx-stage2-authority-cutover.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single squash PR revert restores registry authority

## Captured Planning Output

# Stage 2: archcontext capability authority cutover (self-host)

## Problem / Why now

Stage 0 (`e6b80f23..44072aff`) landed the full archcontext file-source resolution chain behind `capability_source: "registry" | "archcontext"` — node YAML parsing, D2 include grammar, extensions three-key fail-closed validation, diagnostic codes, readiness probe — but this repo still runs on the legacy `.ai/context/capabilities.json` registry. The archctx side has delivered its Stage-2-gating items (handoff §3.1-5, verified on `arch-context` branch `codex/archctx-capability-docs-projection`, PR #96): capability summary projection with marker fidelity, P1/P2 diagram generation, agent-context wiring, freshness gate. Per the 20260705 §7 review, authority cutover was explicitly deferred to its own work-package. This is that work-package.

## Verified dependency state (2026-08-08 audit)

- archctx §3.1-5 delivered on branch; §3.6 (pathTemplate placement) ABSENT — blocks archctx's rendering of nested doc paths, explicitly does NOT block this cutover (handoff §3.6 wording; our resolver reads nodes directly).
- `archctx-contracts@0.3.0` pin stays (branch schema change is additive enum only, unreleased).
- Local archctx CLI is npm 0.3.0 without the new features — any delegation to the archctx CLI is out of scope for this slice.

## Decision

Cut this repo's capability authority over to `.archcontext/model/nodes/*.yaml`, one-way and fail-closed, absorbing the 20260705 §7 correction: `capabilities.json` retirement must migrate its consumer surfaces in the same package, not break them.

1. **One-shot migration script** (fail-closed, removed-with-legacy-path semantics per repo policy): derive 10 node YAML files from the current registry. Mapping table hardcoded (`verification-evals-checks` ↔ `capability.verification.evals-checks`). Each node: `schemaVersion: archcontext.node/v1`, `kind: capability`, `status: active`, `source.include` in D2 grammar (prefix dirs as `<dir>/**`, literal files bare), `extensions.contractFiles` / `extensions.lspProfile` / `extensions.verification` explicitly present (empty arrays allowed, missing keys are fail-closed per Stage 0 resolver). Round-trip gate: resolver output from nodes must equal resolver output from the registry (same 10 capabilities, same prefixes in order, same contract files, same architecture_module/workstream_dir paths) before the switch flips.
2. **Flip `policy.json` `context.capability_source` to `"archcontext"`.** Single direction; no dual-read.
3. **Retire `.ai/context/capabilities.json` with its consumer surfaces migrated in-package** (the §7 correction). Known consumers to update (from the 20260705 census; worker must re-verify by grep, not trust the list): workflow-contract requiredFiles assertions (bootstrap/workflow-contract/migration groups), context-map references, scaffold-parity snapshot, capability helper tests, `check-task-workflow` / `ensure-task-workflow` seeded expectations. Downstream-generated repos keep the registry default — only this repo's own file retires; scaffold templates for new repos are untouched except where they assert this repo's own state.
4. **Thin the post-edit drift card** to a checkpoint nudge (per handoff §4): the architecture drift card emitted on capability-file edits shrinks to a short nudge; `check-architecture-sync` keeps its current gating but stops implying the heavyweight manual-doc obligation. NO archctx CLI delegation in this slice (local CLI lacks the freshness gate; silent-break delegation violates no-fallback policy). Freshness delegation is a named follow-up gated on archctx release.
5. **Add ownership markers to the 10 baseline docs** (`docs/architecture/modules/<domain>/<capability>.md`): wrap the machine sections (intro blockquote, §1 P1, §2 P2) in `<!-- BEGIN/END -->` markers per handoff §2 partition; §3/§4/Backlog stay unmarked (human-owned). Byte-for-byte content preservation outside marker insertion.
6. **`.archcontext/model/nodes/` must be tracked** — verify no gitignore rule hides it (arch-context itself needed a re-include override; check ours).

## Out of scope

- `check-architecture-sync` freshness delegation to archctx (follow-up, gated on archctx §3.5 release + local CLI update).
- Projection takeover of the 10 docs' machine sections (gated on archctx §3.6 pathTemplate).
- Any archctx-contracts pin change; any arch-context repo change; PR #96 merge decision (owner's).
- Downstream scaffold defaults (new repos still get registry mode).

## Task Breakdown

- [x] Migration script: registry → 10 node YAMLs + round-trip equality gate; script retires with the registry in this same package.
- [x] Flip `capability_source` to `archcontext`; delete `.ai/context/capabilities.json`.
- [x] Migrate every consumer surface of the registry file (grep-verified census; workflow-contract requiredFiles, context-map, scaffold parity, helper tests, seeders).
- [x] Thin the post-edit drift card to a checkpoint nudge.
- [x] Add §2-partition ownership markers to the 10 baseline docs.
- [x] Verify `.archcontext/model/nodes/` is tracked (gitignore audit).
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`, `repo-harness run check-task-workflow --strict`, `bash scripts/check-architecture-sync.sh`, capability resolution smoke (`repo-harness run capability-resolver -- list` equivalent) all green.

## Falsifier

If the round-trip gate cannot reach equality (nodes-resolved registry ≠ file registry) for any capability, the D2 grammar or extensions mapping loses information the registry carries — stop and report the exact field before flipping anything. If a consumer surface cannot migrate without dual-authority (needs capabilities.json to coexist), the §7 concern is confirmed in a form this plan didn't absorb — stop and report.

## Rollback

Single squash PR; revert restores registry authority, the registry file, and the old drift card in one step. Nodes dir and markers are additive and inert under `capability_source: "registry"`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Migration script: registry → 10 node YAMLs + round-trip equality gate; script retires with the registry in this same package.
- [x] Flip `capability_source` to `archcontext`; delete `.ai/context/capabilities.json`.
- [x] Migrate every consumer surface of the registry file (grep-verified census; workflow-contract requiredFiles, context-map, scaffold parity, helper tests, seeders).
- [x] Thin the post-edit drift card to a checkpoint nudge.
- [x] Add §2-partition ownership markers to the 10 baseline docs.
- [x] Verify `.archcontext/model/nodes/` is tracked (gitignore audit).
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`, `repo-harness run check-task-workflow --strict`, `bash scripts/check-architecture-sync.sh`, capability resolution smoke (`repo-harness run capability-resolver -- list` equivalent) all green.
