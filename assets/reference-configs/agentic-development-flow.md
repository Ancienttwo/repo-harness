# Agentic Development Flow

Use this reference when choosing the daily agentic development mode. Keep the
root prompt concise; this file owns the detailed routing.

## Skill Routing

| Work type | Default route | Output |
|-----------|---------------|--------|
| Product discovery, demand reality, "is this worth building" | Parent agent with `geju` pre-contract framing | Product direction or design doc before engineering planning |
| Complex engineering plan, architecture lock-in, cross-module refactor | Parent agent with `geju`, then parent-owned P1/P2/P3 | Approved execution plan with architecture, data flow, edge cases, and tests |
| UI/UX or design-system plan | Parent agent with `geju`, then parent-owned P1/P2/P3 | Design critique and plan fixes before implementation |
| Multi-direction visual/UX decision (layout, component style, hierarchy, interaction pattern, aesthetic direction) | design-options convention (`repo-harness docs show design-options`) | User-picked direction recorded as `user_evidence`, feeding the design-brief hand-off |
| New user-visible feature or intentional UX behavior change | UX feature guard (`repo-harness docs show ux-feature-guard`), then the existing design brief and BDD scenarios | Human-confirmed frozen behavior, authority/reuse map, failure/copy contract, and positive/negative/failure Given/When/Then scenarios before implementation |
| Small or medium feature/fix plan | Waza `/think` | Concise approved plan, then implementation on request |
| Bug, regression, error, crash, failing test | Waza `/hunt` | Root cause sentence with evidence before any fix |
| Implemented diff, pre-merge, release follow-through | Waza `/check` | Review findings, safe fixes, verification, and shipment state |
| Architecture diagram or system-flow diagram | Markdown Mermaid first, `mermaid` for human HTML | Semantic Mermaid in architecture docs plus optional rendered HTML grounded in repo context |

### Parent Agent Planning Ownership

- The parent agent owns discovery, architecture judgment, design judgment, plan synthesis, approval framing, and contract capture. Do not hand that lifecycle to an external planning provider.
- Invoke `geju` only before a contract exists to challenge inherited constraints and establish a thesis, direction, falsifier, and cheapest proof point.
- The parent agent must then complete P1/P2/P3 with its own repo and runtime capabilities, reconcile the evidence, and freeze the accepted result into the plan and contract. After capture, the file-backed contract is authoritative.

### Agent Fleet Routing

- Informal, non-contract code discovery may use a host-native Explore capability when the host provides one. Its built-in prompt is host-owned and not a repo authority.
- Formal contract `explorer` delegation uses the complete repo-owned `explorer` persona from `agents/fleet/explorer.md`, including its CodeGraph-first evidence contract and execution boundary.
- Do not add an `explore` alias or wrapper, and do not claim prompt inheritance, incremental merge, or behavioral equivalence between native Explore and the fleet persona. The repo never reads the native prompt; every managed persona is a complete authored source with deterministic host projections.

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
| Generate an upper-layer PRD | `repo-harness-prd` | `$geju` direction pass, Claude-first `claude -p --model opus` drafting, Codex fallback only when needed, PRD in `plans/prds/*.prd.md`; geju thesis/falsifier are pre-contract only and freeze into a delegated contract's `## Why`/`## Falsifier` |
| Plan and run a program-level sprint | `repo-harness-sprint` | Upper-layer PRD in `plans/prds/`, sprint backlog in `plans/sprints/`; each row expands through `$think` before plan -> contract -> worktree |
| Prepare a bounded native goal session | `repo-harness-goal` / `repo-harness:goal` | Codex/Claude `/goal` prompt from detailed PRD or Sprint artifacts; stops to request those documents when missing |
| Configure GPT Pro local provider | `repo-harness-gptpro-setup` / `repo-harness:gptpro_setup` | Separates `gptpro_browser` local ChatGPT Web browser/session consults from `gptpro_mcp` ChatGPT Connector MCP sidecar setup; preserves auth, tunnel, and API-billing boundaries |
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
complex engineering or architecture planning, `/hunt`, risky refactors, deployments, auth/payment/data
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
4. When Codex Plan mode, Waza `/think`, or `repo-harness-plan` produces a decision-complete work-package plan, capture it into `plans/` with `repo-harness run capture-plan --artifact-level work-package --slug <slug> --title <title>` and the plan text on stdin.
5. Approved plans must include `## Evidence Contract` with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before execution. `capture-plan.sh` supplies this contract for captured planning output.
6. Convert approved work-package plans to execution scaffolding with `repo-harness run plan-to-todo --plan <plan>`; if approval is already explicit, use `repo-harness run capture-plan --artifact-level work-package --status Approved --execute --promotion-reason <reason> ...`. The plan's own `## Task Breakdown` remains the execution checklist; `tasks/todos.md` remains a deferred-goal ledger. Contract-level plans are projected into a linked `codex/<slug>` worktree when the policy enables it.
7. Approved work-package plans must also include `> **Artifact Level**: work-package`, `> **Promotion Reason**:`, and `## Promotion Gate` with the merge/PR unit, rollback surface, independent verification boundary, review/acceptance boundary, high-risk surface, and why the work cannot remain a checklist row.
8. For Sprint execution, treat each row in `plans/sprints/*.sprint.md` as a long-task waypoint. `contract` rows may expand with `$think` into a decision-complete `plans/plan-*.md`; `inline` rows stay in the sprint backlog or active plan `## Task Breakdown` and must not create contract/review/notes artifacts.
9. Use `repo-harness run refresh-current-status` for an explicit `tasks/current.md` preview or `--write` snapshot. In non-target worktrees, `git show <target>:tasks/current.md` reads the mainline snapshot, but it never replaces source artifacts.
10. After substantive changes, run project checks and record evidence in `tasks/`. For contract worktrees, run Waza `/check`, start host-aware external acceptance in parallel, fill the review artifact from both verdicts, then use `repo-harness-ship` for default PR closeout. It calls `repo-harness run contract-worktree finish --no-merge`, pushes the `codex/<slug>` branch, and opens a draft PR. Use `repo-harness-ship --local-merge` only when an explicit maintainer workflow wants the older fast-forward merge and cleanup path.

## Passive Plan Capture

- Codex Plan mode and Waza `/think` do not need the user to remember `new-sprint` or `plan-to-todo`.
- The agent should capture decision-complete work-package planning output with `repo-harness run capture-plan --artifact-level work-package`; the script sets `.ai/harness/active-plan`, writes `.ai/harness/active-worktree`, and writes a timestamped `plans/plan-*.md` artifact with a concrete Artifact Level and Promotion Gate. Use `--artifact-level checklist-row` when the captured output should only extend the active plan's `## Task Breakdown`.
- Planning capture is allowed before implementation. Contract, review, notes, and worktree artifacts are generated only after explicit implementation approval; `tasks/todos.md` is not a duplicate of plan tasks.
- Current-status capture is separate from planning capture: `tasks/current.md` is regenerated from artifacts for orientation, not edited as a plan or task list.

## Boundaries

- Do not route large architecture decisions through Waza `/think` by default; the parent agent owns them and uses `geju` before contract capture.
- Do not invoke `geju` for routine local edits where `/think` or direct execution is enough.
- Hooks may emit advisory Waza `/check` and `/health` route hints on prompt submit. Review/release prompts read the reviewer frozen in the active contract and tell the main agent to run that semantic reviewer once after `verify-sprint --prepare-acceptance`; the orchestrator records the result as a typed AcceptanceReceipt and projects it into the review Markdown. Done/finish gates consume the receipt-backed checks projection. Hooks must not mutate files or auto-run peer CLIs based on semantic intent. `[CrossReview]` remains a lightweight debug/spec/test advisory. Plan capture is an agent action after a planning mode produces a concrete plan.
- Keep one planning lifecycle owner: the parent agent opens the frame with `geju`, completes P1/P2/P3, and locks engineering execution in the file-backed plan and contract.
- Treat subagent and parallel-agent execution as a main-agent decision based on task breadth, context impact, raw-log volume, and callable tools. Do not ask the user for spawn confirmation; if no runner is callable or spawning is not worth the context cost, complete the same P1/P2/P3 trace in the main thread and persist evidence-backed conclusions in `docs/researches/`.
- Do not turn `tasks/current.md` into a hand-written kanban or memo. Use plans, workstreams, notes, reviews, checks, and handoff files as the authoritative surfaces.
