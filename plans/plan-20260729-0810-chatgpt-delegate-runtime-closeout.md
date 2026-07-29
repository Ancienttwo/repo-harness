# Plan: ChatGPT delegate runtime closeout

> **Status**: Executing
> **Created**: 20260729-0810
> **Slug**: chatgpt-delegate-runtime-closeout
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Synthetic-secret fail-closed regression, explicit host-projection lifecycle tests, corrected Codex IAB Canary B, typecheck, and all root required checks.
> **Rollback Surface**: Revert the PR correction commit; no schema, provider state, or default-profile migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md`
> **Task Review**: `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md`
> **Implementation Notes**: `tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md`

## Agentic Routing
- Selected route: implementation
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md`
- Sprint contract: `tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md`
- Sprint review: `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md`
- Implementation notes: `tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md`.

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
- Contract file: `tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md`
- Review file: `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md`
- Implementation notes file: `tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the PR correction commit; no schema, provider state, or default-profile migration.
- **Verification boundary**: Synthetic-secret fail-closed regression, explicit host-projection lifecycle tests, corrected Codex IAB Canary B, typecheck, and all root required checks.
- **Review/acceptance boundary**: `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md`, `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md`, and `tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the PR correction commit; no schema, provider state, or default-profile migration.

## Captured Planning Output

## Goal

Make PR #135 genuinely mergeable by closing the two independently reproduced P1 gaps: every delegate PromptBundle must pass a content-level secret scan before any provider/browser submission, and the canonical `repo-harness-chatgpt` package must have an explicit owned projection into Codex and Claude skill discovery roots.

## P1 Architecture Map

- Egress authority: `src/cli/chatgpt-browser/prompt-assembler.ts` assembles the exact rendered prompt; `engine.ts` is the last shared boundary before Oracle/native provider launch and dry-run session persistence.
- Skill authority: `assets/skills/repo-harness-chatgpt/` is the single canonical byte source. Host discovery reads direct children of `~/.codex/skills` and `~/.claude/skills`; default install profiles must remain unchanged.
- Existing MCP bridge projection remains repo-local and independent; do not replace or broaden it.

## P2 Concrete Traces

1. Delegate brief/files -> PromptBundle assembly -> required Gitleaks stdin scan over exact rendered prompt and follow-ups -> only a clean scan may create a dry-run session or invoke a provider. Missing/incompatible scanner or any finding stops before session/provider output.
2. Explicit ChatGPT skill install command -> validate canonical package -> create an owned symlink in the requested host skill roots -> named `repo-harness-chatgpt` trigger becomes visible. Default minimal/full installs remain unchanged; uninstall removes only the exact owned symlink.

## P3 Decision

- Use Gitleaks as the single content scanner for delegate egress. Resolve only an explicit binary, a dedicated environment override, or PATH; pass payload over stdin with redacted output, ignore repo-local config/allow comments, and fail closed on every non-zero or unavailable result.
- Keep ordinary consult compatibility by making the security gate a machine-enforced delegate option used by the canonical delegate protocol, not a silent change to unrelated planning consults.
- Project the canonical package by symlink instead of copying prose, preserving one byte authority and avoiding drift. Refuse existing unowned destinations; no overwrite fallback.

## In Scope

- Browser PromptBundle secret-scan module, typed scan receipt, CLI flags, and tests.
- Explicit canonical ChatGPT skill install/uninstall commands for codex|claude|both, source validation, ownership checks, and tests.
- `repo-harness-chatgpt` setup/delegate references and browser-engine documentation.
- Correction of the PR's workflow artifacts so the fired falsifier and Canary B evidence are represented honestly.

## Out of Scope

- Oracle model/conversation metadata projection.
- Changing default install profiles or MCP bridge semantics.
- Auto-installing Gitleaks, browser fallback paths, deployment, database work, or unrelated refactors.

## Acceptance

- An allowed-path fixture containing a synthetic token is rejected before session creation/provider launch; error output contains no secret value.
- A clean exact PromptBundle produces a persisted scan receipt with scanner version and SHA-256.
- Missing or incompatible Gitleaks fails closed.
- Explicit install exposes the same canonical skill bytes to both host roots, is idempotent, and uninstall refuses unowned destinations.
- Default profile projection tests still prove ChatGPT is never implicitly installed.
- Canary B is rerun through the corrected protocol, then all repository required checks pass.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add fail-closed exact-egress Gitleaks gate and regression tests.
- [x] Add explicit owned canonical skill projection/uninstall and regression tests.
- [x] Update protocol/docs and reopen/correct workflow evidence.
- [ ] Run targeted tests, typecheck, full repository gates, corrected Canary B, and PR readback.
