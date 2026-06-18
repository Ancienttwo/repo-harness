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
| Architecture diagram or system-flow diagram | Markdown Mermaid first, `mermaid` for human HTML | Semantic Mermaid in architecture docs plus optional rendered HTML grounded in repo context |

## repo-harness Command Surface

Use these CLI-backed command facades when the work is about installing,
migrating, repairing, or verifying this repo-local harness:

| Work type | Command | Boundary |
|-----------|---------|----------|
| Decision-complete harness plan | `repo-harness-plan` | Plans only; no repo mutation by default |
| Review an existing harness plan | `repo-harness-review` | Product, engineering, design, and DevEx review dimensions |
| Automatic workflow pipeline | `repo-harness-autoplan` | Plan -> two self-review passes -> implementation -> `/check` -> `repo-harness-ship` |
| Ship finished work | `repo-harness-ship` | Validates finished worktrees, pushes branches, and creates PRs by default |
| Add harness to an existing repo | `repo-harness-init` | Uses inspector and migration engine; does not create an app stack |
| Create a new app or module scaffold | `repo-harness-scaffold` | Uses plan catalog A-K, then attaches the harness |
| Convert legacy workflow surfaces | `repo-harness-migrate` | Archives or preserves user-authored legacy docs |
| Refresh an installed harness | `repo-harness-upgrade` | Runs manifest-owned upgrade actions only |
| Add selected capability boundaries | `repo-harness-capability` | Updates capability registry and local contracts without full init/migrate/upgrade |
| Resolve architecture docs or diagrams | `repo-harness-architecture` | Handles architecture drift requests without full harness refresh |
| Prepare or resume handoff | `repo-harness-handoff` | Refreshes Codex handoff packets without running full checks |
| Check deploy and ops config | `repo-harness-deploy` | Read-only deploy/_ops readiness check without publishing |
| Fix broken current harness behavior | `repo-harness-repair` | Task sync, hook routing, handoff, context, policy, or helper drift |
| Verify readiness | `repo-harness-check` | Workflow gates, task sync, inspector, migration dry-run, and readiness yellow flags |
| Generate an upper-layer PRD | `repo-harness-prd` | `$geju` direction pass, Claude-first `claude -p --model opus` drafting, Codex fallback only when needed, PRD in `plans/prds/*.prd.md` |
| Plan and run a program-level sprint | `repo-harness-sprint` | Upper-layer PRD in `plans/prds/`, sprint backlog in `plans/sprints/`; each row expands through `$think` before plan -> contract -> worktree |
| Prepare a bounded native goal session | `repo-harness-goal` / `repo-harness:goal` | Codex/Claude `/goal` prompt from detailed PRD or Sprint artifacts; stops to request those documents when missing |
| Configure GPT Pro local bridge | `repo-harness-gptpro-setup` / `repo-harness:gptpro_setup` | Separates `gptpro_browser` local ChatGPT Web browser/session consults from `gptpro_mcp` ChatGPT Connector MCP sidecar setup; preserves auth, tunnel, and API-billing boundaries |
| Consult GPT Pro through browser session | `repo-harness-gptpro` / `repo-harness:gptpro` | Uses `gptpro consult/read/continue/open` wording while mapping to `browser-consult`, `browser-session`, `browser-followup`, and `browser-open` engine commands |

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

| Agent reads first | Human reviews first |
|-----------|---------|
| Current user prompt and referenced files | Human Review Card in `tasks/reviews/<task>.review.md` |
| `AGENTS.md` / `CLAUDE.md` and active plan | Changed files and active contract scope |
| Active contract, notes, latest checks, and handoff | Latest trace/checks, residual risk, rollback |
| `tasks/current.md` only for orientation | External acceptance or manual override |

1. Route the request by intent before reading broadly.
2. Read the repo-local contract first: `AGENTS.md` or `CLAUDE.md`, `tasks/todos.md`, `tasks/lessons.md`, and `.ai/harness/policy.json`.
3. Use the selected skill or mode to produce either an approved plan, a root cause, or a review verdict.
4. When Codex Plan mode, Waza `/think`, or `repo-harness-plan` produces a decision-complete plan, capture it into `plans/` with `.ai/harness/scripts/capture-plan.sh --slug <slug> --title <title>` and the plan text on stdin.
5. Approved plans must include `## Evidence Contract` with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before execution. `capture-plan.sh` supplies this contract for captured planning output.
6. Convert approved plans to execution scaffolding with `.ai/harness/scripts/plan-to-todo.sh --plan <plan>`; if approval is already explicit, use `.ai/harness/scripts/capture-plan.sh --status Approved --execute ...`. The plan's own `## Task Breakdown` remains the execution checklist; `tasks/todos.md` remains a deferred-goal ledger. Contract-level plans are projected into a linked `codex/<slug>` worktree when the policy enables it.
7. For Sprint execution, treat each row in `plans/sprints/*.sprint.md` as a long-task waypoint. Use `$think` to expand the row into a decision-complete `plans/plan-*.md` before coding; do not treat the sprint row itself as an implementation plan.
8. Use `.ai/harness/scripts/refresh-current-status.sh` for an explicit `tasks/current.md` preview or `--write` snapshot. In non-target worktrees, `git show <target>:tasks/current.md` reads the mainline snapshot, but it never replaces source artifacts.
9. After substantive changes, run project checks and record evidence in `tasks/`. For contract worktrees, run Waza `/check`, start host-aware external acceptance in parallel, fill the review artifact from both verdicts, then use `repo-harness-ship` for default PR closeout. It calls `.ai/harness/scripts/contract-worktree.sh finish --no-merge`, pushes the `codex/<slug>` branch, and opens a draft PR. Use `repo-harness-ship --local-merge` only when an explicit maintainer workflow wants the older fast-forward merge and cleanup path.

## Passive Plan Capture

- Codex Plan mode and Waza `/think` do not need the user to remember `new-sprint` or `plan-to-todo`.
- The agent should capture decision-complete planning output with `.ai/harness/scripts/capture-plan.sh`; the script sets `.ai/harness/active-plan`, writes `.ai/harness/active-worktree`, mirrors `.claude/.active-plan`, and writes a timestamped `plans/plan-*.md` artifact.
- Planning capture is allowed before implementation. Contract, review, notes, and worktree artifacts are generated only after explicit implementation approval; `tasks/todos.md` is not a duplicate of plan tasks.
- Current-status capture is separate from planning capture: `tasks/current.md` is regenerated from artifacts for orientation, not edited as a plan or task list.

## Boundaries

- Do not route large architecture decisions through Waza `/think` by default.
- Do not use gstack plan review for routine local edits where `/think` or direct execution is enough.
- Hooks may emit advisory Waza `/check` and `/health` route hints on prompt submit. Review/release prompts emit a host-aware `[ExternalAcceptance]` prompt telling the main agent to run the peer reviewer in parallel and paste `## External Acceptance Advice` into the review file; done/finish gates block only on that recorded evidence. Hooks must not mutate files or auto-run peer CLIs based on semantic intent. `[CrossReview]` remains a lightweight debug/spec/test advisory. Plan capture is an agent action after a planning mode produces a concrete plan.
- Keep `office-hours` for product-demand shaping; use `plan-eng-review` when engineering execution needs to be locked.
- Treat subagent and parallel-agent execution as a main-agent decision based on task breadth, context impact, raw-log volume, and callable tools. Do not ask the user for spawn confirmation; if no runner is callable or spawning is not worth the context cost, complete the same P1/P2/P3 trace in the main thread and persist evidence-backed conclusions in `docs/researches/`.
- Do not turn `tasks/current.md` into a hand-written kanban or memo. Use plans, workstreams, notes, reviews, checks, and handoff files as the authoritative surfaces.
