# Plan: Official Codex Plugin Outside Review

> **Status**: Executing
> **Created**: 20260825-1234
> **Slug**: official-codex-plugin-outside-review
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Provider, installer, receipt, template parity, required checks, and live official-plugin smoke.
> **Rollback Surface**: Revert the outside-review provider contract branch before any codex-plugin receipt is issued.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md`
> **Task Review**: `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md`
> **Implementation Notes**: `tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md`

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

- Active plan: `plans/plan-20260825-1234-official-codex-plugin-outside-review.md`
- Sprint contract: `tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md`
- Sprint review: `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md`
- Implementation notes: `tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260825-1234-official-codex-plugin-outside-review.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260825-1234-official-codex-plugin-outside-review.md`.

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
- Contract file: `tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md`
- Review file: `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md`
- Implementation notes file: `tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260825-1234-official-codex-plugin-outside-review.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the outside-review provider contract branch before any codex-plugin receipt is issued.
- **Verification boundary**: Provider, installer, receipt, template parity, required checks, and live official-plugin smoke.
- **Review/acceptance boundary**: `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260825-1234-official-codex-plugin-outside-review.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md`, `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md`, and `tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the outside-review provider contract branch before any codex-plugin receipt is issued.

## Captured Planning Output

## Goal

Replace the Codex-host `Claude` outside-review provider with the official OpenAI `codex@openai-codex` Claude Code plugin runtime, while preserving repo-harness's exact combined review subject, one-review budget, typed findings, and fail-closed evidence binding. Claude-host review remains the existing direct Codex provider.

## Geju Thesis

The clean target is not a wrapper around `claude -p /codex:review`. Codex-host review should discover the enabled official plugin through Claude Code's public plugin inventory, invoke the plugin's own app-server companion runtime directly, and record the actual reviewer as Codex. The old Claude provider, transcript recovery, Fable/Opus retry, and `claude-review` receipt source should stop existing on the active path.

**Confidence**: high. A real temporary-repository proof showed the official companion runtime returns stable machine-readable JSON and a real P1, while nested headless `/codex:review --wait` exited before the plugin job completed and the plugin's native review target cannot combine branch plus dirty-worktree scope.

**Falsifier**: the official plugin inventory does not expose a safe enabled install path, or one app-server adversarial review cannot bind itself to the pinned base SHA plus staged, unstaged, and untracked paths. The local 1.0.6 runtime disproved the first condition; contract tests must prove the second.

## P1: Architecture Map

- `assets/skills/repo-harness-cross-review/` owns host-aware mode selection and user-facing interpretation.
- `src/cli/commands/cross-review.ts`, `src/effects/review/cross-review-runner.ts`, and `src/core/review/cross-review.ts` own scope capture, provider execution, retries, classification, and CLI output.
- `src/cli/commands/init.ts`, `src/cli/commands/global-runtime.ts`, the skill-surface manifest, and tooling audit install/project/check the host capability.
- `src/cli/hook/prompt-handler.ts`, the contract template/projection helpers, and `scripts/acceptance-receipt.ts` own reviewer/source authority and AcceptanceReceipt validation.
- Focused tests are `tests/cli/cross-review.test.ts`, `tests/skill-surface/cross-review-package.test.ts`, `tests/cli/init.test.ts`, `tests/cli/global-runtime-init.test.ts`, `tests/check-agent-tooling.test.ts`, `tests/prompt-handler.test.ts`, and acceptance-receipt tests.
- Out of scope: plugin Review Gate, rescue/transfer commands, Claude-host direct Codex review, merge-gate receipts, and unrelated provider/model routing.

## P2: Concrete Trace

Today a Codex host invokes `repo-harness-cross-review`, selects `claude-mode`, calls `repo-harness cross-review --provider claude`, captures the combined branch/staged/unstaged/untracked subject, embeds its diff into `claude -p`, recovers Claude JSONL when stdout is empty, maps P1/P2, and records `reviewer=Claude, source=claude-review`.

The target trace is: Codex host skill selects `codex-plugin` mode; the CLI captures and pins the same combined subject; the provider adapter runs `claude plugin list --json`, validates that `codex@openai-codex` is enabled and its install path safely contains the official companion/schema files, then runs one official `adversarial-review --json` app-server turn against the pinned base with explicit combined-scope instructions. The adapter validates the structured payload, maps `critical/high` to P1 and `medium/low` to P2, and returns the existing CrossReviewResult shape. Acceptance is recorded as `reviewer=Codex, source=codex-plugin` and bound to the existing normalized final subject.

## P3: Design Decision

Use a dedicated provider-boundary module for official plugin discovery, path safety, argv construction, and structured-output validation; this is justified by an external executable/schema trust boundary, not reuse count. Remove Claude-mode code and reference docs instead of preserving a fallback. Keep the existing direct Codex provider for Claude host. New contracts default to reviewer Codex; historical Claude/`claude-review` receipts remain readable only as historical evidence, not as a runnable compatibility provider.

The invariant is exact review-subject binding plus truthful reviewer/source attribution. At 10x scale, plugin-version drift and global-install discovery fail first; explicit inventory/schema validation fails closed before provider invocation and tooling audit exposes readiness.

## Task Breakdown

- [x] Replace the `claude` provider mode with `codex-plugin`, remove Claude prompt/recovery/retry machinery, and add the safe official-plugin adapter with structured finding mapping.
- [x] Update the Codex-host cross-review skill route and documentation; keep Claude-host direct Codex mode unchanged.
- [x] Add official plugin install/readiness projection for Codex-host full setup without enabling Review Gate.
- [x] Extend AcceptanceReceipt authority with `source=codex-plugin`, make new contracts expect Codex, and update hook guidance without weakening historical receipt validation.
- [x] Update focused unit/integration/package tests and source/template mirrors; remove retired active-path assertions.
- [x] Run focused tests, init dry-run/apply parity, required repository checks, and one official-plugin runtime smoke test on the exact branch.

## Evidence Contract

- **State/progress path**: this plan, its task contract, notes, review, and exact AcceptanceReceipt projection.
- **Verification evidence**: cross-review/provider tests; skill-package and installer tests; acceptance/hook tests; full required checks; official plugin setup/runtime smoke.
- **Evaluator rubric**: Codex host never launches Claude as reviewer; one official app-server review covers the pinned combined subject; missing/disabled/unsafe/malformed plugin state fails explicitly; receipt attribution is Codex/`codex-plugin`; Claude host still uses direct Codex review.
- **Stop condition**: all focused and required checks pass, official runtime smoke returns a typed result, and no active product path references Claude provider execution.
- **Rollback surface**: provider enum/adapter, host skill route, setup/readiness projection, and acceptance source/template changes in one branch.

## Promotion Gate

- **Merge/PR unit**: provider runtime, host projection, acceptance authority, docs, and tests are one indivisible outside-review contract change.
- **Rollback surface**: revert the work-package branch; no persisted user data migration is required, but new `codex-plugin` receipts must not be created by a partial deployment.
- **Verification boundary**: focused provider/install/receipt tests, template parity, full repository checks, and a live official-plugin smoke.
- **Review/acceptance boundary**: exact branch subject must pass Waza check plus the newly installed official-plugin outside review before publication.
- **High-risk surface**: truthful reviewer identity, external plugin path trust, review scope completeness, and global host setup mutation.
- **Why not checklist row**: verification_boundary

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Replace the `claude` provider mode with `codex-plugin`, remove Claude prompt/recovery/retry machinery, and add the safe official-plugin adapter with structured finding mapping.
- [x] Update the Codex-host cross-review skill route and documentation; keep Claude-host direct Codex mode unchanged.
- [x] Add official plugin install/readiness projection for Codex-host full setup without enabling Review Gate.
- [x] Extend AcceptanceReceipt authority with `source=codex-plugin`, make new contracts expect Codex, and update hook guidance without weakening historical receipt validation.
- [x] Update focused unit/integration/package tests and source/template mirrors; remove retired active-path assertions.
- [x] Run focused tests, init dry-run/apply parity, required repository checks, and one official-plugin runtime smoke test on the exact branch.
