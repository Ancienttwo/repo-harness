# Plan: Obsidian companion Skill dependency closure

> **Status**: Executing
> **Created**: 20260821-0021
> **Slug**: obsidian-companion-dependencies
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: /Users/kito/.codex/handoffs/2026-08-21-repo-harness-obsidian-dependency.md
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Catalog graph validation plus disposable-HOME install/update atomicity and repository-required checks
> **Rollback Surface**: Global runtime Skill projection and managed receipt transaction
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md`
> **Task Review**: `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md`
> **Implementation Notes**: `tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: /Users/kito/.codex/handoffs/2026-08-21-repo-harness-obsidian-dependency.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260821-0021-obsidian-companion-dependencies.md`
- Sprint contract: `tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md`
- Sprint review: `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md`
- Implementation notes: `tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260821-0021-obsidian-companion-dependencies.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260821-0021-obsidian-companion-dependencies.md`.

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
- Contract file: `tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md`
- Review file: `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md`
- Implementation notes file: `tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260821-0021-obsidian-companion-dependencies.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Global runtime Skill projection and managed receipt transaction
- **Verification boundary**: Catalog graph validation plus disposable-HOME install/update atomicity and repository-required checks
- **Review/acceptance boundary**: `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260821-0021-obsidian-companion-dependencies.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260821-0021-obsidian-companion-dependencies.contract.md`, `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md`, and `tasks/notes/20260821-0021-obsidian-companion-dependencies.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260821-0021-obsidian-companion-dependencies.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Global runtime Skill projection and managed receipt transaction

## Captured Planning Output

# Handoff: repo-harness Obsidian companion-skill dependency

## Verdict

Repo-harness should model and install `obsidian-markdown` and `obsidian-cli` as explicit, optional companion Skills required by `obsidian-memory`.

It should **not** add the `obsidian` executable, Obsidian desktop app, or a Node/npm Obsidian CLI package as a repo-harness package/runtime dependency. Vault usage is optional, and the official CLI only works against a running Obsidian instance. File-backed recall/persist must remain usable without the executable when the requested operation does not need the running app.

## Why this slice exists

The current surface is internally inconsistent:

- `assets/skills/obsidian-memory/SKILL.md` says `obsidian-markdown` and `obsidian-cli` are hard companion-skill dependencies and fails closed when they are absent.
- `assets/skill-commands/manifest.json` selects `obsidian-memory` for both `minimal` and `full`, but its `requires` array is empty and neither companion is a catalog package.
- `expectedProjections.externalSkillsByProfile` therefore cannot describe the companions.
- `scripts/check-agent-tooling.sh` knows the two names through a separate hard-coded `OBSIDIAN_RUNTIME_SKILLS` list and reports only an advisory gap.
- The install path can consequently report the facade present while its first real init/persist call fails for missing companion Skills.

This was reproduced on a host where both repo-harness profiles had `obsidian-memory`, but neither official companion Skill was installed.

## P1: architecture map

Authority and affected surfaces:

- Skill graph authority: `assets/skill-commands/manifest.json`
- Catalog parsing and selectors: `src/core/skill-surface/catalog.ts`
- Global install/update transaction: `src/cli/installer/install-profile.ts` and the global-runtime install effects it calls
- Runtime readiness projection: `scripts/check-agent-tooling.sh`
- Downstream projected helper: `assets/templates/helpers/check-agent-tooling.sh`
- Facade contract: `assets/skills/obsidian-memory/SKILL.md`
- Contract tests: `tests/skill-surface/obsidian-memory-contract.test.ts`
- Catalog tests: `tests/skill-surface/catalog.test.ts`
- Tooling tests: `tests/check-agent-tooling.test.ts`
- Install behavior/docs: `tests/install-profiles.test.ts`, `docs/reference-configs/install-profiles.md`

The vault, hooks, workflow checks, and `brain sync` are out of scope. They must remain optional and must not read/write external vault state automatically.

## P2: concrete trace

Current failing path:

1. `repo-harness install --profile minimal|full` selects and projects `obsidian-memory`.
2. The manifest declares no dependency edge, so install selection does not include the two official companions.
3. `check-agent-tooling` may warn because it carries a separate hard-coded list, but installation still succeeds.
4. A user explicitly invokes `obsidian-memory init` or `persist`.
5. The facade reads its dependency rule and fails closed because `obsidian-markdown` or `obsidian-cli` is absent.

Target path:

1. The catalog is the single source of truth for both companion names and their upstream provenance.
2. An explicit install/update option selects the bounded Obsidian companion bundle for the requested hosts.
3. The transaction pins and verifies upstream content before projecting the two Skills.
4. `check-agent-tooling` derives its expected names and install action from the catalog, not a duplicate constant.
5. `obsidian-memory` remains explicitly invoked; absent `brainRoot` remains a valid steady state.

## P3: decision

Recommended design:

1. Register `obsidian-markdown` and `obsidian-cli` as external packages from `kepano/obsidian-skills`, with an immutable upstream commit and per-Skill full-tree SHA-256 integrity.
2. Set `obsidian-memory.requires` to both package names.
3. Extend catalog validation so every `requires` target exists; reject self-dependencies, duplicate edges, cycles, and host-incompatible dependency edges.
4. Add deterministic dependency-closure selection instead of teaching installers another hard-coded list.
5. Add explicit `repo-harness install --with-obsidian-skills` and `repo-harness update --with-obsidian-skills`. Do not silently fetch third-party Skills during ordinary minimal/full install.
6. Project the selected companion Skills to Claude and Codex using the existing external-Skill transaction and ownership/rollback model.
7. Derive `check-agent-tooling`'s Obsidian readiness from the catalog. Without the opt-in, missing companions remain advisory; after an opt-in/managed receipt, drift or missing managed surfaces fail closed like other transaction-owned Skills.
8. Keep the actual `obsidian` executable outside repo-harness ownership. `obsidian-cli` may report that the app/CLI is unavailable when a running-vault operation is requested.

This preserves the invariant: optional vault, explicit network mutation, no vendoring, no hook-driven vault access, and one dependency authority.

## Acceptance criteria

- The real manifest parses with zero diagnostics and contains the two pinned external packages.
- `obsidian-memory.requires` equals `['obsidian-markdown', 'obsidian-cli']` in stable order.
- Catalog tests prove unknown, self, duplicate, cyclic, and host-incompatible dependency graphs are rejected.
- A selector test proves the explicit Obsidian bundle resolves exactly the two companions for both hosts.
- Disposable-HOME install and update tests prove both Skills are projected, recorded, refreshed, and rolled back atomically when the option is supplied.
- Ordinary install/update without the option performs no Obsidian network fetch and remains successful.
- `check-agent-tooling` has no independent `OBSIDIAN_RUNTIME_SKILLS` authority and reports a concrete install command.
- `obsidian-memory` still never appears in hook dispatch code.
- Missing `brainRoot` still remains a supported, non-failing steady state.
- No test or installer requires the Obsidian desktop app or `obsidian` executable.

## Verification

Run the focused checks first:

```bash
bun test tests/skill-surface/catalog.test.ts
bun test tests/skill-surface/obsidian-memory-contract.test.ts
bun test tests/check-agent-tooling.test.ts
bun test tests/install-profiles.test.ts
```

Then run the repository-required checks:

```bash
bun test --timeout 60000
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

## Stop boundaries

- Do not vendor the upstream Obsidian Skill bodies.
- Do not auto-install or launch Obsidian desktop.
- Do not make vault state a workflow, hook, CI, or release gate.
- Do not scan the filesystem to guess a vault when `brainRoot` is absent.
- Do not add a compatibility parser or a second dependency list.
- If the existing external-Skill transaction cannot express two Skills from subpaths of one pinned provider without weakening integrity, stop and resolve that installer model explicitly rather than copying files ad hoc.

## Working-state note

At handoff creation, `/Users/kito/Projects/repo-harness` was on `main`, synchronized with `origin/main`, with no active plan and a clean worktree. Re-check this before implementation; use an isolated `codex/obsidian-companion-dependencies` worktree for the change.

## Exact next step

Pin the intended `kepano/obsidian-skills` upstream commit and compute full-tree integrity for `skills/obsidian-markdown` and `skills/obsidian-cli`, then add failing catalog fixtures for the new dependency invariants before changing installer behavior.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze the approved P1/P2/P3, exact file boundary, dependency/integrity
  invariants, opt-in command surface, acceptance criteria, and stop conditions
  into the active work-package and execution contract.
- [x] Resolve the explicitly approved closeout-journal timeout that blocked the
  repository-required full-suite gate, without changing closeout behavior.
- [x] Resize the fixed verifier/outer-helper budget authority to contain the
  measured full suite, remove duplicate focused commands from the contract,
  and preserve fail-closed deadline enforcement without an invocation override.
- [x] Repair the adapter-parity test-local timeout authority proven to fail
  under full-suite-equivalent subprocess load, without changing state or lock
  production semantics.
