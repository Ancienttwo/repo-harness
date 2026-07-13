# Plan: Remove gstack From Core Workflow

> **Status**: Executing
> **Created**: 20260713-1305
> **Slug**: remove-gstack-core
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: parent-agent
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Fresh init and canonical stale-policy adoption must remove retired provider routes; full repo checks must pass
> **Rollback Surface**: Single work-package revert restores prior routing and tooling report
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260713-1305-remove-gstack-core.contract.md`
> **Task Review**: `tasks/reviews/20260713-1305-remove-gstack-core.review.md`
> **Implementation Notes**: `tasks/notes/20260713-1305-remove-gstack-core.notes.md`

## Agentic Routing
- Selected route: parent-agent:geju
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260713-1305-remove-gstack-core.md`
- Sprint contract: `tasks/contracts/20260713-1305-remove-gstack-core.contract.md`
- Sprint review: `tasks/reviews/20260713-1305-remove-gstack-core.review.md`
- Implementation notes: `tasks/notes/20260713-1305-remove-gstack-core.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260713-1305-remove-gstack-core.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260713-1305-remove-gstack-core.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260713-1305-remove-gstack-core.md`.

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
- Contract file: `tasks/contracts/20260713-1305-remove-gstack-core.contract.md`
- Review file: `tasks/reviews/20260713-1305-remove-gstack-core.review.md`
- Implementation notes file: `tasks/notes/20260713-1305-remove-gstack-core.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260713-1305-remove-gstack-core.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260713-1305-remove-gstack-core.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single work-package revert restores prior routing and tooling report
- **Verification boundary**: Fresh init and canonical stale-policy adoption must remove retired provider routes; full repo checks must pass
- **Review/acceptance boundary**: `tasks/reviews/20260713-1305-remove-gstack-core.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260713-1305-remove-gstack-core.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260713-1305-remove-gstack-core.contract.md`, `tasks/reviews/20260713-1305-remove-gstack-core.review.md`, and `tasks/notes/20260713-1305-remove-gstack-core.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260713-1305-remove-gstack-core.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single work-package revert restores prior routing and tooling report

## Captured Planning Output

# Remove gstack From the Core Workflow

## Thesis

gstack should stop existing as a repo-harness planning concept. The parent agent must own product, architecture, engineering-plan, and design-plan reasoning; `geju` is a pre-contract framing skill used by that owner, not a second lifecycle owner or an external provider dependency.

## Confidence

- Confidence: high.
- Cheapest proof point: a generated repository, an adopted repository carrying the retired routes, and the self-host repository all resolve planning to the parent-agent path without any gstack route, detector, install command, or generated instruction.
- Falsifier: a current executable repo-harness feature or public contract that can only satisfy its acceptance criteria through gstack and cannot be expressed through parent-agent + `geju` + P1/P2/P3. No such feature was found in P1/P2 tracing.

## P1: Architecture Map

- Source-of-truth contract and policy surfaces: `assets/workflow-contract.v1.json`, `assets/templates/helpers/workflow-contract.ts`, `scripts/lib/project-init-lib.sh`, `scripts/ensure-task-workflow.sh`, and their packaged helper mirrors.
- Agent instruction projections: `assets/partials/`, `assets/partials-agents/`, root `AGENTS.md` / `CLAUDE.md`, and assembly tests.
- Parent planning operation: `SKILL.md`, `assets/skill-commands/repo-harness-plan/SKILL.md`, and `assets/skill-commands/repo-harness-prd/SKILL.md`; `hai-stack` / `geju` already exists as the pre-contract direction method.
- External-tool readiness surface: `scripts/check-agent-tooling.sh` plus `assets/templates/helpers/check-agent-tooling.sh` and `tests/check-agent-tooling.test.ts`.
- Human-facing active documentation: `docs/reference-configs/`, `references/migration-guide.md`, active architecture docs, README translations, and their parity tests.
- Historical evidence under archived plans/tasks and dated research is non-executable provenance. It is not a dependency and must not be rewritten as current truth.

## P2: Concrete Trace

1. Init/ensure currently writes gstack into `.ai/harness/policy.json` and the installed workflow contract.
2. Generated `AGENTS.md` / `CLAUDE.md` and workflow docs then instruct the root agent to call `office-hours`, `plan-eng-review`, or `plan-design-review`.
3. `check-agent-tooling.sh` detects local gstack directories and emits install/upgrade commands, making an advisory provider look like a supported workflow lane.
4. An actual architecture-planning request therefore routes away from the parent agent. On the installed skill, missing interactive capability blocks the whole workflow even though the parent agent can perform the reasoning itself.
5. The pressure point is the provider name embedded in canonical planning semantics. Removing only prose or only the detector would leave drift.

## P3: Design Decision

- Parent agent is the single lifecycle owner for product discovery and complex/design planning.
- `geju` opens the frame before a work-package is captured; the parent completes P1/P2/P3 and freezes the thesis, proof point, and falsifier into the plan/contract.
- Canonical route values become provider-neutral parent-agent operations. Waza remains for its existing small/medium plan, hunt, and check lanes; gbrain and CodeGraph are unchanged.
- Delete gstack detection, installation/update advice, active docs, generated instructions, policy routes, workflow-contract routes, and tests. Do not add aliases, deprecation branches, fallback providers, compatibility keys, or dual authority.
- Adoption of managed policy routes is a direct cutover: retired provider routes do not survive as explicit defaults or compatibility values.
- At 10x repositories/hosts, the first failure otherwise is provider-specific workflow drift: one external interaction model blocks every host. Parent ownership plus a frozen contract keeps host adapters subordinate to one semantic lifecycle.

## In Scope

- Replace active gstack planning routes with parent-agent ownership and `geju` pre-contract framing.
- Update `repo-harness-plan` so architecture, product-direction, and cross-module planning activates `geju`, then freezes the result into the file-backed plan/contract.
- Remove gstack from the canonical workflow contract, generated policy, self-host policy, generated root instructions, active architecture/reference docs, READMEs, migration guidance, initializer copy, and relevant tests.
- Remove the gstack detector, report section, install commands, update probes, and host metadata from both helper copies and their tests.
- Make fresh init, ensure, and adoption projections emit no gstack semantics; directly replace retired managed planning routes in an adopted fixture.
- Keep source/mirror pairs synchronized and add a regression check that active product surfaces contain no gstack dependency.

## Out of Scope

- Do not uninstall or edit user-local `~/.claude/skills/gstack` or `~/.codex/skills/gstack`; those paths are outside repository authority.
- Do not remove Waza, gbrain, CodeGraph, hai-stack, or `geju`.
- Do not implement host execution-identity telemetry or agent-fleet model/profile routing.
- Do not modify the active harness-kernel-optimization worktree or its artifacts.
- Do not rewrite archived plans/tasks or dated research evidence merely to erase historical names.

## Verification

- Focused generator, workflow-contract, assembly, README, adoption, and tooling tests pass.
- A stale-policy adoption fixture proves the retired managed routes are replaced, not preserved.
- `scripts/check-agent-tooling.sh --json` has no gstack tool entry or gstack install/update command.
- Active source, generated, config, and current documentation surfaces contain no `gstack`, `plan-eng-review`, or `plan-design-review` dependency; historical evidence paths are explicitly excluded.
- Repository required checks pass, including `bun test`, architecture/task sync, strict workflow, project inspection, and adoption dry-run.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Cut canonical routing and managed adoption policy to parent-agent + `geju`.
- [x] Remove gstack tooling detection and update focused tests.
- [x] Update generated agent instructions, planning skill, active docs, READMEs, and parity tests.
- [x] Run focused and full verification, complete independent review, and close workflow artifacts.
