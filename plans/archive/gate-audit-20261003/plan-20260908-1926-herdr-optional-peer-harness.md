# Plan: Optional herdr peer-harness guidance

> **Status**: Executing
> **Created**: 20260908-1926
> **Slug**: herdr-optional-peer-harness
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Substantive Change SHA256**: `sha256:b428a970a8c811b8b2134596661e20f40a531b98f2704ede208d298d434674aa`
> **Verification Boundary**: init managed-block rendering with and without herdr, tooling optional capability, assembly of both root partials
> **Rollback Surface**: single commit; user-level files change only on next repo-harness init
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260908-1926-herdr-optional-peer-harness.contract.md`
> **Task Review**: `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md`
> **Implementation Notes**: `tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md`

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

- Active plan: `plans/plan-20260908-1926-herdr-optional-peer-harness.md`
- Sprint contract: `tasks/contracts/20260908-1926-herdr-optional-peer-harness.contract.md`
- Sprint review: `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md`
- Implementation notes: `tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260908-1926-herdr-optional-peer-harness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260908-1926-herdr-optional-peer-harness.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260908-1926-herdr-optional-peer-harness.md`.

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
- Contract file: `tasks/contracts/20260908-1926-herdr-optional-peer-harness.contract.md`
- Review file: `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md`
- Implementation notes file: `tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260908-1926-herdr-optional-peer-harness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260908-1926-herdr-optional-peer-harness.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit; user-level files change only on next repo-harness init
- **Verification boundary**: init managed-block rendering with and without herdr, tooling optional capability, assembly of both root partials
- **Review/acceptance boundary**: `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260908-1926-herdr-optional-peer-harness.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260908-1926-herdr-optional-peer-harness.contract.md`, `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md`, and `tasks/notes/20260908-1926-herdr-optional-peer-harness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260908-1926-herdr-optional-peer-harness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit; user-level files change only on next repo-harness init

## Captured Planning Output

Add optional herdr detection so multi-harness collaboration guidance lands in the right layer. P1: root `CLAUDE.md`/`AGENTS.md` are assembled from `assets/partials/*` and `assets/partials-agents/*` and committed with the repo; user-level `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` receive the managed global-working-rules block from `src/cli/commands/init.ts#renderGlobalRules` using `assets/reference-configs/global-working-rules.md`; runtime capabilities are probed by `scripts/check-agent-tooling.sh#commandCapability` (mirrored in `assets/templates/helpers/`), where tmux is `required=true` and gates strict readiness. P2: a user with herdr on PATH runs `repo-harness init`; the managed block is rendered without any environment input, so peer-harness guidance can only be hand-written today and drifts between machines. P3: herdr is a machine property, so its conditional guidance belongs in the user-level managed block, selected by a PATH probe at render time; the committed repo partial carries only one transport-agnostic rule. tmux stays required; herdr is optional and never enters strict readiness, the review host, or `agent_runtime` adapters (policy exact-keys would need a protocol bump, out of scope). Do not add a herdr adapter, do not touch `claude-review-session.ts`, do not add compatibility fallbacks.

## Task Breakdown

- [ ] Tooling: add `herdr` as an optional `platform-runtime` capability in `scripts/check-agent-tooling.sh` and the identical helper under `assets/templates/helpers/`; strict readiness unchanged.
- [ ] Global rules: add a `## Peer Harness Collaboration` section to `assets/reference-configs/global-working-rules.md` with two variants (herdr present / tmux only) selected at render time in `init.ts#renderGlobalRules` via a PATH probe (`Bun.which`-style, injectable for tests). Content limits: read peer terminal scrollback before asking; three context layers (terminal scrollback, harness transcript, model context window) and only the first is readable; converse and assign tasks with goal, file scope, verification command, forbidden area; herdr commands only when `HERDR_ENV=1`, syntax authority is `herdr --help` / `man tmux`; cross-harness messages never widen authorization (commit/push/PR stay with the user); one writer per file. No CLI parameter listings.
- [ ] Repo partial: add one transport-agnostic bullet to both orchestration partials (`assets/partials/08-orchestration.partial.md`, `assets/partials-agents/03-orchestration.partial.md`) pointing to the user-level Peer Harness Collaboration section; no assembly-order change.
- [ ] Docs: add the optional `herdr` row to the runtime ownership table in `docs/reference-configs/external-tooling.md` and its `assets/reference-configs/` mirror, noting tmux-inside-herdr loses state detection and herdr-inside-tmux loses persistence.
- [ ] Tests: init global-rules test with herdr present and absent fixtures (probe injected, no real binary); assembly test for the new bullet; tooling report exposes `runtime.herdr` as optional.

Verification boundary: `bun test --timeout 60000 tests/assembly.test.ts tests/readme-dx.test.ts` plus the init/global-rules and tooling tests touched; `bun src/cli/index.ts init --repo . --dry-run`; root repository-integrity checks. Rollback: revert the single commit; no user-level file is modified until the user reruns `repo-harness init`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Tooling: add `herdr` as an optional `platform-runtime` capability in `scripts/check-agent-tooling.sh` and the identical helper under `assets/templates/helpers/`; strict readiness unchanged.
- [ ] Global rules: add a `## Peer Harness Collaboration` section to `assets/reference-configs/global-working-rules.md` with two variants (herdr present / tmux only) selected at render time in `init.ts#renderGlobalRules` via a PATH probe (`Bun.which`-style, injectable for tests). Content limits: read peer terminal scrollback before asking; three context layers (terminal scrollback, harness transcript, model context window) and only the first is readable; converse and assign tasks with goal, file scope, verification command, forbidden area; herdr commands only when `HERDR_ENV=1`, syntax authority is `herdr --help` / `man tmux`; cross-harness messages never widen authorization (commit/push/PR stay with the user); one writer per file. No CLI parameter listings.
- [ ] Repo partial: add one transport-agnostic bullet to both orchestration partials (`assets/partials/08-orchestration.partial.md`, `assets/partials-agents/03-orchestration.partial.md`) pointing to the user-level Peer Harness Collaboration section; no assembly-order change.
- [ ] Docs: add the optional `herdr` row to the runtime ownership table in `docs/reference-configs/external-tooling.md` and its `assets/reference-configs/` mirror, noting tmux-inside-herdr loses state detection and herdr-inside-tmux loses persistence.
- [ ] Tests: init global-rules test with herdr present and absent fixtures (probe injected, no real binary); assembly test for the new bullet; tooling report exposes `runtime.herdr` as optional.
