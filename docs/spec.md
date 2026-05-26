# Product Spec: agentic-dev

> **Status**: Active
> **Last Updated**: 2026-04-19 01:04
> **Owner**: Planner

## Product Outcome

Generate and migrate repo-local agentic workflow contracts for Claude and Codex.
The skill, formerly `agentic-dev-skill` and `project-initializer`, keeps root context stable, exposes
deeper context progressively, externalizes workflow state into repo-local
artifacts, and lets this repository self-host the same critical contract it
generates for downstream repos.

## Success Criteria

- Primary workflow:
  scaffold or migrate a repo so `plans/`, `tasks/`, `.ai/context/`, `.ai/harness/`,
  shared hooks, and verification helpers are present and internally consistent.
- Command surface:
  expose action-style `agentic-dev-*` command skill facades for planning,
  review, autoplan, init, scaffold, migrate, upgrade, capability configuration,
  architecture maintenance, handoff rollover, deploy readiness, repair, and
  check without duplicating the workflow engine.
- Quality bar:
  self-migration is idempotent, critical parity surfaces stay aligned, and the
  required verification commands pass in this repo.
- Out of scope:
  replicating the full Hermes runtime, adding a SQLite session store, or building
  a multi-provider agent gateway.

## Constraints

- Technical:
  keep workflow state file-backed with Markdown, JSON, and JSONL; keep root
  routing docs short; prefer shared helper libraries over duplicated logic.
- Compliance:
  contracts must be machine-readable where possible and safe to keep as long-lived
  repo context.
- Delivery:
  self-host and generated critical surfaces should move together, with tests
  guarding the important parity points.

## Acceptance Scenarios

- Given
  a repository missing the tasks-first harness,
  When
  `bash scripts/migrate-project-template.sh --repo <repo> --apply` runs,
  Then
  `docs/spec.md`, `tasks/reviews/`, `.ai/context/context-map.json`,
  `.ai/harness/policy.json`, `.ai/harness/workflow-contract.json`, and the
  required helper scripts exist and
  `bash scripts/check-task-workflow.sh --strict` passes.

- Given
  hook-backed workflow events such as tool tracing or handoff refresh,
  When
  the shared workflow state helpers append structured metadata,
  Then
  `.claude/.trace.jsonl` and `.ai/harness/events.jsonl` are written without
  aborting the session flow.

- Given
  a user asks to initialize an existing repo or scaffold a new project,
  When
  the action command surface routes the request,
  Then
  `agentic-dev-init` handles existing repo adoption and `agentic-dev-scaffold`
  handles new project or module creation, while hook and docs initialization
  remain internal implementation steps.

## Open Questions

- Should `.ai/hooks/` and `assets/hooks/` eventually sync mechanically instead of by parity discipline?
- Should the skill expose a first-class preset for self-hosted tooling repos instead of hand-authored root routing docs?
