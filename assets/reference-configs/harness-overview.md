# Harness Overview

This repo uses a shared long-running harness. The durable workflow lives in repo-local artifacts, not in chat memory.

## Adoption Model

Use this file as the first onboarding map after `repo-harness adopt` installs
or refreshes a repo. The harness gives agents three durable surfaces:

- **Shared standards**: `docs/spec.md`, `docs/reference-configs/`, root
  `AGENTS.md`, and root `CLAUDE.md` explain stable product intent, coding
  rules, and local workflow boundaries.
- **Task contracts**: `plans/`, `tasks/contracts/`, `tasks/reviews/`, and
  `.ai/harness/checks/` turn a request into scoped implementation work with
  evidence-backed completion.
- **Session journal**: `.ai/harness/handoff/`, `tasks/current.md`, and
  `.ai/harness/events.jsonl` let a new agent session resume from repo state
  without treating chat history as authority.

The install is not an app scaffold or an agent gateway. It adds a reviewable
workflow contract around an existing repo, then leaves product code ownership
with the project.

## Roles

- **Planner** updates `docs/spec.md`, researches constraints, and writes or approves `plans/plan-*.md`.
- **Generator** implements only against the active sprint contract and the plan's `## Task Breakdown`, leaving `tasks/todos.md` as a deferred-goal ledger, and records task-local implementation judgments in `tasks/notes/<plan-stem>.notes.md`.
- **Evaluator** runs Waza `/check`, then writes `tasks/reviews/<plan-stem>.review.md` using fresh evidence from `.ai/harness/checks/latest.json` and `.ai/harness/runs/*.json`.

## State Flow

1. `docs/spec.md` captures stable product intent.
2. `plans/plan-*.md` captures a concrete execution approach.
3. `tasks/contracts/<plan-stem>.contract.md` defines done for the active sprint.
4. `tasks/current.md` is a tracked mainline status snapshot derived from workflow artifacts; it is not a live lock, kanban board, or implementation gate.
5. `tasks/todos.md` is the deferred-goal ledger; the plan's `## Task Breakdown` and active contract carry sprint execution.
6. `tasks/notes/<plan-stem>.notes.md` records design decisions, deviations, tradeoffs, open questions, and promotion candidates for this sprint only.
7. `tasks/reviews/<plan-stem>.review.md` records evaluator judgment.
8. `.ai/harness/policy.json` is the machine-readable workflow contract.
9. `information_lifecycle` inside `.ai/harness/policy.json` separates notes, raw evidence, reusable assets, advisory memory, and external knowledge.
10. `agentic_development` inside `.ai/harness/policy.json` captures product, engineering, design, bug-hunt, and review routing.
11. `external_tooling` inside `.ai/harness/policy.json` captures host install/update defaults for gstack, Waza, gbrain, and required CodeGraph readiness.
12. `.ai/context/capabilities.json` declares capability prefixes, contract files, architecture modules, and workstream directories.
13. `.ai/context/context-map.json` indexes stable root context and discoverable capability context derived from the registry.
14. `documentation` inside `.ai/harness/policy.json` keeps generated docs minimal and moves optional docs to agent-created, evidence-backed output.
15. `lsp_profiles` inside policy and context-map files select tooling hints per capability.
16. `worktree_strategy` inside policy tells agents when to isolate contract-level work in `codex/<slug>` worktrees, start execution through `.ai/harness/scripts/contract-worktree.sh start --plan <plan>`, and finish with Waza `/check` plus `.ai/harness/scripts/contract-worktree.sh finish`.
17. `.ai/harness/handoff/current.md` preserves resumable state across sessions.
18. `.ai/harness/events.jsonl` and `.ai/harness/runs/*.json` retain lightweight execution traces.

## Session Boundaries

- Exploration and planning are allowed before a contract exists.
- Before implementation, the plan and contract should both expose a concrete workflow inventory so the agent does not rediscover or guess active artifacts.
- Implementation should prefer `docs/spec.md`, an approved plan, and an active sprint contract.
- Claiming completion should include contract verification evidence, a run snapshot, implementation notes, and a passing Waza `/check` review artifact.
- Stopping a session should refresh `.ai/harness/handoff/current.md` for easier resume; while pending planning orchestration is open, Stop may block once to force a plan completeness self-review before execution.
- Refresh `tasks/current.md` with `.ai/harness/scripts/refresh-current-status.sh --write --reason <reason>` only at explicit lifecycle boundaries or as a deliberate maintainer action; ordinary hooks should not dirty tracked files.
- In non-target worktrees, read the target branch snapshot with `git show <target>:tasks/current.md` and verify stale or surprising state against the source artifacts before acting.
- Use `docs/reference-configs/agentic-development-flow.md` for skill routing and `docs/reference-configs/external-tooling.md` for install/update commands.
- Use `docs/reference-configs/global-working-rules.md` as the user-level Claude/Codex rule template; keep repo-local workflow contracts in repo files.
- Externalized reference docs are indexed by `.ai/harness/brain-manifest.json` and checked by `.ai/harness/scripts/check-brain-manifest.sh`. Valuable repo docs can opt into default-brain mirroring with `sync.direction=repo-to-brain`; `post-edit-guard.sh` then calls `.ai/harness/scripts/sync-brain-docs.sh --changed <path>` for that specific file.
- Contract-level execution should run in an isolated `codex/<task-slug>` worktree. Merge back only after the contract is fulfilled, `tasks/reviews/<plan-stem>.review.md` recommends pass, and the target worktree is clean.
- Architecture-sensitive work also runs `scripts/check-architecture-sync.sh`: the check keeps the request index derived from `docs/architecture/requests/` and, when policy is strict, blocks finish if the current diff touches a capability with a pending architecture request at or above `architecture.gate_min_severity`.
- Migration cleans legacy root `scripts/<repo-harness-helper>` files only when content is identifiable as generated repo-harness runtime; ambiguous app-owned root scripts are reported and preserved.

## Documentation Profile

- Default profile: `minimal-agentic`.
- Required docs: `docs/spec.md` and `docs/architecture/index.md`.
- Optional docs such as `docs/brief.md`, `docs/tech-stack.md`, `docs/decisions.md`, `docs/architecture.md`, and `docs/packages.md` are created only when the agent has concrete repo evidence or the user asks.
- Root `specs/` is a legacy scaffold surface; use `docs/spec.md`, `interfaces/`, and tests instead.
- Use `docs/reference-configs/document-generation.md` for the creation rules.

## Information Lifecycle

- Notes: `tasks/notes/<plan-stem>.notes.md` is task-local and auditable. It should not be treated as durable knowledge by default.
- Current status: `tasks/current.md` is a tracked derived snapshot for orientation only. It must be regenerated from source artifacts and must not contain hand-written kanban/checklist state.
- Evidence: `.ai/harness/checks/latest.json` is the current gate, while `.ai/harness/runs/*.json` keeps immutable verification snapshots for later audit.
- Memory: `docs/researches/`, `tasks/lessons.md`, and gbrain are advisory. Current repo state and evidence override summaries.
- External knowledge: `brain/<project>/*` stores long-form explanations, runbooks, decisions, and patterns. Hooks may write only explicitly opted-in `repo-to-brain` manifest entries; checks must not require gbrain or MCP.
- Assets: policies, hooks, scripts, templates, and reference configs only change when a pattern has evidence across tasks or fixtures.

## Trace Evidence

`scripts/verify-sprint.sh` writes `.ai/harness/checks/latest.json` and an immutable `.ai/harness/runs/*.json` snapshot using `schema: repo-harness-run-trace.v1`. The trace is local evidence for workflow grading, not a cloud tracing dependency.

Required v1 fields:

- `run_id`, `generated_at`, `status`, `exit_code`, and `source`
- `task_profile`, `active_plan`, `contract`, `review`, `worktree`, and `branch`
- `commands`, `guards`, `handoffs`, `files_changed`, and `allowed_paths_check`
- `external_acceptance`, `failure_class`, and `next_step`

`scripts/check-task-workflow.sh --strict` validates the latest trace shape when a non-empty latest checks file exists. `scripts/harness-trace-grade.sh --run <trace> --strict` applies the local graders used for workflow regression checks: active plan resolves, contract profile is valid, Human Review Card passes, command evidence exists, and changed files stay inside allowed paths.

## Capability Context

- Do not infer agent context boundaries from physical layout globs such as `apps/*`, `packages/*`, or `services/*`.
- Declare capabilities in `.ai/context/capabilities.json`; each capability owns prefixes, paired contract files, an architecture module, a workstream directory, and local verification hints.
- Add selected capabilities with `repo-harness-capability` or `bun .ai/harness/scripts/capability-config.ts add --prefix <path>` when the harness already exists and a full init/migrate/upgrade pass would be too broad.
- Resolve edited paths through `.ai/harness/scripts/capability-resolver.ts match --path <path>`; longest prefix wins and equal-length ambiguity fails.
- Treat `.ai/context/agent-context-blocks.txt`, `REPO_HARNESS_CONTEXT_BLOCKS`, and existing nested `CLAUDE.md`/`AGENTS.md` files as migration inputs or compatibility fallbacks only.
- Selected capabilities receive paired `CLAUDE.md` and `AGENTS.md` files so Claude Code and Codex share the same local contract.
- Use `repo-harness capability-context status|request|sync` to keep paired local context files aligned with the registry. The command writes only the controlled `CAPABILITY CONTEXT` block and preserves hand-authored content plus the separate architecture contract block.
- `.ai/context/capability-source-map.json` is the optional human-edited source-map manifest for capability positioning and source pointers. Missing entries fall back to registry/architecture/workstream metadata; `--auto-fill-positioning` writes deterministic draft entries explicitly, not from hooks.
- `.ai/harness/capability-context/` is ignored runtime queue state. Post-edit hooks may enqueue requests, and `SessionStart` only reminds the current agent to run `repo-harness capability-context sync --pending --apply`.
- `SessionStart` also summarizes pending architecture request cards so a resumed agent can see drift debt before claiming finish.

## Initializer and Runtime Model

Maintainer-facing detail on how the initializer and runtime defaults are wired.

- Question flow uses **12 grouped decision points** with harness defaults inferred first.
- Plan menu is tiered: **Core Plans (A-F)** first, **Custom Presets (G-K)** only when needed.
- Skill routing is inspection-first: `scripts/inspect-project-state.ts`, `scripts/migrate-workflow-docs.ts`, `assets/workflow-contract.v1.json`.
- Runtime mode is configurable with template vars: `{{RUNTIME_MODE}}`, `{{RUNTIME_PROFILE}}`, `{{RECOVERY_PROFILE}}`, `{{STATE_PROFILE}}`.
- Question-pack source of truth: `assets/initializer-question-pack.v4.json`.
- Generated repos default to the repo-local harness flow: `docs/spec.md -> plans/ -> tasks/contracts/ -> tasks/reviews/ -> .ai/context/context-map.json -> .ai/harness/*`.
- Generated and self-hosted repos install `.ai/harness/workflow-contract.json` and `.ai/harness/policy.json`.
- Generated and migrated repos default `external_tooling` to: `complex -> gstack`; `simple -> Waza` with Codex-first runtime copies in `~/.codex/skills`; `knowledge -> gbrain`.
- `repo-harness install` bootstraps the Codex/Claude runtime pieces for the default workflow: refreshes `repo-harness` skill aliases, installs global Codex/Claude hook adapters, installs Waza skills (`think`, `hunt`, `check`, `health`) and Mermaid through the skills CLI, persists the brain root in `~/.repo-harness/config.json`, and configures CodeGraph MCP for selected host agents. `repo-harness init` remains a compatibility alias for existing automation.
- Other external tooling stays advisory-only: `bash scripts/check-agent-tooling.sh --host both --check-updates`; Waza update checks compare upstream `tw93/Waza` `SKILL.md` hashes without running `npx skills check`; no automatic gstack, gbrain MCP, CodeGraph daemon, or provider setup.
- Manual distillation stays repo-local: repeated corrections -> `tasks/lessons.md`; deep findings and hidden contracts -> topic-scoped `docs/researches/*.md`; sprint verification evidence -> `tasks/reviews/*.review.md`; durable capability progress -> `tasks/workstreams/`; release history -> `docs/CHANGELOG.md`.
