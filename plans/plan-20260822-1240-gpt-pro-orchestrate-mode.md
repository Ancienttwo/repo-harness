# Plan: GPT Pro Advisory Orchestration Mode

> **Status**: Executing
> **Created**: 20260822-1240
> **Slug**: gpt-pro-orchestrate-mode
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Canonical ChatGPT Skill protocol closure plus one real Codex IAB end-to-end canary and root required checks.
> **Rollback Surface**: Revert the canonical router, orchestrate reference, focused tests, operator documentation, and workflow artifacts together; no runtime or schema migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md`
> **Task Review**: `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md`
> **Implementation Notes**: `tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md`
- Sprint contract: `tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md`
- Sprint review: `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md`
- Implementation notes: `tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md`.

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
- Contract file: `tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md`
- Review file: `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md`
- Implementation notes file: `tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the canonical router, orchestrate reference, focused tests, operator documentation, and workflow artifacts together; no runtime or schema migration.
- **Verification boundary**: Canonical ChatGPT Skill protocol closure plus one real Codex IAB end-to-end canary and root required checks.
- **Review/acceptance boundary**: `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md`, `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md`, and `tasks/notes/20260822-1240-gpt-pro-orchestrate-mode.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the canonical router, orchestrate reference, focused tests, operator documentation, and workflow artifacts together; no runtime or schema migration.

## Captured Planning Output

## Goal
Add an `orchestrate` mode to the existing canonical `repo-harness-chatgpt` Skill so GPT Pro Web can act as an advisory external chief planner and reviewer while repo-harness and local Codex retain task, lease, execution, verification, and acceptance authority. Prove the mode with one real Codex built-in-browser end-to-end canary.

## Success Criteria
- `assets/skills/repo-harness-chatgpt/references/orchestrate.md` is the single protocol owner for the new mode and is explicitly routed from the canonical `SKILL.md`.
- When the user explicitly enables orchestration, the mode routes through the existing canonical `references/setup.md` and presents a bounded configuration guide for Skill projection, Codex IAB/Pro readiness, GitHub Connector authorization, exact repository/ref selection, and Gitleaks-backed local bundle readiness; missing prerequisites stop before submission.
- The protocol pins remote GitHub reads to an exact repository/ref/SHA, distinguishes remote GitHub facts from local worktree deltas, and requires secret-scanned local context before browser submission.
- GPT Pro output is advisory only: it cannot mutate task state, claim/release/steal leases, widen `allowed_paths`, execute local commands, assert local checks, or authorize commit/push/PR/merge/deploy.
- Proposal adoption rechecks current repo/task state and fails closed on stale or unverifiable inputs without introducing a new state authority, schema, receipt type, or runtime adapter.
- One real Codex IAB canary records the exact prompt hash, visible Pro model, conversation URL, fixed remote SHA, GitHub MCP invocation evidence classification, local delta identity, same-conversation review, local checks, and final local acceptance outcome.
- Focused canonical-package tests and root required checks pass.

## Scope
- `assets/skills/repo-harness-chatgpt/SKILL.md` routing and trigger text.
- New `assets/skills/repo-harness-chatgpt/references/orchestrate.md` protocol.
- `assets/skills/repo-harness-chatgpt/references/setup.md` orchestration-lane configuration guide; no parallel setup owner.
- `tests/skill-surface/chatgpt-package.test.ts` reference-closure and protocol-boundary assertions.
- `tests/trace-observer.test.ts` host-environment isolation for absent-host test cases.
- `src/cli/chatgpt-skill/source.ts` canonical projection preflight closure for the new reference.
- `docs/repo-harness-chatgpt-browser-engine.md` operator-facing orchestration guidance and evidence expectations.
- Workflow artifacts required by the plan/contract/review lifecycle.
- A real Codex IAB canary using ignored session/handoff evidence, with durable conclusions recorded only in the owning workflow notes/review if warranted.

## Non-Scope
- No `agents/fleet/gpt-pro-orchestrator.md` or new managed native agent.
- No parallel `gpt-pro-orchestrator` Skill.
- No `OrchestrationBindingV1`, `OrchestrationProposalV1`, `ExternalAdvisorReceiptV1`, fleet catalog, scheduler, or `ChatGPTWebRuntimeAdapter` implementation.
- No changes to EffectiveState, lease semantics, Browser MCP schemas, browser engine runtime, secret scanner, or acceptance authority.
- No automatic local agent spawning from GPT Pro advice.
- No commit, push, PR, merge, deploy, package publication, or installed-runtime refresh.

## Constraints
- `repo-harness-chatgpt` remains the sole canonical ChatGPT rule owner.
- Browser sessions and GPT Pro replies are evidence only; repository artifacts and EffectiveState remain authoritative.
- The local coordinator must classify GitHub MCP use as `verified`, `bundle_only`, or `unverified` based on observable evidence; model self-report is insufficient.
- Local dirty/untracked content must never be inferred from GitHub and must pass the existing exact-bundle secret-scan boundary before submission.
- Absent requirements are forbidden design space; fail closed instead of adding compatibility or best-effort paths.

## P1 Architecture Map
The canonical router is `assets/skills/repo-harness-chatgpt/SKILL.md`; protocol modes live under its `references/` directory and `tests/skill-surface/chatgpt-package.test.ts` enforces a closed, fully routed reference set. `src/cli/chatgpt-browser/` and the Browser MCP tools provide transport/session capabilities but are out of scope for this protocol-only slice. `assets/skills/repo-harness-chatgpt/references/delegate.md` owns code-deliverable delegation; the new mode owns multi-turn advisory planning and review, not patch delivery. EffectiveState, contract allowed paths, leases, local commands, and acceptance remain outside the Skill as deterministic control-plane authority.

## P2 Concrete Trace
User authorizes GPT Pro orchestration -> local Codex resolves current repo/task state and exact remote SHA -> local delta is rendered through the existing secret-scanned prompt/bundle path -> Codex IAB submits the canonical prompt to a visible Pro conversation -> GPT Pro uses GitHub MCP when available and returns an advisory proposal -> local Codex classifies invocation evidence, checks the proposal against current scope/state, and dispatches only locally authorized work -> local implementation and real checks produce a diff/evidence bundle -> the same GPT Pro conversation reviews that exact result -> local gatekeeper and repo checks decide acceptance. The pressure point is the missing canonical mode protocol tying these already-existing steps together.

## P3 Design Decision
Extend the existing canonical Skill with one reference rather than create a fleet role or parallel Skill. This is the smallest coherent change because the missing behavior is orchestration policy, not a new execution runtime. The invariant is that external model advice never becomes task or acceptance authority. At 10x usage, browser-session drift and stale remote/local context are the first failures; exact SHA/local-delta identity and same-session continuity address that boundary without prematurely creating a scheduler or evidence schema.

## Fragile Assumption
The Codex built-in Browser exposes enough observable state to record a visible Pro model, conversation URL, completion state, attachment outcome, and GitHub MCP invocation classification without reading cookies, storage, or authentication material. The real canary must falsify this before the mode is accepted as operational.

## Rejected Alternatives
- A managed `agent-fleet` role is rejected because GPT Pro Web lacks native `spawn_agent`, `SubagentStart`, sandbox, lease, cancellation, and role-routing evidence.
- A parallel Skill is rejected because it would create a second ChatGPT protocol authority.
- New binding/receipt/runtime types are rejected until a real orchestration canary proves a concrete product gap that prose plus existing evidence surfaces cannot represent.

## Public Interface Changes
The explicit-setup-only `repo-harness-chatgpt` Skill gains a new `orchestrate` routing mode, operator protocol, and guided setup lane under the existing setup reference. No CLI, MCP, JSON schema, task contract, or runtime API changes.

## External Dependencies
No new package dependency or API key. The real canary requires an already signed-in ChatGPT Pro session and the user's existing GitHub Connector authorization; authentication remains user-owned.

## Verification
- `bun test tests/skill-surface/chatgpt-package.test.ts --timeout 60000`
- Verify the canonical router links every reference and `references/` contains no undeclared files.
- Execute one real Codex IAB orchestration canary and record exact evidence named in Success Criteria.
- Run root required checks: `bun test --timeout 60000`, deploy SQL order, architecture sync, task sync, strict task workflow, project-state inspection, and init dry-run.

## Rollback and Failure Handling
Revert the router, new reference, focused tests, docs, and workflow artifacts as one work-package. If sign-in, Pro selection, GitHub MCP evidence, attachment, completion, or same-session continuation cannot be verified, stop the canary as blocked; do not switch transport, infer success, or broaden the protocol.

## Phase Independence
This work-package ends after the canonical orchestration protocol and one real E2E canary are accepted. Typed evidence bindings and a provider-neutral fleet runtime remain separate future work that requires observed need and its own design/verification boundary.

## Task Breakdown
- [x] Add the canonical `orchestrate` reference, router entry, explicit opt-in configuration guide, focused closure/boundary tests, and operator documentation.
- [x] Run focused tests and correct only failures within the approved protocol surface.
- [x] Execute and record one real Codex IAB end-to-end orchestration canary.
- [x] Isolate absent-host trace-observer tests from ambient Codex host identity.
- [ ] Run local acceptance review and all required repository checks; close workflow evidence.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
