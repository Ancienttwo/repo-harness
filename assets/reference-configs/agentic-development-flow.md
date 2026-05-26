# Agentic Development Flow

Use this reference when choosing the daily agentic development mode. Keep the
root prompt concise; this file owns the detailed routing.

## Skill Routing

| Work type | Default route | Output |
|-----------|---------------|--------|
| Product discovery, demand reality, "is this worth building" | gstack `office-hours` | Product direction or design doc before engineering planning |
| Complex engineering plan, architecture lock-in, cross-module refactor | gstack `plan-eng-review` | Approved execution plan with architecture, data flow, edge cases, and tests |
| UI/UX or design-system plan | gstack `plan-design-review` | Design critique and plan fixes before implementation |
| Small or medium feature/fix plan | Waza `/think` | Concise approved plan, then implementation on request |
| Bug, regression, error, crash, failing test | Waza `/hunt` | Root cause sentence with evidence before any fix |
| Implemented diff, pre-merge, release follow-through | Waza `/check` | Review findings, safe fixes, verification, and shipment state |
| Architecture diagram or system-flow diagram | `diagram-design` | Mermaid or structured diagram artifact grounded in repo context |

## agentic-dev Command Surface

Use these action-style command skills when the work is about installing,
migrating, repairing, or verifying this repo-local harness:

| Work type | Command | Boundary |
|-----------|---------|----------|
| Decision-complete harness plan | `agentic-dev-plan` | Plans only; no repo mutation by default |
| Review an existing harness plan | `agentic-dev-review` | Product, engineering, design, and DevEx review dimensions |
| Automatic planning pipeline | `agentic-dev-autoplan` | Plan -> review -> decision summary with final gates only |
| Add harness to an existing repo | `agentic-dev-init` | Uses inspector and migration engine; does not create an app stack |
| Create a new app or module scaffold | `agentic-dev-scaffold` | Uses plan catalog A-K, then attaches the harness |
| Convert legacy workflow surfaces | `agentic-dev-migrate` | Archives or preserves user-authored legacy docs |
| Refresh an installed harness | `agentic-dev-upgrade` | Runs manifest-owned upgrade actions only |
| Add selected capability boundaries | `agentic-dev-capability` | Updates capability registry and local contracts without full init/migrate/upgrade |
| Resolve architecture docs or diagrams | `agentic-dev-architecture` | Handles architecture drift requests without full harness refresh |
| Prepare or resume handoff | `agentic-dev-handoff` | Refreshes Codex handoff packets without running full checks |
| Check deploy and ops config | `agentic-dev-deploy` | Read-only deploy/_ops readiness check without publishing |
| Fix broken current harness behavior | `agentic-dev-repair` | Task sync, hook routing, handoff, context, policy, or helper drift |
| Verify readiness | `agentic-dev-check` | Workflow gates, task sync, inspector, and migration dry-run |

`hooks-init`, `docs-init`, and `create-project-dirs` are not public commands.
They are implementation steps behind `init`, `scaffold`, `migrate`, and
`upgrade`.

## Due Diligence Levels

P1/P2/P3 is the shared due-diligence protocol underneath the routing.

- `P1_GLOBAL_ARCHITECTURE`: identify real boundaries, entrypoints, owners, authoritative files, dependencies, and out-of-scope areas.
- `P2_DATA_FLOW_TRACE`: walk one concrete route through requests, UI events, jobs, config, messages, or database values to the final output.
- `P3_DESIGN_DECISION`: explain why the current shape exists, which invariant must stay true, and why the chosen change is the smallest coherent one.

For small tasks, keep P1/P2/P3 internal and report only the result. For
`plan-eng-review`, `/hunt`, risky refactors, deployments, auth/payment/data
work, or shared contracts, report the P1/P2/P3 evidence explicitly.

## Daily Flow

1. Route the request by intent before reading broadly.
2. Read the repo-local contract first: `AGENTS.md` or `CLAUDE.md`, `tasks/todo.md`, `tasks/lessons.md`, and `.ai/harness/policy.json`.
3. Use the selected skill or mode to produce either an approved plan, a root cause, or a review verdict.
4. Convert approved complex plans to execution with `scripts/plan-to-todo.sh --plan <plan>`. Contract-level plans are projected into a linked `codex/<slug>` worktree when the policy enables it.
5. After substantive changes, run project checks and record evidence in `tasks/`. For contract worktrees, run Waza `/check` before `scripts/contract-worktree.sh finish`.

## Boundaries

- Do not route large architecture decisions through Waza `/think` by default.
- Do not use gstack plan review for routine local edits where `/think` or direct execution is enough.
- Hooks may emit advisory Waza `/check` and `/health` route hints on prompt submit, but must not block, mutate files, or auto-run skills based on semantic intent.
- Keep `office-hours` for product-demand shaping; use `plan-eng-review` when engineering execution needs to be locked.
- Treat subagent and parallel-agent execution as a main-agent decision based on task breadth, context impact, raw-log volume, and callable tools. Do not ask the user for spawn confirmation; if no runner is callable or spawning is not worth the context cost, complete the same P1/P2/P3 trace in the main thread and persist evidence-backed conclusions in `tasks/research.md`.
