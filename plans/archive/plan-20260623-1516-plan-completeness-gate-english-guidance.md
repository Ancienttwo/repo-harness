# Plan: PlanCompletenessGate English Runtime Guidance

> **Status**: Archived
> **Created**: 20260623-1516
> **Slug**: plan-completeness-gate-english-guidance
> **Planning Source**: waza-think
> **Orchestration Kind**: waza-think
> **Source Ref**: hook-runtime-english-guidance
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Review**: `tasks/reviews/20260623-1516-plan-completeness-gate-english-guidance.review.md`
> **Implementation Notes**: `tasks/notes/20260623-1516-plan-completeness-gate-english-guidance.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: hook-runtime-english-guidance
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260623-1516-plan-completeness-gate-english-guidance.md`
- Sprint contract: `tasks/contracts/20260623-1516-plan-completeness-gate-english-guidance.contract.md`
- Sprint review: `tasks/reviews/20260623-1516-plan-completeness-gate-english-guidance.review.md`
- Implementation notes: `tasks/notes/20260623-1516-plan-completeness-gate-english-guidance.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260623-1516-plan-completeness-gate-english-guidance.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260623-1516-plan-completeness-gate-english-guidance.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260623-1516-plan-completeness-gate-english-guidance.md`.

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
- Contract file: `tasks/contracts/20260623-1516-plan-completeness-gate-english-guidance.contract.md`
- Review file: `tasks/reviews/20260623-1516-plan-completeness-gate-english-guidance.review.md`
- Implementation notes file: `tasks/notes/20260623-1516-plan-completeness-gate-english-guidance.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260623-1516-plan-completeness-gate-english-guidance.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260623-1516-plan-completeness-gate-english-guidance.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260623-1516-plan-completeness-gate-english-guidance.contract.md`, `tasks/reviews/20260623-1516-plan-completeness-gate-english-guidance.review.md`, and `tasks/notes/20260623-1516-plan-completeness-gate-english-guidance.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260623-1516-plan-completeness-gate-english-guidance.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260623-1516-plan-completeness-gate-english-guidance.md`; after execution revert branch `codex/plan-completeness-gate-english-guidance` or the generated task artifacts

## Captured Planning Output

## Goal
Fix PlanCompletenessGate runtime guidance so displayed capture commands stay English/ASCII-safe when pending planning prompts or source refs contain Chinese or other non-ASCII text.

## Success Criteria
- PlanCompletenessGate no longer embeds raw pending source_ref as shell-quoted --title or --source-ref in the runtime instruction text.
- The guidance remains actionable for Draft capture and Approved capture paths.
- The one-shot Stop gate, pending orchestration safety invariant, and capture-plan ownership remain unchanged.
- Tests cover a non-ASCII source_ref and assert no mojibake, ANSI-C byte escapes, or raw Chinese command arguments appear in emitted runtime instructions.

## Scope
- In scope: .ai/hooks/stop-orchestrator.sh, assets/hooks/stop-orchestrator.sh, tests/hook-runtime.test.ts.
- Out of scope: prompt intent classification, capture-plan.sh behavior, provider latency research, global installed hook state, and existing untracked draft/research artifacts.

## P1 Architecture Map
PlanCompletenessGate is owned by the Stop hook. UserPromptSubmit/prompt-guard creates pending orchestration metadata; stop-orchestrator reads that metadata, detects a plan-like last assistant answer, records a one-shot signature, and emits a block reason with capture guidance. capture-plan.sh remains the only writer of authoritative plans/ artifacts.

## P2 Concrete Trace
A Waza think prompt with Chinese text is saved as pending source_ref. On Stop, stop-orchestrator derives title from source_ref, passes title/source_ref through Bash printf percent-q quoting, and injects those values into displayed capture-plan commands. Under non-UTF-8 or unavailable UTF-8 locale, multibyte text becomes byte escapes or replacement characters in the instruction surfaced to the model.

## P3 Decision Rationale
The existing design likely used concrete shell quoting to make the command copy-safe. That breaks the stronger invariant for runtime instructions: they must be readable and stable across host locale and model rendering. The smallest coherent fix is to keep concrete ASCII-safe slug/source/kind values, but replace human text fields with English placeholders in the displayed guidance. This preserves capture ownership and avoids adding a new abstraction or dependency.

## Fragile Assumption
This assumes the runtime instruction is for the agent to fill in, not a shell snippet that must be copy-pasted without editing. If exact copy-paste is required, the safer future slice is an ASCII-only metadata alias written into pending.json.

## Rejected Alternative
Forcing LC_ALL=en_US.UTF-8 around printf percent-q was rejected because that locale may be unavailable and still produced mojibake in local reproduction. Removing PlanCompletenessGate was rejected because it protects plans/ as the source of truth.

## Public API, Config, and File Interface Changes
No public API, config, schema, or capture-plan.sh interface changes. Only runtime guidance text changes.

## External Dependencies and Secrets
No new dependency, API key, provider account, or network access required.

## Verification Plan
- Run bun test tests/hook-runtime.test.ts --test-name-pattern PlanCompletenessGate.
- Run bun test tests/cli/hook.test.ts --test-name-pattern PlanCompletenessGate.
- Run git diff to confirm only intended hook/test/plan files changed and existing unrelated dirty files were not reverted.

## Rollback and Failure Handling
Rollback is reverting .ai/hooks/stop-orchestrator.sh, assets/hooks/stop-orchestrator.sh, tests/hook-runtime.test.ts, and the captured plan file. No data migration or external state exists.

## Task Breakdown
- [ ] Update Stop hook capture guidance to avoid non-ASCII shell-quoted command values.
- [ ] Mirror the same runtime change in assets/hooks.
- [ ] Add regression coverage for non-ASCII source_ref output.
- [ ] Run focused hook tests.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Update Stop hook capture guidance to avoid non-ASCII shell-quoted command values.
- [ ] Mirror the same runtime change in assets/hooks.
- [ ] Add regression coverage for non-ASCII source_ref output.
- [ ] Run focused hook tests.
