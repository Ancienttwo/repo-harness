# Plan: Code Authority Foundation v1

> **Status**: Archived
> **Created**: 20260711-0139
> **Slug**: code-authority-foundation-v1
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Nine independently verifiable code-authority slices plus the repository required checks.
> **Rollback Surface**: Revert the contract commits on `codex/code-authority-foundation-v1`; no database or production-state migration is in scope.
> **Task Contract**: `tasks/contracts/20260711-0139-code-authority-foundation-v1.contract.md`
> **Task Review**: `tasks/reviews/20260711-0139-code-authority-foundation-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260711-0139-code-authority-foundation-v1.notes.md`

## Goal

Make code optimization in repo-harness obey four durable constraints: reason from first principles, keep one source of truth per datum, forbid steady-state compatibility behavior, and create abstractions only for observed shared invariants. Preserve the single-package release shape; use ArchContext and CodeGraph as advisory tooling rather than architecture authority.

## Agentic Routing

- Selected route: bounded multi-agent implementation with non-overlapping write ownership, followed by independent review.
- Routing reason: tooling/rules, helper/archive runtime, and MCP/core organization are independent implementation surfaces.
- P1 map: capability registry, workflow contract, canonical hook/helper sources, architecture modules, CLI/adoption, and MCP runtime.
- P2 trace: edit -> architecture queue -> capability resolver -> architecture module/workstream -> verification -> archive.
- P3 rationale: remove duplicate authority before splitting files; do not create a monorepo without a second independently released consumer.

## Chosen Approach

1. Resolve external-tool versions once, then exact-pin repository dependencies.
2. Distribute the four optimization constraints from canonical global rules.
3. Make capability and helper resolution fail closed instead of synthesizing legacy authority.
4. Convert packaged helpers into deterministic projections of canonical `scripts/` implementations.
5. Harden workflow and architecture archive evidence gates.
6. Extract only one proven MCP responsibility boundary while preserving public tool schemas.
7. Close and archive fulfilled workflow artifacts and remove retired static hook templates.

## EXECUTION_BOUNDARY (Non-Goals)

- Do not switch architecture authority from `.ai/context/capabilities.json` to ArchContext.
- Do not add `archctx` as a repository dependency or start/modify its daemon/model.
- Do not create Bun workspaces or split the npm package.
- Do not perform a broad Bash-to-TypeScript rewrite.
- Do not implement the later MCP rollout-flag removal or adoption-engine atomic cutover.
- Do not add compatibility wrappers, dual reads/writes, aliases, shadow parsers, telemetry, or optional integrations.
- Do not publish npm or GitHub releases in this work-package.

## Design Decisions

- Explicit one-shot migration is permitted only when it is operator-invoked, fail-closed, and removes the old path. Steady-state compatibility is forbidden.
- Availability degradation may select a different runner only on the same contract and must remain observable; it cannot change product semantics.
- `scripts/` becomes helper implementation authority; `assets/workflow-contract.v1.json` remains helper inventory authority.
- An internal source-projection module is justified by two real consumers: hooks and helpers.
- MCP path/authority extraction creates an internal safety module; it does not create a plugin interface or public API.

## Risk Controls

| Risk | Control |
|---|---|
| Helper projection omits an intentional divergence | Explicit divergence classification and byte-parity tests |
| Fail-closed resolution breaks malformed downstream installs | Clear migration/error command; no silent fallback |
| Archive moves incomplete artifacts | Contract/review/architecture verification before Completed |
| MCP path safety regression | Existing symlink, ignore, stale snapshot, and mutation tests |
| CodeGraph index-format drift | Exact pin rollback and rebuild of ignored `.codegraph/` |

## Task Breakdown

- [x] CO-00 exact-pin ArchContext contracts and CodeGraph tooling authority
- [x] CO-01 distribute first-principles, single-source, no-compatibility, and abstraction/monorepo rules
- [x] CO-02 make capability authority fail closed and cover real functional boundaries
- [x] CO-03 repair the adoption core-to-effects dependency direction
- [x] CO-04 establish one helper authoring source with deterministic projection
- [x] CO-05 make helper and workflow-contract resolution fail closed
- [x] CO-06 enforce archive evidence gates and transactional refresh
- [x] CO-07 extract MCP repo/path authority without changing public tool behavior
- [x] CO-08 synchronize architecture docs and close retired workflow/template artifacts

## Verification

- Focused tests named in the task contract pass after each slice.
- Full repository checks pass before review.
- `bun run check:hooks` and the new `bun run check:helpers` pass.
- `bash scripts/check-tarball-install-smoke.sh` proves packaged projections.
- A separate reviewer records `Recommendation: pass` against the final diff.

## Promotion Gate

- **Merge/PR unit**: the nine CO-00 through CO-08 slices form one authority cutover and are reviewed as one branch.
- **Rollback surface**: revert `codex/code-authority-foundation-v1`; no database, production runtime, or published package state changes.
- **Verification boundary**: focused authority/projection/archive/MCP tests, the repository required checks, helper/hook parity checks, tarball smoke, and full `bun test`.
- **Review/acceptance boundary**: `tasks/reviews/20260711-0139-code-authority-foundation-v1.review.md` must record a fresh passing independent review against the final implementation diff.
- **High-risk surface**: fail-closed capability/helper resolution, workflow archive gates, packaged projections, and MCP path authority.
- **Why not checklist row**: these changes cross runtime, distribution, architecture, and workflow evidence boundaries and must be reverted and verified together.

## Evidence Contract

- **State/progress path**: this plan, `tasks/contracts/20260711-0139-code-authority-foundation-v1.contract.md`, `tasks/reviews/20260711-0139-code-authority-foundation-v1.review.md`, and `tasks/notes/20260711-0139-code-authority-foundation-v1.notes.md`.
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, contract verification commands, helper/hook parity checks, tarball smoke, and full `bun test`.
- **Evaluator rubric**: the review must verify first-principles ownership, exactly one authority per datum, no steady-state compatibility path, justified abstractions only, unchanged public MCP schemas, and explicit failure behavior.
- **Stop condition**: every CO-00 through CO-08 task is complete, all required checks pass, the contract is Fulfilled, and an independent reviewer recommends pass.
- **Rollback surface**: revert the branch commit; the explicit stale-workflow archive moves are restored by the same revert.

## Handoff

- Execution branch: `codex/code-authority-foundation-v1`
- Contract: `tasks/contracts/20260711-0139-code-authority-foundation-v1.contract.md`
- Review: `tasks/reviews/20260711-0139-code-authority-foundation-v1.review.md`
- Notes: `tasks/notes/20260711-0139-code-authority-foundation-v1.notes.md`
