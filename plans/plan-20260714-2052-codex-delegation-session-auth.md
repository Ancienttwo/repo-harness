# Plan: Codex delegation auto-mode de-escalation to session-level authorization

> **Status**: Executing
> **Created**: 20260714-2052
> **Slug**: codex-delegation-session-auth
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Hook projection sync (check:hooks), hook contract/dispatcher tests, EXECUTION_BOUNDARY parity test, and full bun test must pass; codex+auto plain prompts must produce zero advisor output and zero state writes
> **Rollback Surface**: Single-commit work-package on isolated codex/<slug> worktree; revert restores per-prompt auto injection; no data migration or install-surface change
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md`
> **Task Review**: `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md`
> **Implementation Notes**: `tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md`

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

- Active plan: `plans/plan-20260714-2052-codex-delegation-session-auth.md`
- Sprint contract: `tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md`
- Sprint review: `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md`
- Implementation notes: `tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-2052-codex-delegation-session-auth.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-2052-codex-delegation-session-auth.md`.

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
- Contract file: `tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md`
- Review file: `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md`
- Implementation notes file: `tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-2052-codex-delegation-session-auth.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single-commit work-package on isolated codex/<slug> worktree; revert restores per-prompt auto injection; no data migration or install-surface change
- **Verification boundary**: Hook projection sync (check:hooks), hook contract/dispatcher tests, EXECUTION_BOUNDARY parity test, and full bun test must pass; codex+auto plain prompts must produce zero advisor output and zero state writes
- **Review/acceptance boundary**: `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-2052-codex-delegation-session-auth.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md`, `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md`, and `tasks/notes/20260714-2052-codex-delegation-session-auth.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single-commit work-package on isolated codex/<slug> worktree; revert restores per-prompt auto injection; no data migration or install-surface change

## Captured Planning Output

# Codex delegation auto-mode de-escalation: per-prompt injection -> session-level standing authorization

## Root cause being fixed

`assets/hooks/codex-delegation-advisor.sh` (UserPromptSubmit, Codex host only): when the
effective delegation mode resolves to `auto` (global `~/.repo-harness/config.json`
`delegation.mode` takes precedence over repo `policy.json`), the advisor injects the FULL
delegation + contract-authority context ("Treat the active task contract as the
authoritative execution brief ... Do not re-derive scope from this conversation") on EVERY
user prompt unless a narrow `isDelegationDiscussion` regex matches. It never checks whether
an active contract exists and never considers the user's current intent, and it writes
delegation state files (`.ai/harness/delegation/turns/*.json` + `latest.json`) on every
prompt. Observed failure: the user asks why execution is slow / asks for status, and Codex
is simultaneously told to keep executing Exit Criteria and to distrust the conversation.

Design error: standing authorization is session/policy-level state, being re-asserted as
message-level state. Claude parity: the Agent tool is ambient capability; no per-message
authorization exists, and the model decides when to delegate.

## Target behavior

- SessionStart (Codex host, effective mode auto): inject ONE compact standing-authorization
  block for bounded native subagent delegation, valid for the whole session.
- UserPromptSubmit advisor: injects ONLY on explicit triggers (`/delegate`, `/parallel`,
  "spawn subagents", "use multiple agents", parallel-agents phrasing, Chinese equivalents),
  identical for auto and explicit modes. No trigger -> exit 0, no output, no state write.
- Delegation state files are written only at explicit-trigger dispatch turns.
- Claude host behavior: completely unchanged.

## In scope (file changes)

1. `assets/hooks/codex-delegation-advisor.sh`
   - Delete the auto-mode injection branch: no explicit trigger -> exit 0, always.
   - Delete `readGlobalDelegationMode` / `effectiveDelegationMode` resolution (dead after
     the branch removal; the resolution logic relocates to session-start-context.sh).
   - State object: `explicit` is now always true at write time; `mode: "explicit"`,
     `trigger: <trigger name>`, `stop_fallback: true` (current explicit-path values).
   - Injected context: keep the explicit-branch text, contract-authority paragraph,
     runner-preference paragraph, rules list, and EXECUTION_BOUNDARY block byte-identical
     (parity test with contract-run/subagent-start/codex-goal must keep passing). Delete
     the auto-branch sentence ("Repo policy delegation.mode=auto is standing user
     authorization ...").
   - Keep triggers, `isDelegationDiscussion` skip, lock protocol, per-turn scope files.
2. `assets/hooks/session-start-context.sh`
   - New compact block, emitted only when `HOOK_HOST == codex` AND effective delegation
     mode resolves to `auto` (same precedence rule: global config overrides repo policy;
     relocate the resolution logic here).
   - Content (~8-10 lines, plain statements): delegation.mode=auto is standing user
     authorization for bounded native subagent delegation for this session; spawn only
     when at least two independent bounded workstreams exist; at most
     `policy.delegation.max_agents` agents; never overlapping write ownership; pass
     fork_turns="none" with agent_type; close finished agent threads; do not spawn for
     trivial or strictly sequential work. NO contract-authority assertion, NO Exit
     Criteria continuation language, NO execution-boundary block (those stay on dispatch
     surfaces).
   - Must stay within the session context budget check if one applies to this block.
3. `.ai/harness/policy.json` `delegation.rule`: rewrite to the new semantics (auto =
   standing session-level authorization injected once at SessionStart; UserPromptSubmit
   injects only on explicit triggers in both modes). `rg` for copies of the old rule
   sentence under `assets/` (product templates / adopt planner fixtures) and update every
   copy; do NOT touch `assets/workflow-contract.v1.json` / `.ai/harness/workflow-contract.json`
   unless the rule text is literally embedded there (current grep says it is not).
4. Projections: run `bun run sync:hooks`, then `bun run check:hooks`. Never hand-edit
   `.ai/hooks/*`.
5. Tests:
   - `tests/cli/hook.test.ts`: rewrite the auto-mode dispatcher tests — policy auto + no
     trigger -> NO injection and NO state file; global-auto-precedence tests re-target the
     SessionStart surface; explicit trigger still injects with `state.explicit === true`.
   - `tests/hook-contracts.test.ts`: drop/replace the `"auto-mode"` advisor content
     assertion; assert the advisor no longer contains the auto standing-authorization
     sentence and session-start-context now contains it.
   - Add SessionStart assertions: codex host + auto -> block present exactly once; codex
     host + explicit -> absent; claude host -> absent.
   - `tests/workflow-contract.test.ts` only if the rule text is asserted there.

## Out of scope (forbidden design space)

- No changes to stop-orchestrator delegation fallback semantics (already explicit-only:
  it blocks only on `state.explicit === true`).
- No changes to contract-run, subagent-start-context, or MCP codex-goal
  EXECUTION_BOUNDARY parity surfaces beyond keeping the parity test green.
- No new intent classifier, prompt-shape gating, or per-prompt machinery of any kind.
- No benchmark/verifier changes (owned by verifier-evidence-lifecycle-cutover).
- No changes to Claude-host hook behavior or to `~/.repo-harness/config.json`.

## Falsifier

The direction is wrong if: a plain question/status prompt under global auto still receives
`[repo-harness:delegation]` context or writes delegation state; or explicit `/delegate` no
longer injects; or Claude-host session context changes at all; or the EXECUTION_BOUNDARY
parity test fails; or the session-start block exceeds ~15 lines.

## Task Breakdown

- [ ] Advisor: delete auto branch + dead mode resolution; state writes explicit-only
- [ ] Session-start: add codex+auto standing-authorization block with relocated mode resolution
- [ ] policy.json delegation.rule rewrite + sweep for template copies of the old sentence
- [ ] `bun run sync:hooks` + `bun run check:hooks`
- [ ] Test updates (hook.test.ts, hook-contracts.test.ts, session-start assertions)
- [ ] Full verification: `bun test`, root required checks

## Exit Criteria (commands)

- `bun run check:hooks`
- `bun test tests/cli/hook.test.ts tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/workflow-contract.test.ts`
- `bun test`
- `bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh`
- `rg -n "standing user authorization" assets/hooks/codex-delegation-advisor.sh` returns nothing;
  same sentence present once in `assets/hooks/session-start-context.sh`.

## Rollback surface

Single-commit work-package on an isolated `codex/<slug>` worktree; revert restores
per-prompt auto injection. No data migration, no install-surface change; self-host repo
pins `hook_source: repo` so behavior flips at merge, downstream repos pick it up with the
next package update.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Advisor: delete auto branch + dead mode resolution; state writes explicit-only
- [ ] Session-start: add codex+auto standing-authorization block with relocated mode resolution
- [ ] policy.json delegation.rule rewrite + sweep for template copies of the old sentence
- [ ] `bun run sync:hooks` + `bun run check:hooks`
- [ ] Test updates (hook.test.ts, hook-contracts.test.ts, session-start assertions)
- [ ] Full verification: `bun test`, root required checks
