# Plan: Headroom/Caveman/CBM Tooling Boundary

> **Status**: Abandoned
> **Created**: 20260530-2005
> **Slug**: think-headroom-caveman-codegraph-cbm
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Review**: `tasks/reviews/think-headroom-caveman-codegraph-cbm.review.md`
> **Implementation Notes**: `tasks/notes/think-headroom-caveman-codegraph-cbm.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: This is a workflow/tooling boundary decision, not implementation.
- Due diligence:
  - P1 map: The relevant surface is the repo-harness external tooling contract: root `AGENTS.md`/`CLAUDE.md`, `docs/reference-configs/external-tooling.md`, `docs/reference-configs/agentic-development-flow.md`, `.ai/harness/policy.json`, `scripts/check-agent-tooling.sh`, `scripts/ensure-codegraph.sh`, and the CodeGraph readiness tests.
  - P2 trace: A non-trivial code-navigation task enters through agent instructions, routes to CodeGraph-first discovery, uses `codegraph_context`/trace tools or `scripts/ensure-codegraph.sh --check --json` for readiness, then falls back to tests and repo checks for verification. No extra map layer is needed in the runtime path.
  - P3 decision rationale: Keep the harness small. CodeGraph is already the structural index and impact graph; adding Headroom, Caveman, or CBM would create another authority without a proven gap.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260530-2005-think-headroom-caveman-codegraph-cbm.md`
- Sprint contract: `tasks/contracts/think-headroom-caveman-codegraph-cbm.contract.md`
- Sprint review: `tasks/reviews/think-headroom-caveman-codegraph-cbm.review.md`
- Implementation notes: `tasks/notes/think-headroom-caveman-codegraph-cbm.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/think-headroom-caveman-codegraph-cbm.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260530-2005-think-headroom-caveman-codegraph-cbm.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260530-2005-think-headroom-caveman-codegraph-cbm.md`.

## Approach
### Strategy
Record a negative tooling decision: do not add Headroom or Caveman to the workflow surface, and do not introduce CBM while CodeGraph is present and healthy. The repo should instead tighten documentation and checks around the existing CodeGraph-first path.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Add Headroom | Could add another context-management primitive | Creates another tool lifecycle, trust surface, and routing rule before a repo-specific gap is proven | Reject for now |
| Add Caveman | Could provide a different exploration UX | Duplicates CodeGraph/navigation responsibilities and increases bootstrap cost | Reject for now |
| Add CBM beside CodeGraph | Gives a named codebase-map artifact | Risks stale generated maps and split authority with CodeGraph AST/index data | Reject while CodeGraph is available |
| Clarify CodeGraph-first contract | Uses existing dev dependency, MCP tools, readiness checks, and docs | Less new surface area; relies on CodeGraph health | Choose |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `docs/reference-configs/external-tooling.md` | Modify | State that Headroom/Caveman are not default dependencies and CBM is not added when CodeGraph readiness is present. |
| `docs/reference-configs/agentic-development-flow.md` | Modify | Make CodeGraph-first discovery the default for structural P1/P2 work and keep broad research/deep background separate. |
| `.ai/harness/policy.json` and `assets/workflow-contract.v1.json` | Modify only if needed | Encode the boundary as policy text or generated defaults only if docs/tests need a machine-readable assertion. |
| `tests/check-agent-tooling.test.ts` or docs tests | Modify/Add | Assert the tooling report keeps CodeGraph as required readiness and does not advertise Headroom/Caveman/CBM as required install steps. |
| `tasks/notes/think-headroom-caveman-codegraph-cbm.notes.md` | Add on execution | Record any non-obvious deviation or future revisit trigger. |

### Code Snippets
No new runtime abstraction is planned. If implementation is approved, prefer tests that assert existing strings and policy shape rather than new code paths.

### Data Flow
1. Agent receives structural code-navigation or impact-analysis task.
2. Root instructions and `docs/reference-configs/agentic-development-flow.md` route P1/P2 discovery to CodeGraph.
3. Readiness is verified through `scripts/ensure-codegraph.sh --check --json` or `scripts/check-agent-tooling.sh --host both --strict-readiness`.
4. Agent uses CodeGraph structural tools for map/trace/impact.
5. Verification remains the repo checks: tests, task workflow checks, migration dry-run, and review artifacts.
6. Output is a task answer or implementation diff; no CBM artifact becomes a second source of truth.

### Error Paths
- If CodeGraph is not initialized: ask before running `codegraph init -i`, per repo instruction.
- If CodeGraph CLI is healthy but MCP stalls: use `CODEGRAPH_NO_DAEMON=1` or the local readiness scripts before introducing another tool.
- If a future workflow proves CodeGraph cannot cover a repeated structural task, record the gap in `tasks/research.md` before revisiting Headroom/Caveman/CBM.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CodeGraph is unavailable on a new machine | Medium | Agent loses structural navigation speed | Keep readiness check and explicit install/configure path documented. |
| Negative decision is forgotten and the topic returns | Medium | Repeated planning churn | Store this Draft plan and, if executed, add a short notes artifact with the revisit trigger. |
| CBM would have helped non-CodeGraph languages later | Low/Medium | Future blind spot in non-indexed stacks | Revisit only after a concrete unsupported-language or unsupported-flow failure is observed. |
| Docs drift from policy/tests | Medium | Agents receive conflicting routing instructions | Add a focused docs/policy test if this plan is approved. |

## Task Contracts
- Contract file: `tasks/contracts/think-headroom-caveman-codegraph-cbm.contract.md`
- Review file: `tasks/reviews/think-headroom-caveman-codegraph-cbm.review.md`
- Implementation notes file: `tasks/notes/think-headroom-caveman-codegraph-cbm.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/think-headroom-caveman-codegraph-cbm.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260530-2005-think-headroom-caveman-codegraph-cbm.md`, optional `tasks/notes/think-headroom-caveman-codegraph-cbm.notes.md`, and any approved docs/tests diff.
- **Verification evidence**: `bun test` plus targeted docs/tooling tests if implementation changes docs or policy.
- **Evaluator rubric**: The review passes only if the resulting workflow has one clear structural-navigation authority and no new default external dependency.
- **Stop condition**: Docs and tests consistently say CodeGraph is the structural navigation readiness tool; Headroom, Caveman, and CBM are not default repo-harness dependencies.
- **Rollback surface**: Revert the docs/tests/policy commit and remove this plan artifact if the decision is superseded.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Capture this boundary decision as a Draft plan.
- [ ] If approved, add the smallest docs/test change that makes the negative decision durable.
- [ ] Verify with `bun test` and the required workflow checks.
