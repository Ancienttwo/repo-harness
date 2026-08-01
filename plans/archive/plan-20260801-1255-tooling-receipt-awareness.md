# Plan: check-agent-tooling receipt-aware agent fleet drift

> **Status**: Archived
> **Created**: 20260801-1255
> **Slug**: tooling-receipt-awareness
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260801-1255-tooling-receipt-awareness.md`; after execution revert branch `codex/tooling-receipt-awareness` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md`
> **Task Review**: `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`
> **Implementation Notes**: `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`

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

- Active plan: `plans/plan-20260801-1255-tooling-receipt-awareness.md`
- Sprint contract: `tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md`
- Sprint review: `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`
- Implementation notes: `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260801-1255-tooling-receipt-awareness.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260801-1255-tooling-receipt-awareness.md`.

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
- Contract file: `tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md`
- Review file: `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`
- Implementation notes file: `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260801-1255-tooling-receipt-awareness.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260801-1255-tooling-receipt-awareness.md`; after execution revert branch `codex/tooling-receipt-awareness` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260801-1255-tooling-receipt-awareness.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md`, `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`, and `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260801-1255-tooling-receipt-awareness.md`; after execution revert branch `codex/tooling-receipt-awareness` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Make `scripts/check-agent-tooling.sh`'s agent fleet drift detection aware of the
user-managed receipt written by `scripts/install-agent-fleet.sh --accept-user-managed`,
so an operator-accepted customized Claude agent file (e.g. `~/.claude/agents/deep-reasoner.md`,
`~/.claude/agents/gatekeeper.md`) is reported as `user-managed`, not `drift`, while any
receipt that is missing, malformed, path-less, or hash-mismatched still fails closed to `drift`.

## Verified facts (from repo inspection)

- Receipt path: `~/.repo-harness/agent-fleet-user-managed.json`, written by
  `scripts/install-agent-fleet.sh --accept-user-managed`. Shape:
  `{ protocol: 1, authority: "user-managed-agent-fleet", accepted_at, files: [{ path: <absolute target path>, sha256: "sha256:<64hex>" }] }`.
  Reference implementation: `loadUserManagedReceipt()` in `scripts/install-agent-fleet.sh` (~L309-334).
- `scripts/check-agent-tooling.sh`'s `detectAgentFleetHost()` (~L875-935 pre-change) compared
  installed Claude `.md` files against the packaged `agents/fleet/<agent>.md` source using sha1
  (`readFileHash`/`sha1Buffer`), with zero receipt awareness. Any byte difference was reported as
  drift, producing a false positive for operator-accepted customized files.
- The receipt stores sha256; the installed-file comparison for receipt purposes must use sha256 of
  the *current* installed file content, not the existing sha1 comparison against packaged source.
- `scripts/check-agent-tooling.sh` and `assets/templates/helpers/check-agent-tooling.sh` are a
  synced pair; `scripts/` is canonical, `assets/templates/helpers/` is projected via
  `bun scripts/sync-helper-sources.ts --write`, verified with `--check`.

## Behavior spec

1. When an installed agent file differs from the packaged source, consult the receipt first: if
   the receipt is well-formed, contains an entry for that installed absolute path, and that
   entry's sha256 matches the sha256 of the file's *current* installed content, classify the file
   as `user-managed` and exclude it from drift.
2. Every other case still resolves to drift: receipt file absent, receipt malformed (wrong
   protocol/authority/shape, duplicate paths, malformed sha256 pattern), no entry for that path, or
   sha256 mismatch (edited again after acceptance). Fail closed: an invalid receipt exempts nothing.
3. Output: the drift message lists only real drift agents. When user-managed exemptions exist,
   print a separate explicit line (e.g. `user-managed (receipt): deep-reasoner, gatekeeper`) so the
   exemption is visible, not silently absorbed. When every agent is either synced or user-managed,
   `update_status` becomes the new terminal value `up-to-date` (matching this script's existing
   `up-to-date` vocabulary used elsewhere for CodeGraph project-index status), with a clear reason.
   Extend the JSON shape with a new `user_managed_agents` array alongside the existing
   `drift_agents`/`synced_agents`/`source_missing_agents`, following the script's existing shape;
   no aliasing, no dual-track.
4. Codex side `not-applicable` handling is untouched. `install-agent-fleet.sh` is untouched. No new
   `~/.repo-harness` write path is added; the checker stays read-only.

## Task Breakdown
- [x] Add a read-only `loadAgentFleetUserManagedReceipt()` reader plus a `sha256Buffer()` helper in `scripts/check-agent-tooling.sh`, mirroring `install-agent-fleet.sh`'s validation shape without its installer-specific `allowedPaths` gate (this checker's per-invocation host scope is narrower than the installer's fixed 12-path target set).
- [x] Rewire `detectAgentFleetHost()`'s claude branch so a hash mismatch first checks the receipt (sha256 of current installed bytes) before falling back to drift; add `userManagedAgents` alongside `driftAgents`/`syncedAgents`/`sourceMissingAgents`, and surface `user_managed_agents` in the returned object.
- [x] Rename the "no drift" terminal `update_status` value from `synced` to `up-to-date` (covering pure-synced and mixed synced/user-managed cases), with a reason that names the user-managed subset when present.
- [x] Add the `user-managed (receipt): <agents>` text-output line next to the existing `updates: ...` line.
- [x] Project the change into `assets/templates/helpers/check-agent-tooling.sh` via `bun scripts/sync-helper-sources.ts --write` and confirm `--check` is clean.
- [x] Add characterization tests in `tests/check-agent-tooling.test.ts` for: valid receipt exemption, receipt hash mismatch still drift, malformed receipt fails closed (exempts nothing even when a hash would otherwise match), and unchanged behavior with no receipt present.
- [x] Run `bun test`, `bun scripts/sync-helper-sources.ts --check`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, and a real-machine `bash scripts/check-agent-tooling.sh --host both --check-updates` smoke check against this machine's actual `~/.claude/agents/{deep-reasoner,gatekeeper}.md` receipt.
- [x] Commit as a single commit with no AI attribution; discard any side-effect `docs/architecture/requests/*` file the commit hook generates.

## Execution boundary

Implement exactly the behavior spec above. Do not modify `install-agent-fleet.sh` or any other
helper, do not add config flags, do not add a receipt migration or a new write path, do not push,
do not open a PR. Branch: `codex/tooling-receipt-awareness` (already created off a clean `main` at
`4089376b`).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a read-only `loadAgentFleetUserManagedReceipt()` reader plus a `sha256Buffer()` helper in `scripts/check-agent-tooling.sh`, mirroring `install-agent-fleet.sh`'s validation shape without its installer-specific `allowedPaths` gate (this checker's per-invocation host scope is narrower than the installer's fixed 12-path target set).
- [x] Rewire `detectAgentFleetHost()`'s claude branch so a hash mismatch first checks the receipt (sha256 of current installed bytes) before falling back to drift; add `userManagedAgents` alongside `driftAgents`/`syncedAgents`/`sourceMissingAgents`, and surface `user_managed_agents` in the returned object.
- [x] Rename the "no drift" terminal `update_status` value from `synced` to `up-to-date` (covering pure-synced and mixed synced/user-managed cases), with a reason that names the user-managed subset when present.
- [x] Add the `user-managed (receipt): <agents>` text-output line next to the existing `updates: ...` line.
- [x] Project the change into `assets/templates/helpers/check-agent-tooling.sh` via `bun scripts/sync-helper-sources.ts --write` and confirm `--check` is clean.
- [x] Add characterization tests in `tests/check-agent-tooling.test.ts` for: valid receipt exemption, receipt hash mismatch still drift, malformed receipt fails closed (exempts nothing even when a hash would otherwise match), and unchanged behavior with no receipt present.
- [x] Run `bun test`, `bun scripts/sync-helper-sources.ts --check`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, and a real-machine `bash scripts/check-agent-tooling.sh --host both --check-updates` smoke check against this machine's actual `~/.claude/agents/{deep-reasoner,gatekeeper}.md` receipt.
- [x] Commit as a single commit with no AI attribution; discard any side-effect `docs/architecture/requests/*` file the commit hook generates.
