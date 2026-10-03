# Plan: Single-source the herdr runtime pin

> **Status**: Executing
> **Created**: 20260909-1731
> **Slug**: herdr-pin-source
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Drift test plus CI install-step behavior must be verified independently of the rest of the tree
> **Rollback Surface**: Single commit revert restores the previous literals
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-1731-herdr-pin-source.contract.md`
> **Task Review**: `tasks/reviews/20260909-1731-herdr-pin-source.review.md`
> **Implementation Notes**: `tasks/notes/20260909-1731-herdr-pin-source.notes.md`

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

- Active plan: `plans/plan-20260909-1731-herdr-pin-source.md`
- Sprint contract: `tasks/contracts/20260909-1731-herdr-pin-source.contract.md`
- Sprint review: `tasks/reviews/20260909-1731-herdr-pin-source.review.md`
- Implementation notes: `tasks/notes/20260909-1731-herdr-pin-source.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-1731-herdr-pin-source.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-1731-herdr-pin-source.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-1731-herdr-pin-source.md`.

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
- Contract file: `tasks/contracts/20260909-1731-herdr-pin-source.contract.md`
- Review file: `tasks/reviews/20260909-1731-herdr-pin-source.review.md`
- Implementation notes file: `tasks/notes/20260909-1731-herdr-pin-source.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-1731-herdr-pin-source.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-1731-herdr-pin-source.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single commit revert restores the previous literals
- **Verification boundary**: Drift test plus CI install-step behavior must be verified independently of the rest of the tree
- **Review/acceptance boundary**: `tasks/reviews/20260909-1731-herdr-pin-source.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-1731-herdr-pin-source.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-1731-herdr-pin-source.contract.md`, `tasks/reviews/20260909-1731-herdr-pin-source.review.md`, and `tasks/notes/20260909-1731-herdr-pin-source.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-1731-herdr-pin-source.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single commit revert restores the previous literals

> **Substantive Change SHA256**: `sha256:aeff53c3a6b23b76f28ab8cd61d09d3481ebdf0c49263f0f93ecce899803cca3`

## Captured Planning Output

## Problem

The herdr runtime requirement is stated three times: `.github/workflows/ci.yml`
hardcodes the release tag, asset URL, and sha256; `scripts/check-agent-tooling.sh`
hand-codes the floor as a `minor < 9` regex plus a `>=0.9.0` literal in its strict
failure message; `docs/reference-configs/external-tooling.md` restates the number in
prose. Any version move requires four coordinated edits with no drift check.

## Decision

`.ai/harness/policy.json#external_tooling.herdr` becomes the single herdr pin,
owning `min_version` and the checksum-verified `release_assets` entry. It is chosen
over a new `.ai/harness/runtime-pins.json` because policy.json is the repo's
machine-readable workflow contract, already holds a per-tool block for every other
external tool (`waza`, `codegraph`, `archctx`, `agent_fleet`), and — unlike a
self-host-only file — already exists in every downstream repo, which matters because
`scripts/check-agent-tooling.sh` is mirrored verbatim into downstream repos through
`assets/templates/helpers/`.

Readers become projections: CI extracts version/url/sha with `jq` and asserts the
installed `herdr --version` equals the pin; the readiness script reads `min_version`
and semver-compares, failing closed when the pin is missing or malformed; docs name
the key instead of restating the number. The downstream policy seed
(`scripts/lib/project-init-lib.sh` and the `ensure-task-workflow.sh` pair) carries the
same block so downstream readiness keeps working, and `tests/herdr-runtime-pin.test.ts`
is the drift check over all four readers.

## Task Breakdown

- [x] Add `external_tooling.herdr` to `.ai/harness/policy.json`
- [x] Rewrite the CI install step to read the pin via `jq` and assert the reported version
- [x] Read the pin in `scripts/check-agent-tooling.sh` (plus asset mirror), removing the `<9` regex and the literal message
- [x] Point `docs/reference-configs/external-tooling.md` (plus asset mirror) at the key
- [x] Seed the pin into the downstream policy defaults
- [x] Add `tests/herdr-runtime-pin.test.ts` drift coverage

## Verification

- `bun test tests/herdr-runtime-pin.test.ts`
- `bun test tests/check-agent-tooling.test.ts`
- `bash scripts/check-agent-tooling.sh --host both`
- CI step simulation: `jq` extraction compared byte-for-byte against the removed literals
- Repository integrity checks

## Rollback

Revert the commit; the previous literals are restored in place and no state is migrated.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add `external_tooling.herdr` to `.ai/harness/policy.json`
- [x] Rewrite the CI install step to read the pin via `jq` and assert the reported version
- [x] Read the pin in `scripts/check-agent-tooling.sh` (plus asset mirror), removing the `<9` regex and the literal message
- [x] Point `docs/reference-configs/external-tooling.md` (plus asset mirror) at the key
- [x] Seed the pin into the downstream policy defaults
- [x] Add `tests/herdr-runtime-pin.test.ts` drift coverage
