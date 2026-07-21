# Architecture Index

> Umbrella architecture ledger for current boundaries, drift requests, snapshots, and diagrams.

## Current Snapshot

- Latest snapshot: [repo-harness plugin review](snapshots/2026-05-25-repo-harness-plugin-review.md) (2026-05-25)
- Latest semantic diagram: [repo-harness plugin review Mermaid](snapshots/2026-05-25-repo-harness-plugin-review.md#semantic-diagram) (2026-05-25)
- Latest human diagram: [repo-harness plugin architecture](diagrams/agentic-dev-plugin-architecture.html) (2026-05-25)
- Runtime hook adapter semantic diagram: [hook adapter workflow Mermaid](modules/runtime-harness/hook-adapters.md#semantic-diagram) (2026-05-30)

## System Boundary

`repo-harness` is a repo-local workflow harness CLI and skill with an optional
local MCP sidecar. It is not a hosted product runtime, agent gateway, or database
service. Its job is to inspect a target repository, install or refresh a
file-backed workflow contract, route public command skills, expose explicitly
configured local MCP capabilities, and verify that generated repo-local surfaces
remain consistent.

Authoritative surfaces:

- Public router: `SKILL.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`.
- Public command facades: `assets/skill-commands/*/SKILL.md` plus `assets/skill-commands/manifest.json`.
- Engine: `scripts/inspect-project-state.ts`, `src/core/adoption/`, `src/effects/fs-transaction.ts`, `scripts/create-project-dirs.sh`, `scripts/lib/project-init-lib.sh`, and the [Transactional Adoption Planner](transactional-adoption-planner.md).
- Contract assets: `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`, `.ai/harness/policy.json`, `.ai/context/context-map.json`, `.ai/context/capabilities.json`.
- Runtime harness: `assets/hooks/`, `.ai/hooks/`, user-level host adapters, and ignored `.ai/harness/*` runtime state.
- MCP sidecar: `src/cli/mcp/`, `src/cli/commands/mcp.ts`, user-owned ignored config/registry under `~/.repo-harness/`, and the [MCP sidecar architecture](modules/runtime-harness/mcp-sidecar.md).
- Verification: `tests/`, `evals/`, `scripts/check-task-workflow.sh`, `scripts/check-task-sync.sh`, `scripts/check-agent-tooling.sh`, `scripts/ensure-codegraph.sh`.
- Effective State and workflow policy: `src/core/state/` (pure Effective State
  projection, ESA PR #79), `src/effects/state/` (source resolution and
  publication), and `src/core/workflow/` — `profile.ts` owns the deterministic
  risk/profile authority and `artifact-requirement-policy.ts` (LSC-02) owns
  the Lite/Standard/Strict x edit/stop/ship artifact-requirement matrix.
  Consumer cutovers to that matrix land one package at a time through the
  Loop Semantics Convergence sprint
  (`plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`);
  its frozen current-behavior baseline lives in
  `tests/state/loop-semantics-characterization.test.ts`.
- Loop semantics parity contract (LSC-08): the readiness authority
  (`src/core/workflow/operation-readiness.ts`'s `evaluateReadiness`, carried
  verbatim as `EffectiveStateV1.readiness`) and its Skill guidance
  (`EffectiveStateV1.guidance`) are projected, never recomputed, by four
  adapter surfaces — CLI (`repo-harness state resolve --json`, including
  `--field readiness`), MCP (`summarize_repo_harness_state`'s compact
  state), Hook (the Stop route's in-process `stop-handler.ts` reading
  `.readiness.allowedToStop` / `.readiness.readyToShip`), and Skill
  (guidance text matched against `CEREMONY_GUIDANCE[profile]`). All four
  agree on profile, operation, decision, reason, and readiness for the same
  fixtures; the parity gate is `tests/state/adapter-parity.test.ts`, with no
  separate gate machinery.
- Shared execution effects: `src/effects/process-runner.ts`,
  `src/effects/process-supervisor.ts`, `src/effects/process-group-launcher.ts`,
  `src/effects/locking/`, and `src/effects/git/` own bounded process lifecycle
  and canonical filesystem/Git primitives consumed by workflow and
  verification modules.

Out of scope:

- Product application scaffolds after their first generated skeleton.
- `_ref/` external reference checkouts and `_ops/` private operations state.
- Installing, upgrading, or enabling external host tools such as Waza, `geju`, or MCP servers. This self-host repo may vendor CodeGraph as a dev dependency, but generated downstream repos keep CodeGraph host setup explicit unless local policy opts in.
- Vendoring external skill bodies such as `mermaid`.

## Umbrella Hierarchy

```text
Project
  -> architecture domain
     -> capability
        -> capability contract block
        -> workstream ledger
        -> current todo slice
        -> source plan
```

- Architecture owns stable truth: boundaries, snapshots, embedded Mermaid, and optional rendered diagrams.
- `.ai/context/capabilities.json` owns declared capability prefixes and longest-prefix matching.
- Local `AGENTS.md` / `CLAUDE.md` contract blocks own agent-facing context projection.
- `tasks/workstreams/<domain>/<capability>/` owns durable multi-session progress.
- `tasks/todos.md` owns deferred medium/long-term goals with tradeoff and revisit trigger; current execution slices stay in the active plan's `## Task Breakdown`.

## Domains

- [Public Surface](domains/public-surface.md): root router, README, root agent docs, and action command facades.
- [Workflow Engine](domains/workflow-engine.md): inspection, migration, template install, contract assets, and policy/context generation.
- [Runtime Harness](domains/runtime-harness.md): generated hook implementation, user-level adapter settings, handoff, and runtime event state.
- [Verification](domains/verification.md): unit tests, smoke checks, eval fixtures, CodeGraph readiness, and advisory tooling probes.

## Architecture Drift Flow

- `scripts/architecture-queue.sh` records architecture-sensitive edits as requests.
- `scripts/capability-resolver.ts` resolves changed paths to capabilities with longest-prefix matching.
- `scripts/archive-architecture-request.sh` archives handled requests after an agent records the resolution status and linked artifacts; `Resolved` requires the request's declared architecture module as an existing durable artifact.
- `scripts/context-contract-sync.sh` keeps only the controlled architecture block in capability `AGENTS.md` and `CLAUDE.md` files aligned.
- `scripts/workstream-sync.sh` keeps durable multi-session progress under `tasks/workstreams/<domain>/<capability>/` and projects only pointers into local contracts.
- Semantic diagrams live as Mermaid fenced blocks in the relevant architecture module or snapshot Markdown.
- Human-readable diagrams are optional standalone HTML files in `docs/architecture/diagrams/`; when generated by an agent, use the `mermaid` architecture type, keep the diagram self-contained, and link it back to the Markdown semantic source.
- `mermaid` is an external installed skill dependency (`~/.codex/skills/mermaid`), not vendored architecture code.

## Request Archive Rule

- `docs/architecture/requests/` contains only pending architecture drift requests.
- Handled requests move to `docs/architecture/requests/archive/YYYY/`.
- Valid terminal statuses are `Resolved`, `Superseded`, `Rejected`, and `No architecture change`.
- The archived request must link any produced module, snapshot, embedded Mermaid source, or human diagram artifact.
- `docs/architecture/index.md` keeps only pending request links.

## 2026-07-16 Closeout Runner Guardrails

- P1: helper dispatch and authoritative benchmark production are separate
  consumers of one neutral lifecycle/locking effects layer. Workflow helper
  policy remains in `src/cli/runtime/helper-runner.ts`; benchmark semantics
  remain in `scripts/run-harness-profile-benchmark.ts`.
- P2: helper identity selects a fixed timeout envelope. A private launcher
  waits on an inherited start barrier while the supervisor publishes the PGID;
  only then may the target start. The supervisor normally performs `SIGTERM ->
  500ms -> SIGKILL` and publishes completion only after PGID absence; if the
  supervisor itself exceeds its hard envelope, the synchronous parent repeats
  that bounded cleanup against the published PGID. Expensive consumers contend on
  `<git-common-dir>/repo-harness/expensive-run.lock`. Linked worktrees therefore
  share one lane while repo-local state locking keeps its existing path.
- P3: the directory-token primitive was moved, not duplicated, so state and
  closeout locks retain the same fail-closed ancestor, exact-token, and stale
  owner rules. Portable process-group cleanup is guaranteed on POSIX; Windows
  uses best-effort `taskkill /T`, and direct raw Bash helper execution remains
  internal rather than a second supported lifecycle authority.

## Pending Requests


<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->
- [ ] 2026-07-21T21:39:15+0800 [high] `scripts/ensure-task-workflow.sh` -> [root](requests/root.md)
- [ ] 2026-07-21T21:39:22+0800 [high] `src/cli/hook/prompt-intents.ts` -> [runtime-harness-hook-adapters](requests/runtime-harness-hook-adapters.md)
<!-- END ARCHITECTURE PENDING REQUESTS -->



## Review Backlog

- Treat user-level `~/.codex/hooks.json` and `~/.claude/settings.json` as host adapters. Keep hook implementation under `.ai/hooks/`, and treat repo-local `.claude/settings.json` / `.codex/hooks.json` hook adapters as retired legacy config.
- Consider adding `bun scripts/capability-resolver.ts validate --format text` to the strict workflow gate after the architecture registry has been used through one more real slice.
