# Harness Overview

This repo uses a shared long-running harness. The durable workflow lives in repo-local artifacts, not in chat memory.

## Roles

- **Planner** updates `docs/spec.md`, researches constraints, and writes or approves `plans/plan-*.md`.
- **Generator** implements only against the active sprint contract and the plan's `## Task Breakdown`, leaving `tasks/todo.md` as a deferred-goal ledger, and records task-local implementation judgments in `tasks/notes/<slug>.notes.md`.
- **Evaluator** runs Waza `/check`, then writes `tasks/reviews/<slug>.review.md` using fresh evidence from `.ai/harness/checks/latest.json` and `.ai/harness/runs/*.json`.

## State Flow

1. `docs/spec.md` captures stable product intent.
2. `plans/plan-*.md` captures a concrete execution approach.
3. `tasks/contracts/<slug>.contract.md` defines done for the active sprint.
4. `tasks/todo.md` is the execution projection for the active sprint.
5. `tasks/notes/<slug>.notes.md` records design decisions, deviations, tradeoffs, open questions, and promotion candidates for this sprint only.
6. `tasks/reviews/<slug>.review.md` records evaluator judgment.
7. `.ai/harness/policy.json` is the machine-readable workflow contract.
8. `information_lifecycle` inside `.ai/harness/policy.json` separates notes, raw evidence, reusable assets, advisory memory, and external knowledge.
9. `agentic_development` inside `.ai/harness/policy.json` captures product, engineering, design, bug-hunt, and review routing.
10. `external_tooling` inside `.ai/harness/policy.json` captures host install/update defaults for gstack, Waza, gbrain, and required CodeGraph readiness.
11. `.ai/context/capabilities.json` declares capability prefixes, contract files, architecture modules, and workstream directories.
12. `.ai/context/context-map.json` indexes stable root context and discoverable capability context derived from the registry.
13. `documentation` inside `.ai/harness/policy.json` keeps generated docs minimal and moves optional docs to agent-created, evidence-backed output.
14. `lsp_profiles` inside policy and context-map files select tooling hints per capability.
15. `worktree_strategy` inside policy tells agents when to isolate contract-level work in `codex/<slug>` worktrees, start execution through `scripts/contract-worktree.sh start --plan <plan>`, and finish with Waza `/check` plus `scripts/contract-worktree.sh finish`.
16. `.ai/harness/handoff/current.md` preserves resumable state across sessions.
17. `.ai/harness/events.jsonl` and `.ai/harness/runs/*.json` retain lightweight execution traces.

## Session Boundaries

- Exploration and planning are allowed before a contract exists.
- Before implementation, the plan and contract should both expose a concrete workflow inventory so the agent does not rediscover or guess active artifacts.
- Implementation should prefer `docs/spec.md`, an approved plan, and an active sprint contract.
- Claiming completion should include contract verification evidence, a run snapshot, implementation notes, and a passing Waza `/check` review artifact.
- Stopping a session should refresh `.ai/harness/handoff/current.md` for easier resume.
- Use `docs/reference-configs/agentic-development-flow.md` for skill routing and `docs/reference-configs/external-tooling.md` for install/update commands.
- Use `docs/reference-configs/global-working-rules.md` as the user-level Claude/Codex rule template; keep repo-local workflow contracts in repo files.
- Externalized reference docs are indexed by `.ai/harness/brain-manifest.json` and checked by `scripts/check-brain-manifest.sh`. Valuable repo docs can opt into default-brain mirroring with `sync.direction=repo-to-brain`; `post-edit-guard.sh` then calls `scripts/sync-brain-docs.sh --changed <path>` for that specific file.
- Contract-level execution should run in an isolated `codex/<task-slug>` worktree. Merge back only after the contract is fulfilled, `tasks/reviews/<slug>.review.md` recommends pass, and the target worktree is clean.

## Documentation Profile

- Default profile: `minimal-agentic`.
- Required docs: `docs/spec.md` and `docs/architecture/index.md`.
- Optional docs such as `docs/brief.md`, `docs/tech-stack.md`, `docs/decisions.md`, `docs/architecture.md`, and `docs/packages.md` are created only when the agent has concrete repo evidence or the user asks.
- Root `specs/` is a legacy scaffold surface; use `docs/spec.md`, `interfaces/`, and tests instead.
- Use `docs/reference-configs/document-generation.md` for the creation rules.

## Information Lifecycle

- Notes: `tasks/notes/<slug>.notes.md` is task-local and auditable. It should not be treated as durable knowledge by default.
- Evidence: `.ai/harness/checks/latest.json` is the current gate, while `.ai/harness/runs/*.json` keeps immutable verification snapshots for later audit.
- Memory: `tasks/research.md`, `tasks/lessons.md`, and gbrain are advisory. Current repo state and evidence override summaries.
- External knowledge: `icloud/brain/<project>/*` stores long-form explanations, runbooks, decisions, and patterns. Hooks may write only explicitly opted-in `repo-to-brain` manifest entries; checks must not require gbrain or MCP.
- Assets: policies, hooks, scripts, templates, and reference configs only change when a pattern has evidence across tasks or fixtures.

## Capability Context

- Do not infer agent context boundaries from physical layout globs such as `apps/*`, `packages/*`, or `services/*`.
- Declare capabilities in `.ai/context/capabilities.json`; each capability owns prefixes, paired contract files, an architecture module, a workstream directory, and local verification hints.
- Add selected capabilities with `agentic-dev-capability` or `bun scripts/capability-config.ts add --prefix <path>` when the harness already exists and a full init/migrate/upgrade pass would be too broad.
- Resolve edited paths through `scripts/capability-resolver.ts match --path <path>`; longest prefix wins and equal-length ambiguity fails.
- Treat `.ai/context/agent-context-blocks.txt`, `PROJECT_INITIALIZER_CONTEXT_BLOCKS`, and existing nested `CLAUDE.md`/`AGENTS.md` files as migration inputs or compatibility fallbacks only.
- Selected capabilities receive paired `CLAUDE.md` and `AGENTS.md` files so Claude Code and Codex share the same local contract.
