# Plan: chatgpt --thinking delegates validation to Oracle fail-closed

> **Status**: Executing
> **Created**: 20260829-1728
> **Slug**: oracle-thinking-passthrough
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bun test chatgpt-browser + mcp-tools suites plus full required checks
> **Rollback Surface**: single revert of this branch; no persisted state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260829-1728-oracle-thinking-passthrough.contract.md`
> **Task Review**: `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md`
> **Implementation Notes**: `tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md`

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

- Active plan: `plans/plan-20260829-1728-oracle-thinking-passthrough.md`
- Sprint contract: `tasks/contracts/20260829-1728-oracle-thinking-passthrough.contract.md`
- Sprint review: `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md`
- Implementation notes: `tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260829-1728-oracle-thinking-passthrough.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260829-1728-oracle-thinking-passthrough.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260829-1728-oracle-thinking-passthrough.md`.

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
- Contract file: `tasks/contracts/20260829-1728-oracle-thinking-passthrough.contract.md`
- Review file: `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md`
- Implementation notes file: `tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260829-1728-oracle-thinking-passthrough.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260829-1728-oracle-thinking-passthrough.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single revert of this branch; no persisted state
- **Verification boundary**: bun test chatgpt-browser + mcp-tools suites plus full required checks
- **Review/acceptance boundary**: `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260829-1728-oracle-thinking-passthrough.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260829-1728-oracle-thinking-passthrough.contract.md`, `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md`, and `tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single revert of this branch; no persisted state

## Captured Planning Output

# chatgpt browser-consult --thinking: delegate validation to Oracle fail-closed

## Problem

`repo-harness chatgpt browser-consult --thinking pro` fails with `invalid --thinking "pro"` because the wrapper hardcodes `ThinkingLevel = 'light' | 'standard' | 'extended' | 'heavy'` (src/cli/chatgpt-browser/types.ts:7) and re-validates in `parseThinking` (src/cli/commands/chatgpt.ts:112) and the MCP tool schema enum (src/cli/mcp/tools.ts:888, 1009). Oracle 0.18.0 browser mode accepts `light, standard, extended, extra-high, pro, heavy` plus ChatGPT UI aliases `instant, medium, high, xhigh`, and rejects invalid values fail-closed with a clear error (verified locally: `oracle --engine browser --browser-thinking-time bogus --dry-run json` → `error: option '--browser-thinking-time <level>' argument 'bogus' is invalid. Thinking time must be one of ...`).

## Decision (P3)

Remove the local whitelist entirely; Oracle is the single validation authority (fail-closed). The local list is the root cause of this drift and re-deriving the provider's accepted set violates the repo's one-source-of-truth rule. The wrapper passes the raw `--thinking` value through to `--browser-thinking-time` verbatim; an invalid value surfaces Oracle's own error. Native provider behavior unchanged (it rejects presence of `--thinking`, not specific values).

## Task Breakdown

- [x] `src/cli/chatgpt-browser/types.ts`: `ThinkingLevel` becomes `string` (passthrough; Oracle validates fail-closed) with a comment stating the authority.
- [x] `src/cli/commands/chatgpt.ts`: delete `parseThinking`; pass `rawOpts.thinking` through; update `--thinking` help text to name Oracle as validator with example values.
- [x] `src/cli/mcp/tools.ts`: drop the `enum` from the `thinking` schema property and the local `parseThinking` throw; schema description names Oracle 0.18 accepted values as examples.
- [x] `src/cli/chatgpt-browser/oracle-provider.ts`: confirm `buildOracleCommand` passthrough needs no change (already `--browser-thinking-time <value>`).
- [x] Tests (`tests/cli/chatgpt-browser.test.ts`, `tests/cli/mcp-tools.test.ts`): update/remove local-validation expectations; add passthrough coverage for `--thinking pro` → `--browser-thinking-time pro`; cover that a fake-oracle rejection of an invalid thinking value surfaces Oracle's error fail-closed.

## Oracles

- id: thinking-passthrough
  kind: test
  paths:
    - tests/cli/chatgpt-browser.test.ts
- id: mcp-schema
  kind: test
  paths:
    - tests/cli/mcp-tools.test.ts
- id: required-checks
  kind: command
  paths:
    - bun test --timeout 60000

## Verification

- `bun test --timeout 60000 tests/cli/chatgpt-browser.test.ts tests/cli/mcp-tools.test.ts`
- `bun test --timeout 60000` (full suite)
- `bun src/cli/index.ts chatgpt browser-consult --thinking pro --dry-run`-equivalent path exercised via tests with a fake oracle.

## Rollback

Single revert of this work-package branch; no persisted state or migration.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `src/cli/chatgpt-browser/types.ts`: `ThinkingLevel` becomes `string` (passthrough; Oracle validates fail-closed) with a comment stating the authority.
- [x] `src/cli/commands/chatgpt.ts`: delete `parseThinking`; pass `rawOpts.thinking` through; update `--thinking` help text to name Oracle as validator with example values.
- [x] `src/cli/mcp/tools.ts`: drop the `enum` from the `thinking` schema property and the local `parseThinking` throw; schema description names Oracle 0.18 accepted values as examples.
- [x] `src/cli/chatgpt-browser/oracle-provider.ts`: confirm `buildOracleCommand` passthrough needs no change (already `--browser-thinking-time <value>`).
- [x] Tests (`tests/cli/chatgpt-browser.test.ts`, `tests/cli/mcp-tools.test.ts`): update/remove local-validation expectations; add passthrough coverage for `--thinking pro` → `--browser-thinking-time pro`; cover that a fake-oracle rejection of an invalid thinking value surfaces Oracle's error fail-closed.
