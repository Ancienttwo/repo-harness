# Plan: First-Principles Hook Guard

> **Status**: Completed
> **Created**: 20260613-0328
> **Slug**: think-scan-init-hook
> **Planning Source**: waza-think
> **Orchestration Kind**: waza-think
> **Source Ref**: think scan init-hook simplicity review
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Sprint Contract**: `tasks/contracts/20260613-0328-think-scan-init-hook.contract.md`
> **Sprint Review**: `tasks/reviews/20260613-0328-think-scan-init-hook.review.md`
> **Implementation Notes**: `tasks/notes/20260613-0328-think-scan-init-hook.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: think scan init-hook simplicity review
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260613-0328-think-scan-init-hook.md`
- Sprint contract: `tasks/contracts/20260613-0328-think-scan-init-hook.contract.md`
- Sprint review: `tasks/reviews/20260613-0328-think-scan-init-hook.review.md`
- Implementation notes: `tasks/notes/20260613-0328-think-scan-init-hook.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260613-0328-think-scan-init-hook.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260613-0328-think-scan-init-hook.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260613-0328-think-scan-init-hook.md`.

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
- Contract file: `tasks/contracts/20260613-0328-think-scan-init-hook.contract.md`
- Review file: `tasks/reviews/20260613-0328-think-scan-init-hook.review.md`
- Implementation notes file: `tasks/notes/20260613-0328-think-scan-init-hook.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260613-0328-think-scan-init-hook.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260613-0328-think-scan-init-hook.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260613-0328-think-scan-init-hook.contract.md`, `tasks/reviews/20260613-0328-think-scan-init-hook.review.md`, and `tasks/notes/20260613-0328-think-scan-init-hook.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260613-0328-think-scan-init-hook.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260613-0328-think-scan-init-hook.md`; after execution revert branch `codex/think-scan-init-hook` or the generated task artifacts

## Captured Planning Output

**Building**
Build a first-principles advisory guard for the existing edit hook path. The guard replaces the outdated anti-simplification framing with anti-overengineering review: after Edit/Write, inspect only the current file's git diff and warn when new complexity enters the change without an obvious first-principles justification. It stays advisory, fast, shell-only, and bundled with the existing repo-harness hook runtime.

**Not building**
- No Ponytail plugin install, marketplace dependency, or lifecycle hook trust flow.
- No SessionStart always-on persona prompt and no global simplicity mode.
- No LLM call, subagent spawn, remote service, or hidden code rewrite inside hooks.
- No blocking gate for complexity warnings; this is not a replacement for P1/P2/P3, /think, /hunt, or /check.
- No deletion of safety-critical validation, data-loss handling, security boundaries, accessibility basics, or explicit user-requested behavior in the name of simplicity.

**P1: Architecture Map**
- Runtime boundary: `PostToolUse` route `edit` resolves through `repo-harness-hook PostToolUse --route edit` or the bash shim into `.ai/hooks/run-hook.sh`, then `.ai/hooks/post-edit-guard.sh` in this self-host repo; generated and central runtime behavior comes from `assets/hooks/`.
- Existing aggregation point: `assets/hooks/post-edit-guard.sh` and `.ai/hooks/post-edit-guard.sh` already invoke `anti-simplification.sh` after the local edit reminders and before downstream advisory sync.
- Source-of-truth surfaces: `assets/hooks/` is product/runtime source for downstream installs; `.ai/hooks/` is this repo's live self-host runtime because policy pins `hook_source=repo`; docs live under `docs/reference-configs/hook-operations.md` and `docs/reference-configs/agentic-development-flow.md`.
- Tests: `tests/hook-contracts.test.ts`, `tests/hook-runtime.test.ts`, `tests/cli/route-registry.test.ts`, and hook parity/bootstrap tests cover route shape and hook contents.
- Out of scope: prompt-guard decision engine, plan capture rules, installer hook count, user-level hook trust, and external plugin management.

**P2: Concrete Trace**
Input source of truth is the edited file path from hook JSON or argv parsed by `hook-input.sh`. On Edit/Write, `post-edit-guard.sh` calls the first-principles guard with that path. The guard confirms it is inside a git worktree, reads `git diff -- <file>`, classifies only added lines, emits zero or more `[FirstPrinciples]` advisory lines to stdout, and exits 0 even when warnings are present. The final side effect is terminal guidance only; no files, plan state, hook state, or external services are mutated.

**P3: Decision Rationale**
The current `anti-simplification` name reflects an older failure mode: weaker agents over-deleted or collapsed intent. The current failure mode is the opposite: agents add compatibility layers, branch logic, helper abstractions, config surfaces, and dependencies too readily. The invariant to preserve is that hooks detect/classify/remind but do not author semantic changes or block ordinary editing. The smallest coherent change is to replace the existing guard's semantics and name while preserving the same PostEdit advisory slot.

**Approach**
Recommended path: rename the guard concept to `first-principles-guard.sh` and keep a compatibility wrapper at `anti-simplification.sh` for one release if needed by tests, stale installs, or downstream copied runtimes. `post-edit-guard.sh` should call the new name when present and fall back to the old name only for compatibility. The new guard uses cheap diff heuristics to flag likely overengineering:

- New dependency/package import or install metadata in code/config diffs.
- New one-implementation abstraction names such as `interface`, `abstract`, `factory`, `adapter`, `provider`, `strategy`, or `manager` in added lines.
- New compatibility/legacy/shim/polyfill/backward branches.
- Branch-heavy additions above the existing threshold.
- New config/env/feature-flag surface where the diff also suggests only one local consumer.
- New local state machine or dispatcher vocabulary such as `registry`, `route`, `orchestrator`, `lifecycle`, or `workflow` in ordinary feature code.

Each warning should ask the same three questions: must this exist, does platform/stdlib/current dependency already cover it, and can the diff collapse to fewer files or fewer branches. Warnings must include the file path and a reason category so reviewers can grep and tests can assert stable output.

**Key Decisions**
- Keep this in `PostToolUse.edit`, not `SessionStart`, because it reviews actual diffs instead of biasing every response.
- Keep it shell-only and diff-only, because hook hot paths need deterministic low latency and no model dependency.
- Keep it advisory and exit 0, because complexity detection is heuristic and should not block safety work or deliberate architecture.
- Update both `assets/hooks/` and `.ai/hooks/` in the same implementation, because this repo has a self-host/live copy and a generated/runtime product copy.
- Document the rename as a semantic pivot from anti-simplification to anti-overengineering, because future maintainers need to understand why simplification itself is now encouraged.

**Rejected Alternative**
Install or vendor Ponytail. Rejected because it brings external lifecycle hooks and always-on prompt injection, while the useful part for repo-harness is a small review rubric that fits the existing PostEdit advisory surface.

**File Interface Changes**
- `assets/hooks/first-principles-guard.sh`: new canonical guard script.
- `.ai/hooks/first-principles-guard.sh`: self-host runtime mirror.
- `assets/hooks/anti-simplification.sh`: compatibility wrapper or removed only if route/tests prove no installed/runtime dependency remains.
- `.ai/hooks/anti-simplification.sh`: same compatibility choice as assets.
- `assets/hooks/post-edit-guard.sh` and `.ai/hooks/post-edit-guard.sh`: call `first-principles-guard.sh`, with controlled fallback if the wrapper is retained.
- `docs/reference-configs/hook-operations.md`: describe FirstPrinciples advisory semantics under `PostToolUse.edit`.
- Tests: update or add focused checks in `tests/hook-contracts.test.ts`; add runtime behavior tests if existing harness helpers can execute `post-edit-guard.sh` against a temp git repo.

**Verification Commands**
- `bash -n assets/hooks/first-principles-guard.sh .ai/hooks/first-principles-guard.sh assets/hooks/post-edit-guard.sh .ai/hooks/post-edit-guard.sh`
- `bun test tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/cli/route-registry.test.ts`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- If implementation touches generated hook templates or installer behavior, also run `bun test tests/bootstrap-files.test.ts tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts`.

**Manual Acceptance Checks**
- A diff adding four or more branch lines emits `[FirstPrinciples]` and exits 0.
- A diff adding `legacy`, `compat`, `shim`, `polyfill`, or `backward` emits a compatibility-debt warning and exits 0.
- A diff adding a one-implementation abstraction keyword emits an abstraction warning and exits 0.
- A safety-oriented validation/error-handling diff can proceed; the warning text must say first-principles review does not override trust-boundary validation, data-loss prevention, security, or accessibility.
- A no-diff file produces no output.

**Rollback Surface**
Before execution, remove this Draft plan. After execution, revert the contract branch or restore `post-edit-guard.sh` to call `anti-simplification.sh`; no data, secrets, user-level hook config, or remote state should be changed by this slice.

**Implementation Order**
1. Rename or introduce the canonical `first-principles-guard.sh` in `assets/hooks/` and mirror to `.ai/hooks/`.
2. Replace the old warning categories with first-principles anti-overengineering categories while preserving file-path parsing through `hook-input.sh`.
3. Update `post-edit-guard.sh` on both surfaces to call the canonical guard.
4. Keep or remove `anti-simplification.sh` only after checking route/tests; if kept, make it a thin compatibility wrapper.
5. Update hook docs and tests to assert the new naming, advisory behavior, and non-blocking exit.
6. Run the focused verification commands and record any skipped full checks as explicit review evidence.

**Task Breakdown**
- [x] Replace the old anti-simplification guard semantics with a first-principles anti-overengineering advisory guard on both hook surfaces.
- [x] Wire `post-edit-guard.sh` to the canonical guard without changing route count or hook matcher shape.
- [x] Update docs and tests so the new guard name, advisory output, and compatibility boundary are explicit.
- [x] Run focused hook verification plus workflow/migration dry-run checks and record evidence in the review artifact.

**Unknowns**
None blocking. The only implementation-time choice is whether `anti-simplification.sh` remains as a temporary wrapper or is removed in the same slice; decide by grep/test evidence during the implementation drift check, not by preference.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Replace the old anti-simplification guard semantics with a first-principles anti-overengineering advisory guard on both hook surfaces.
- [x] Wire `post-edit-guard.sh` to the canonical guard without changing route count or hook matcher shape.
- [x] Update docs and tests so the new guard name, advisory output, and compatibility boundary are explicit.
- [x] Run focused hook verification plus workflow/migration dry-run checks and record evidence in the review artifact.
