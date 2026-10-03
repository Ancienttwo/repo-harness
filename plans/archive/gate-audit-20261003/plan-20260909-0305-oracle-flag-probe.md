# Plan: Fail closed when the resolved oracle lacks repo-harness fork flags

> **Status**: Executing
> **Created**: 20260909-0305
> **Slug**: oracle-flag-probe
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Oracle capability probe and consult guard verified by tests/cli/chatgpt-browser.test.ts plus real doctor runs
> **Rollback Surface**: Before execution remove `plans/plan-20260909-0305-oracle-flag-probe.md`; after execution revert branch `codex/oracle-flag-probe` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-0305-oracle-flag-probe.contract.md`
> **Task Review**: `tasks/reviews/20260909-0305-oracle-flag-probe.review.md`
> **Implementation Notes**: `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`
> **Substantive Change SHA256**: `sha256:a0d017e76b2bf9f0d3addda1b8b97f4831c0ebd1aefaf6dcfee91a2690afc842`

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

- Active plan: `plans/plan-20260909-0305-oracle-flag-probe.md`
- Sprint contract: `tasks/contracts/20260909-0305-oracle-flag-probe.contract.md`
- Sprint review: `tasks/reviews/20260909-0305-oracle-flag-probe.review.md`
- Implementation notes: `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-0305-oracle-flag-probe.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-0305-oracle-flag-probe.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-0305-oracle-flag-probe.md`.

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
- Contract file: `tasks/contracts/20260909-0305-oracle-flag-probe.contract.md`
- Review file: `tasks/reviews/20260909-0305-oracle-flag-probe.review.md`
- Implementation notes file: `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-0305-oracle-flag-probe.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-0305-oracle-flag-probe.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260909-0305-oracle-flag-probe.md`; after execution revert branch `codex/oracle-flag-probe` or the explicitly reviewed diff.
- **Verification boundary**: Oracle capability probe and consult guard verified by tests/cli/chatgpt-browser.test.ts plus real doctor runs
- **Review/acceptance boundary**: `tasks/reviews/20260909-0305-oracle-flag-probe.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-0305-oracle-flag-probe.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-0305-oracle-flag-probe.contract.md`, `tasks/reviews/20260909-0305-oracle-flag-probe.review.md`, and `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-0305-oracle-flag-probe.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260909-0305-oracle-flag-probe.md`; after execution revert branch `codex/oracle-flag-probe` or the explicitly reviewed diff.

## Captured Planning Output

## Context

`chatgpt browser-doctor` reported `ready` for an upstream `@steipete/oracle@0.20.0`
binary that rejects the session-descriptor and evidence flags every browser consult
sends (`--write-session`, `--write-network-evidence`, `--write-conversation-evidence`,
`--browser-thinking-time`). Those flags exist only in the repo-harness Oracle fork, so
the doctor passed and the real consult died at argument parsing with
`error: unknown option '--write-session'` surfaced as `ORACLE_EXIT_NONZERO`.

## Decision

Extend the existing Oracle capability model instead of adding a parallel probe:
one `--dry-run json` acceptance probe, whose argument vector is built by
`buildOracleCommand` itself, reports `writeSession`, `networkEvidence`,
`conversationEvidence`, and `browserThinkingTime`. A missing capability surfaces
through the existing `missingCapabilities` / `agent_actions` path with a
fork-specific recovery, and `runOracleProvider` refuses pre-spawn with
`ORACLE_RUNTIME_FLAGS_UNSUPPORTED`.

## Task Breakdown

- [x] Probe runtime flag acceptance from a `buildOracleCommand`-derived argv with a drift check
- [x] Report the new capabilities through browser-doctor with fork-specific recovery
- [x] Refuse the real consult path before spawning when the flags are unsupported
- [x] Extend the oracle test fixture to accept or reject the dry-run probe and cover all three paths

## Verification

- `bun test --timeout 60000 tests/cli/chatgpt-browser.test.ts`
- Repository-integrity checks
- Real doctor against upstream 0.20.0 (action_required) and the fork build (ready)

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Probe runtime flag acceptance from a `buildOracleCommand`-derived argv with a drift check
- [x] Report the new capabilities through browser-doctor with fork-specific recovery
- [x] Refuse the real consult path before spawning when the flags are unsupported
- [x] Extend the oracle test fixture to accept or reject the dry-run probe and cover all three paths
