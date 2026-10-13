# Architecture Index

> Product-level architecture of repo-harness: boundary, domains, runtime paths,
> state authority, and links to every module page.

## Current Snapshot

- The architecture model lives in `.archcontext/model/`. It declares 37
  capabilities in 6 domains, 65 components, 302 relations and 52 flows.
- Every capability page under [modules](modules/) shows `Proof: proven` for its
  P1 map and its P2 flow.
- The full generated graph is in [diagrams/architecture.mmd](diagrams/architecture.mmd),
  [diagrams/architecture.likec4](diagrams/architecture.likec4) and
  [diagrams/architecture.structurizr.json](diagrams/architecture.structurizr.json).
  The generated entity and relation lists are at the end of this page.
- Cross-module contracts that are not capability pages:
  [Effective State Authority](effective-state-authority.md),
  [Shared Coordination Plane](shared-coordination-plane.md),
  [Global Hook Runtime](global-hook-runtime.md) and
  [Transactional Adoption Planner](transactional-adoption-planner.md).

## System Boundary

`repo-harness` is a repo-local workflow harness CLI and skill with an optional
local MCP sidecar. It is not a hosted product runtime, agent gateway, or
database service. Its job is to inspect a target repository, install or refresh
a file-backed workflow contract, route public command skills, expose explicitly
configured local MCP capabilities, and verify that generated repo-local surfaces
remain consistent.

The product has two layers that share one set of files (`README.md`, "Two
Layers"):

- **Session contract.** One human, one agent session, one task. Plans,
  contracts, checks, reviews and handoffs are the durable authority. Hooks keep
  the session inside them.
- **Bot-scheduled programs.** The Bot is the entry point for long-running work.
  It drives the repo-harness CLI and Herdr task agents. repo-harness supplies
  the tools and the evidence. The Bot decides what runs next.

Authoritative surfaces:

- Public router: `SKILL.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`.
- Public command facades: `assets/skill-commands/*/SKILL.md` plus `assets/skill-commands/manifest.json`.
- Engine: `scripts/inspect-project-state.ts`, `src/core/adoption/`, `src/effects/fs-transaction.ts`, `scripts/create-project-dirs.sh`, `scripts/lib/project-init-lib.sh`, and the [Transactional Adoption Planner](transactional-adoption-planner.md).
- Contract assets: `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`, `.ai/harness/policy.json`, `.ai/context/context-map.json`, and the capability authority selected by `.ai/harness/policy.json#context.capability_source` (this repo: `.archcontext/model/nodes/*.yaml`).
- Runtime harness: the `repo-harness-hook` binary (`package.json` `bin`), the typed route registry `src/cli/hook/route-registry.ts`, user-level host adapters, and ignored `.ai/harness/*` runtime state. `assets/hooks/lib/workflow-state.sh` is the package operator library.
- MCP sidecar: `src/cli/mcp/`, `src/cli/commands/mcp.ts`, user-owned ignored config and registry under `~/.repo-harness/`, and the [MCP sidecar architecture](modules/runtime-harness/mcp-sidecar.md).
- Verification: `tests/`, `evals/`, `scripts/check-task-workflow.sh`, `scripts/check-task-sync.sh`, `scripts/check-agent-tooling.sh`, `scripts/ensure-codegraph.sh`.
- Effective State and workflow policy: `src/core/state/` (pure Effective State
  projection, ESA PR #79), `src/effects/state/` (source resolution and
  publication), and `src/core/workflow/`. `profile.ts` owns the deterministic
  risk profile (`routine` or `high`). `artifact-requirement-policy.ts` owns the
  `routine`/`high` x edit/stop/ship artifact-requirement matrix. The Loop
  Semantics Convergence sprint is archived at
  `plans/archive/20260716-0101-loop-semantics-convergence.sprint.md`. Its state
  goldens live in `tests/state/cli-state-golden.test.ts`.
- Loop semantics parity contract (LSC-08): the readiness authority
  (`src/core/workflow/operation-readiness.ts`, `evaluateReadiness`, carried as
  `EffectiveStateV1.readiness`) and its Skill guidance
  (`EffectiveStateV1.guidance`) are projected, never recomputed. The adapter
  surfaces are the CLI (`repo-harness state resolve --json`), MCP
  (`summarize_repo_harness_state`), the Stop hook route
  (`src/cli/hook/stop-handler.ts` reads `readiness.readyToShip` and reports a
  warning without a stop gate) and the Skill guidance text
  (`CEREMONY_GUIDANCE` in `src/core/state/project-effective-state.ts`). The
  parity gate is `tests/state/adapter-parity.test.ts`.
- Shared coordination plane: lease identity and the four-state machine
  (`src/core/state/coordination-identity.ts`,
  `src/effects/state/coordination-lease-store.ts`, `src/cli/commands/sprint.ts`)
  plus the read-only board projection (`src/core/state/project-board.ts`,
  `src/effects/state/collect-board-inputs.ts`,
  `src/effects/state/resolve-board.ts`, `repo-harness state board --json`). See
  the [Shared Coordination Plane](shared-coordination-plane.md).
- Shared execution effects: `src/effects/process-runner.ts`,
  `src/effects/process-supervisor.ts`, `src/effects/process-group-launcher.ts`,
  `src/effects/locking/`, and `src/effects/git/` own bounded process lifecycle
  and canonical filesystem and Git primitives (capability
  [execution-primitives](modules/workflow-engine/execution-primitives.md)).

Out of scope:

- Product application scaffolds after their first generated skeleton.
- `_ref/` external reference checkouts and `_ops/` private operations state.
- Installing, upgrading, or enabling external host tools such as Waza, `geju`, or MCP servers. This self-host repo may vendor CodeGraph as a dev dependency, but generated downstream repos keep CodeGraph host setup explicit unless local policy opts in.
- Vendoring external skill bodies such as `mermaid`.
- Merging pull requests. The provider and the user perform the merge.

## Domain Map

| Domain | Capabilities | Purpose | Page |
| --- | --- | --- | --- |
| public-surface | 4 | Routes user intent to CLI-backed command facades, adopts repositories, and collects strategy context. | [Public Surface](domains/public-surface.md) |
| workflow-engine | 4 | Owns the workflow contract and templates, inspects and migrates repositories, resolves Effective State and the coordination plane, and provides process, lock and Git primitives. | [Workflow Engine](domains/workflow-engine.md) |
| runtime-harness | 22 | Runs host hooks and the installed runtime, hosts task agents, records evidence and observations, serves the MCP sidecar, and runs the Module Engineer organization. | [Runtime Harness](domains/runtime-harness.md) |
| organization | 2 | Delivers tasks across repositories: task offers, acquire, the Task Inbox, and PR publication. | [Organization](domains/organization.md) |
| runtime-mcp | 2 | Exposes bounded repository tools through MCP and runs the local ChatGPT browser consult. | [Runtime MCP](domains/runtime-mcp.md) |
| verification | 3 | Runs tests, gates and evals, records the acceptance receipt, and checks CodeGraph readiness. | [Verification](domains/verification.md) |

## Main Runtime Paths

The diagram shows the five main entry paths. Each solid edge between two
repo-harness nodes is a relation in the model. The table below gives the
relation id. Dashed edges go to external actors that the model does not
declare. The table gives their source evidence.

```mermaid
flowchart LR
  classDef ext fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:4 3
  classDef cap fill:#1e3a8a,stroke:#bfdbfe,color:#ffffff
  classDef store fill:#14532d,stroke:#bbf7d0,color:#ffffff

  Bot["Bot"]:::ext
  Host["Claude / Codex / Pi host"]:::ext
  Client["ChatGPT or other MCP client"]:::ext
  Human["Human in a browser"]:::ext
  Herdr["Herdr panes"]:::ext
  Provider["GitHub provider"]:::ext
  Archctx["archctx"]:::ext

  CLI["CLI root<br/>global-runtime-reconciliation"]:::cap
  Hooks["hook-adapters"]:::cap
  MCP["mcp-sidecar"]:::cap
  Repo["general-repo-access"]:::cap
  Console["operator web console"]:::cap
  OpServer["operator HTTP reader"]:::cap
  Closure["archctx closure<br/>global-runtime-reconciliation"]:::cap
  Fleet["task-fleet"]:::cap
  Pub["publication"]:::cap
  PM["pm-dispatch"]:::cap
  TAH["task-agent-host"]:::cap
  Review["acceptance-review"]:::cap
  Pipe["pipeline-ledger"]:::cap
  WS["workflow-state"]:::store
  EL["evidence-ledger"]:::store
  CA["contract-assets"]:::cap

  Bot -.-> CLI
  CLI --> Fleet
  CLI --> TAH
  CLI --> WS
  CLI --> Pub
  Fleet --> WS
  Fleet --> CA
  Fleet --> Pub
  TAH -.-> Herdr
  Pub -.-> Provider

  Host -.-> Hooks
  Hooks --> WS
  Hooks --> EL
  Hooks --> Fleet

  Client -.-> MCP
  MCP --> PM
  MCP --> Fleet
  MCP --> Pub
  MCP --> Repo
  MCP --> WS
  PM --> TAH

  Human -.-> Console
  Console --> OpServer
  OpServer --> Fleet
  OpServer --> Pipe
  OpServer --> Closure

  CLI --> Closure
  Closure -.-> Archctx
  Closure --> Review
  Review --> TAH
  WS --> EL
```

| Edge | Evidence |
| --- | --- |
| Bot -> CLI root | External. `README.md` "Two Layers": the Bot drives programs through the repo-harness CLI and Herdr. |
| CLI root -> task-fleet, task-agent-host, workflow-state, publication | `relation.global-runtime-reconciliation.cli-root.task-fleet`, `.task-agent-host`, `.workflow-state`, `.publication` (`buildProgram` registers the fleet, herdr, task-agent, sprint, state and publication commands). |
| task-fleet -> workflow-state | `relation.task-fleet.primary.workflow-state`: read canonical Sprint tasks and leases to build offers and the board. |
| task-fleet -> contract-assets | `relation.task-fleet.contract-assets`: run packaged contract worktree helpers to provision and bind an acquired task. |
| task-fleet -> publication | `relation.task-fleet.publication`: read publication receipts, readiness and provider feedback. |
| task-agent-host -> Herdr | External. The capability hosts persistent task agents in Herdr panes (capability summary). |
| publication -> GitHub provider | External. Publication binds a claim generation to a pull request and never merges it (`modules/organization/publication.md` §3.1). |
| Host -> hook-adapters | External. User-level host hooks call the `repo-harness-hook` binary (`package.json` `bin`, [Global Hook Runtime](global-hook-runtime.md)). |
| hook-adapters -> workflow-state, evidence-ledger, task-fleet | `relation.hook-adapters.primary.workflow-state`, `relation.hook-adapters.session-lifecycle.evidence-ledger`, `relation.hook-adapters.session-lifecycle.task-fleet`. |
| MCP client -> mcp-sidecar | External. `README.md` "MCP Connector". |
| mcp-sidecar -> pm-dispatch, task-fleet, publication, general-repo-access, workflow-state | `relation.mcp-sidecar.primary.pm-dispatch`, `.task-fleet`, `.publication`, `.general-repo-access`, `.workflow-state`. |
| pm-dispatch -> task-agent-host | `relation.pm-dispatch.task-agent-host`: start the fixed OAR coding host and deliver requests through the task session. |
| Human -> operator web console | External. `README.md` "Local Human Control Board" (`repo-harness operator serve`). |
| operator web console -> HTTP reader | `relation.operator.web-console.http-reader`: GET and HEAD routes only. |
| operator HTTP reader -> task-fleet, pipeline-ledger, archctx closure | `relation.operator.primary.task-fleet`, `relation.operator.primary.pipeline-ledger`, `relation.operator.http-reader.model-reader`. |
| CLI root -> archctx closure | `relation.global-runtime-reconciliation.cli-root.archctx-closure`: register the architecture-projection command. |
| archctx closure -> archctx | External. `src/effects/architecture/archctx-provider.ts` runs the package-local archctx binary. |
| archctx closure -> acceptance-review | `relation.global-runtime-reconciliation.archctx-closure.acceptance-review`: build the module review prompt from the committed model. |
| acceptance-review -> task-agent-host | `relation.acceptance-review.primary.task-agent-host`: run the persistent review session on a Herdr task agent. |
| workflow-state -> evidence-ledger | `relation.workflow-state.coordination-plane.evidence-ledger`: write lease and topology records durably. |

## Authority and State Map

Each datum has one authority. Every other representation is a projection.

| Datum | Authority (store) | Owner capability | Projections and readers |
| --- | --- | --- | --- |
| Workflow contract | `assets/workflow-contract.v1.json`; the repo opt-in marker `.ai/harness/workflow-contract.json` | contract-assets | Templates, helper copies and reference configs are byte projections. |
| Architecture model | `.archcontext/model/{nodes,relations,flows}/`, written through archctx ChangeSets | contract-assets (files); global-runtime-reconciliation runs the projection | Generated regions in `docs/architecture/**`. `repo-harness module` and the operator read the committed HEAD snapshot (`src/effects/architecture/model-reader.ts`). |
| Capability ownership | Capability nodes only (`src/core/capabilities/registry.ts`) | contract-assets | `scripts/capability-resolver.ts` longest-prefix match. |
| Plans, contracts and reviews | Repository Markdown under `plans/` and `tasks/` | workflow-state reads them | Effective State is the single deterministic projection. Its JSON cache and `tasks/current.md` are read models ([Effective State Authority](effective-state-authority.md)). |
| Task identity | The ID cell of the canonical Sprint row | workflow-state | Task revision, fleet offers and boards. |
| Task execution (lease) | `<git-common-dir>/repo-harness/coordination/v1/`; claim tokens under `.ai/harness/sprint/claims` | workflow-state | State board and fleet board (read-only, no persisted column). |
| Task messages | `<git-common-dir>/repo-harness/task-inbox/v2` | task-fleet | Session context renders them as untrusted data. They hold no authority. |
| Publication | Immutable receipts in `<git-common-dir>/repo-harness/publications/v1`; the `current_publication` pointer in the lease record | publication | Merge readiness is derived at read time and never stored. |
| Acceptance | `~/.repo-harness/gates/<repo-id>/acceptance.latest.json` | acceptance-review | Effective State, bound-task-freezes and integration acceptance read it. |
| Harness evidence | `.ai/harness/evidence/events/log.jsonl` and `.ai/harness/evidence/blobs` | evidence-ledger | Handoff and resume recovery views. |
| Pipeline facts | SQLite `pipelines.db` (`REPO_HARNESS_PIPELINES_DB`) | pipeline-ledger | Operator pipeline board. The ledger never dispatches, merges or cleans. |
| Engineer contracts and bindings | Tracked `agents/engineers/**`; bindings in `<git-common-dir>/repo-harness/engineers/v1` | engineer-bindings | Engineer offers and the engineering overlay. |
| Task agent sessions | Herdr panes; records under `.ai/harness/runs/task-agents` and task worktrees under `.ai/harness/runs/task-workspaces` | task-agent-host | Pipeline ledger and acceptance review read the session records. |
| Repository registry | `~/.repo-harness/registered-repos.json` | mcp-sidecar | Fleet offers, PM dispatch, operator and work demand read it. |
| Global configuration | `~/.repo-harness/config.json` | global-runtime-reconciliation | Projection policy (`src/effects/architecture/projection-config.ts`). |
| Merge | The provider and the user | none | repo-harness never merges. |

## Capability Index

| Domain | Capability | Module page |
| --- | --- | --- |
| public-surface | Root Router | [root-router](modules/public-surface/root-router.md) |
| public-surface | Action Commands | [action-commands](modules/public-surface/action-commands.md) |
| public-surface | Adoption | [adoption](modules/public-surface/adoption.md) |
| public-surface | Strategy Reflection | [strategy-reflection](modules/public-surface/strategy-reflection.md) |
| workflow-engine | Inspection And Migration | [inspection-migration](modules/workflow-engine/inspection-migration.md) |
| workflow-engine | Contract Assets | [contract-assets](modules/workflow-engine/contract-assets.md) |
| workflow-engine | Workflow State | [workflow-state](modules/workflow-engine/workflow-state.md) |
| workflow-engine | Execution Primitives | [execution-primitives](modules/workflow-engine/execution-primitives.md) |
| runtime-harness | Hook Adapters | [hook-adapters](modules/runtime-harness/hook-adapters.md) |
| runtime-harness | Global Runtime Reconciliation | [global-runtime-reconciliation](modules/runtime-harness/global-runtime-reconciliation.md) |
| runtime-harness | MCP Sidecar | [mcp-sidecar](modules/runtime-harness/mcp-sidecar.md) |
| runtime-harness | Task Agent Host | [task-agent-host](modules/runtime-harness/task-agent-host.md) |
| runtime-harness | PM Dispatch Boundary | [pm-dispatch](modules/runtime-harness/pm-dispatch.md) |
| runtime-harness | Agent Runtime Effects | [agent-runtime-effects](modules/runtime-harness/agent-runtime-effects.md) |
| runtime-harness | Evidence Ledger | [evidence-ledger](modules/runtime-harness/evidence-ledger.md) |
| runtime-harness | Pipeline Observer Ledger | [pipeline-ledger](modules/runtime-harness/pipeline-ledger.md) |
| runtime-harness | Operator Board | [operator](modules/runtime-harness/operator.md) |
| runtime-harness | Refactor Recommendations | [refactor-program](modules/runtime-harness/refactor-program.md) |
| runtime-harness | Engineer Bindings | [engineer-bindings](modules/runtime-harness/engineer-bindings.md) |
| runtime-harness | Engineer Messages | [engineer-messages](modules/runtime-harness/engineer-messages.md) |
| runtime-harness | Engineer Scheduling | [engineer-scheduling](modules/runtime-harness/engineer-scheduling.md) |
| runtime-harness | Engineering Overlay | [engineering-overlay](modules/runtime-harness/engineering-overlay.md) |
| runtime-harness | Bound Task Freezes | [bound-task-freezes](modules/runtime-harness/bound-task-freezes.md) |
| runtime-harness | Read-only Delegated Runs | [delegated-runs](modules/runtime-harness/delegated-runs.md) |
| runtime-harness | Collaboration Substrate | [collaboration](modules/runtime-harness/collaboration.md) |
| runtime-harness | Work Demand Intake | [work-demand](modules/runtime-harness/work-demand.md) |
| runtime-harness | Interface Change Requests | [interface-change](modules/runtime-harness/interface-change.md) |
| runtime-harness | External Source Intake | [external-source-intake](modules/runtime-harness/external-source-intake.md) |
| runtime-harness | Verified Evidence Context | [verified-context](modules/runtime-harness/verified-context.md) |
| runtime-harness | Integration Product Acceptance | [integration-acceptance](modules/runtime-harness/integration-acceptance.md) |
| organization | Task Fleet | [task-fleet](modules/organization/task-fleet.md) |
| organization | PR Publication | [publication](modules/organization/publication.md) |
| runtime-mcp | General Repository Access | [general-repo-access](modules/runtime-mcp/general-repo-access.md) |
| runtime-mcp | ChatGPT Browser Consult | [chatgpt-browser](modules/runtime-mcp/chatgpt-browser.md) |
| verification | Evals And Checks | [evals-checks](modules/verification/evals-checks.md) |
| verification | Acceptance Review | [acceptance-review](modules/verification/acceptance-review.md) |
| verification | CodeGraph Readiness | [codegraph-readiness](modules/verification/codegraph-readiness.md) |

Reading rules:

- One capability has exactly one module page at `modules/<domain>/<capability>.md`.
- Fact priority: current source > model > documents. When a page conflicts with `src/`, `scripts/` or `assets/`, the source wins. Update the model and the projection in the same pull request.
- The prefix authority is the capability source that `.ai/harness/policy.json#context.capability_source` selects. In this repository it is `.archcontext/model/nodes/*.yaml`.

## Umbrella Hierarchy

```text
Project
  -> architecture domain
     -> capability
        -> component
        -> capability contract block
        -> workstream ledger
        -> current todo slice
        -> source plan
```

- Architecture owns stable truth: boundaries, snapshots, and embedded Mermaid source.
- The capability authority selected by `.ai/harness/policy.json#context.capability_source` owns declared capability prefixes and longest-prefix matching; this repo resolves from `.archcontext/model/nodes/*.yaml`.
- Component nodes split a capability by responsibility. The repo-harness registry reads capability nodes only.
- Local `AGENTS.md` / `CLAUDE.md` contract blocks own agent-facing context projection.
- `tasks/workstreams/<domain>/<capability>/` owns durable multi-session progress.
- `tasks/todos.md` owns deferred medium/long-term goals with tradeoff and revisit trigger; current execution slices stay in the active plan's `## Task Breakdown`.

## Architecture Update Flow

- Hooks do not record architecture drift. The pull request is the update unit.
- `scripts/capability-resolver.ts` resolves changed paths to capabilities with longest-prefix matching.
- When a change alters responsibilities, entrypoints, relations or flows, write the model change through an archctx ChangeSet and run `repo-harness architecture-projection apply --json` in the same branch.
- Read architecture documents on demand. Update real boundaries explicitly.
- `scripts/workstream-sync.sh` keeps durable multi-session progress under `tasks/workstreams/<domain>/<capability>/` and projects only pointers into local contracts.
- Semantic diagrams live as Mermaid fenced blocks in the relevant architecture module or snapshot Markdown.
- Mermaid fenced blocks are the only architecture diagram artifacts; agents must not generate standalone HTML.
- `mermaid` is an external authoring/review skill (`~/.codex/skills/mermaid`), not a production dependency or vendored architecture body.

## Request Archive

- `docs/architecture/requests/archive/` keeps the historical cards of the retired request queue.
- No new request cards are created.

## 2026-07-16 Closeout Runner Guardrails

- P1: helper dispatch and authoritative benchmark production are separate
  consumers of one neutral lifecycle/locking effects layer. Workflow helper
  policy remains in `src/effects/runtime/helper-runner.ts`; benchmark semantics
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

## 2026-09-12 root drift card resolved without an architecture change

- 漂移卡 `docs/architecture/requests/root.md`(high、workflow-surface、觸發檔
  `scripts/ensure-task-workflow.sh`、Detected 2026-09-12T13:35)歸檔為 Resolved。
- 該事件只是 helper 投影重寫:事件當下的 `scripts/ensure-task-workflow.sh` 與
  `origin/main` 的版本逐位元組相同,最後一次真實內容改動仍停在 `9563083c`。
  模組邊界、entrypoint、依賴規則、runtime path 與驗證命令都沒有動,所以不需要
  snapshot;卡片的 Contract Files 是 `none`,也沒有本地契約需要同步。

## Review Backlog

- Treat user-level `~/.codex/hooks.json` and `~/.claude/settings.json` as host adapters. The `repo-harness-hook` route registry is the hook implementation. Treat repo-local `.claude/settings.json` / `.codex/hooks.json` hook adapters as retired legacy config.
- Run `bun scripts/capability-resolver.ts validate --format text` when capability data changes. The workflow helper remains a read-only diagnostic.
- Path ownership under `capability_source: archcontext` comes from `archctx resolve` (`src/effects/capabilities/archcontext-owners.ts`). Node includes and excludes can use any shape that ArchContext validation accepts.
- Several capability pairs have declared relations in both directions (for example contract-assets and global-runtime-reconciliation). The module backlogs record each pair with its edge counts.

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.architecture.index" sourceDigest="sha256:cd0d3187198f3beec244f1d33964d353906234f23b0f909f9fce85221a0c2490" rendererVersion="archcontext.docs-renderer/v5" outputDigest="sha256:7493e84acdcb236f0ae94e21492b501de2978b0a5d4181f5b76364b2cba75d56" -->
# Architecture Index

Generated: 1970-01-01T00:00:00.000Z

## Entities

- [PR Publication](modules/organization/publication.md) — capability / active
- [Task Fleet](modules/organization/task-fleet.md) — capability / active
- [Action Commands](modules/public-surface/action-commands.md) — capability / active
- [Adoption](modules/public-surface/adoption.md) — capability / active
- [Root Router](modules/public-surface/root-router.md) — capability / active
- [Strategy Reflection](modules/public-surface/strategy-reflection.md) — capability / active
- [Agent Runtime Effects](modules/runtime-harness/agent-runtime-effects.md) — capability / active
- [Bound Task Freezes](modules/runtime-harness/bound-task-freezes.md) — capability / active
- [Collaboration Substrate](modules/runtime-harness/collaboration.md) — capability / active
- [Read-only Delegated Runs](modules/runtime-harness/delegated-runs.md) — capability / active
- [Engineer Bindings](modules/runtime-harness/engineer-bindings.md) — capability / active
- [Engineer Messages](modules/runtime-harness/engineer-messages.md) — capability / active
- [Engineer Scheduling](modules/runtime-harness/engineer-scheduling.md) — capability / active
- [Engineering Overlay](modules/runtime-harness/engineering-overlay.md) — capability / active
- [Evidence Ledger](modules/runtime-harness/evidence-ledger.md) — capability / active
- [External Source Intake](modules/runtime-harness/external-source-intake.md) — capability / active
- [Global Runtime Reconciliation](modules/runtime-harness/global-runtime-reconciliation.md) — capability / active
- [Hook Adapters](modules/runtime-harness/hook-adapters.md) — capability / active
- [Integration Product Acceptance](modules/runtime-harness/integration-acceptance.md) — capability / active
- [Interface Change Requests](modules/runtime-harness/interface-change.md) — capability / active
- [MCP Sidecar](modules/runtime-harness/mcp-sidecar.md) — capability / active
- [Operator Board](modules/runtime-harness/operator.md) — capability / active
- [Pipeline Observer Ledger](modules/runtime-harness/pipeline-ledger.md) — capability / active
- [PM Dispatch Boundary](modules/runtime-harness/pm-dispatch.md) — capability / active
- [Refactor Recommendations](modules/runtime-harness/refactor-program.md) — capability / active
- [Task Agent Host](modules/runtime-harness/task-agent-host.md) — capability / active
- [Verified Evidence Context](modules/runtime-harness/verified-context.md) — capability / active
- [Work Demand Intake](modules/runtime-harness/work-demand.md) — capability / active
- [ChatGPT Browser Consult](modules/runtime-mcp/chatgpt-browser.md) — capability / active
- [General Repository Access](modules/runtime-mcp/general-repo-access.md) — capability / active
- [Acceptance Review](modules/verification/acceptance-review.md) — capability / active
- [CodeGraph Readiness](modules/verification/codegraph-readiness.md) — capability / active
- [Evals And Checks](modules/verification/evals-checks.md) — capability / active
- [Contract Assets](modules/workflow-engine/contract-assets.md) — capability / active
- [Execution Primitives](modules/workflow-engine/execution-primitives.md) — capability / active
- [Inspection And Migration](modules/workflow-engine/inspection-migration.md) — capability / active
- [Workflow State](modules/workflow-engine/workflow-state.md) — capability / active

## Relations

- capability.verification.acceptance-review -> capability.runtime-harness.hook-adapters — calls
- capability.verification.acceptance-review -> component.acceptance-review.primary — calls
- component.acceptance-review.primary -> capability.runtime-harness.evidence-ledger — calls
- component.acceptance-review.primary -> capability.workflow-engine.execution-primitives — calls
- component.acceptance-review.primary -> capability.runtime-harness.task-agent-host — calls
- component.acceptance-review.primary -> capability.workflow-engine.workflow-state — reads
- capability.public-surface.action-commands -> component.action-commands.primary — calls
- component.action-commands.primary -> component.action-commands.bundled-skills — depends-on
- capability.public-surface.action-commands -> component.action-commands.skill-surface-catalog — calls
- component.action-commands.skill-surface-catalog -> component.action-commands.primary — reads
- capability.public-surface.adoption -> component.adoption.primary — calls
- capability.runtime-harness.agent-runtime-effects -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.agent-runtime-effects -> capability.runtime-harness.engineer-messages — calls
- capability.runtime-harness.agent-runtime-effects -> capability.runtime-harness.engineer-scheduling — calls
- capability.runtime-harness.agent-runtime-effects -> component.agent-runtime-effects.journal — calls
- component.agent-runtime-effects.journal -> capability.workflow-engine.execution-primitives — calls
- component.agent-runtime-effects.journal -> capability.workflow-engine.workflow-state — reads
- capability.runtime-harness.agent-runtime-effects -> capability.runtime-harness.mcp-sidecar — calls
- capability.runtime-harness.agent-runtime-effects -> capability.runtime-harness.task-agent-host — calls
- capability.runtime-harness.bound-task-freezes -> capability.verification.acceptance-review — reads
- capability.runtime-harness.bound-task-freezes -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.bound-task-freezes -> capability.runtime-harness.evidence-ledger — calls
- capability.runtime-harness.bound-task-freezes -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.bound-task-freezes -> component.bound-task-freezes.primary — calls
- capability.runtime-harness.bound-task-freezes -> capability.workflow-engine.workflow-state — calls
- capability.runtime-mcp.chatgpt-browser -> component.chatgpt-browser.primary — calls
- capability.verification.codegraph-readiness -> component.codegraph-readiness.primary — calls
- capability.runtime-harness.collaboration -> capability.runtime-harness.bound-task-freezes — calls
- capability.runtime-harness.collaboration -> capability.runtime-harness.delegated-runs — calls
- capability.runtime-harness.collaboration -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.collaboration -> capability.runtime-harness.engineer-scheduling — calls
- capability.runtime-harness.collaboration -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.collaboration -> component.collaboration.primary — calls
- component.contract-assets.contract-worktree-lifecycle -> capability.verification.acceptance-review — calls
- component.contract-assets.contract-worktree-lifecycle -> capability.workflow-engine.execution-primitives — calls
- component.contract-assets.contract-worktree-lifecycle -> capability.runtime-harness.task-agent-host — calls
- component.contract-assets.contract-worktree-lifecycle -> capability.workflow-engine.workflow-state — calls
- capability.workflow-engine.contract-assets -> component.contract-assets.planning-helpers — calls
- component.contract-assets.planning-helpers -> capability.verification.acceptance-review — calls
- component.contract-assets.planning-helpers -> capability.workflow-engine.execution-primitives — calls
- capability.workflow-engine.contract-assets -> component.contract-assets.primary — calls
- component.contract-assets.primary -> component.contract-assets.capability-registry — reads
- capability.workflow-engine.contract-assets -> component.contract-assets.template-projection — calls
- component.contract-assets.template-projection -> capability.public-surface.adoption — calls
- component.contract-assets.template-projection -> capability.verification.codegraph-readiness — calls
- component.contract-assets.template-projection -> capability.workflow-engine.execution-primitives — calls
- component.contract-assets.template-projection -> capability.runtime-harness.global-runtime-reconciliation — calls
- component.contract-assets.template-projection -> capability.runtime-harness.hook-adapters — calls
- component.contract-assets.template-projection -> component.contract-assets.planning-helpers — calls
- component.contract-assets.template-projection -> component.contract-assets.primary — reads
- component.contract-assets.template-projection -> component.action-commands.skill-surface-catalog — calls
- component.contract-assets.template-projection -> capability.runtime-harness.task-agent-host — calls
- component.contract-assets.template-projection -> capability.workflow-engine.workflow-state — calls
- capability.runtime-harness.delegated-runs -> capability.runtime-harness.collaboration — calls
- capability.runtime-harness.delegated-runs -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.delegated-runs -> capability.runtime-harness.evidence-ledger — writes
- capability.runtime-harness.delegated-runs -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.delegated-runs -> component.delegated-runs.primary — calls
- capability.runtime-harness.delegated-runs -> capability.organization.task-fleet — depends-on
- capability.runtime-harness.engineer-bindings -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.engineer-bindings -> component.engineer-bindings.primary — calls
- capability.runtime-harness.engineer-bindings -> capability.workflow-engine.workflow-state — calls
- capability.runtime-harness.engineer-messages -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.engineer-messages -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.engineer-messages -> component.engineer-messages.primary — calls
- capability.runtime-harness.engineer-scheduling -> capability.verification.acceptance-review — calls
- capability.runtime-harness.engineer-scheduling -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.engineer-scheduling -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.engineer-scheduling -> capability.runtime-harness.integration-acceptance — reads
- capability.runtime-harness.engineer-scheduling -> component.engineer-scheduling.primary — calls
- capability.runtime-harness.engineer-scheduling -> capability.organization.publication — reads
- capability.runtime-harness.engineer-scheduling -> capability.organization.task-fleet — calls
- capability.runtime-harness.engineer-scheduling -> capability.workflow-engine.workflow-state — reads
- capability.runtime-harness.engineering-overlay -> capability.runtime-harness.agent-runtime-effects — calls
- capability.runtime-harness.engineering-overlay -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.engineering-overlay -> capability.runtime-harness.engineer-messages — calls
- capability.runtime-harness.engineering-overlay -> component.engineering-overlay.primary — calls
- component.evals-checks.ci-selection -> capability.workflow-engine.inspection-migration — calls
- component.evals-checks.ci-selection -> component.evals-checks.test-suite — calls
- component.evals-checks.ci-selection -> component.evals-checks.workflow-gates — calls
- component.evals-checks.evals-and-benchmarks -> capability.workflow-engine.execution-primitives — calls
- component.evals-checks.evals-and-benchmarks -> capability.runtime-harness.hook-adapters — reads
- capability.verification.evals-checks -> component.evals-checks.primary — calls
- component.evals-checks.primary -> capability.workflow-engine.contract-assets — calls
- component.evals-checks.primary -> capability.runtime-harness.evidence-ledger — calls
- capability.runtime-harness.evidence-ledger -> capability.public-surface.adoption — calls
- capability.runtime-harness.evidence-ledger -> component.evidence-ledger.primary — calls
- component.evidence-ledger.primary -> capability.workflow-engine.execution-primitives — calls
- capability.workflow-engine.execution-primitives -> component.execution-primitives.primary — calls
- capability.runtime-harness.external-source-intake -> component.external-source-intake.immutable-evidence — calls
- component.external-source-intake.immutable-evidence -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.external-source-intake -> capability.runtime-harness.mcp-sidecar — calls
- capability.runtime-harness.external-source-intake -> capability.workflow-engine.workflow-state — reads
- capability.runtime-mcp.general-repo-access -> component.general-repo-access.primary — calls
- component.general-repo-access.primary -> capability.verification.codegraph-readiness — calls
- component.general-repo-access.primary -> component.mcp-sidecar.repo-policy-registry — calls
- component.global-runtime-reconciliation.archctx-closure -> capability.verification.acceptance-review — calls
- component.global-runtime-reconciliation.archctx-closure -> capability.runtime-harness.evidence-ledger — calls
- component.global-runtime-reconciliation.archctx-closure -> capability.workflow-engine.execution-primitives — calls
- component.global-runtime-reconciliation.archctx-closure -> capability.runtime-harness.hook-adapters — calls
- component.global-runtime-reconciliation.archctx-closure -> capability.runtime-harness.mcp-sidecar — calls
- component.global-runtime-reconciliation.archctx-closure -> capability.workflow-engine.workflow-state — reads
- component.global-runtime-reconciliation.cli-root -> capability.verification.acceptance-review — calls
- component.global-runtime-reconciliation.cli-root -> capability.public-surface.adoption — calls
- component.global-runtime-reconciliation.cli-root -> component.global-runtime-reconciliation.archctx-closure — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-mcp.chatgpt-browser — calls
- component.global-runtime-reconciliation.cli-root -> capability.verification.codegraph-readiness — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.collaboration — calls
- component.global-runtime-reconciliation.cli-root -> capability.workflow-engine.contract-assets — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.delegated-runs — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.engineer-bindings — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.external-source-intake — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.hook-adapters — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.integration-acceptance — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.interface-change — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.mcp-sidecar — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.operator — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.pipeline-ledger — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.pm-dispatch — calls
- component.global-runtime-reconciliation.cli-root -> component.global-runtime-reconciliation.primary — calls
- component.global-runtime-reconciliation.cli-root -> capability.organization.publication — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.refactor-program — calls
- component.global-runtime-reconciliation.cli-root -> capability.public-surface.root-router — calls
- component.global-runtime-reconciliation.cli-root -> component.action-commands.skill-surface-catalog — calls
- component.global-runtime-reconciliation.cli-root -> capability.public-surface.strategy-reflection — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.task-agent-host — calls
- component.global-runtime-reconciliation.cli-root -> capability.organization.task-fleet — calls
- component.global-runtime-reconciliation.cli-root -> capability.runtime-harness.verified-context — calls
- component.global-runtime-reconciliation.cli-root -> capability.workflow-engine.workflow-state — calls
- capability.runtime-harness.global-runtime-reconciliation -> component.global-runtime-reconciliation.primary — calls
- component.global-runtime-reconciliation.primary -> capability.public-surface.adoption — calls
- component.global-runtime-reconciliation.primary -> component.global-runtime-reconciliation.archctx-closure — calls
- component.global-runtime-reconciliation.primary -> capability.verification.codegraph-readiness — calls
- component.global-runtime-reconciliation.primary -> capability.workflow-engine.contract-assets — calls
- component.global-runtime-reconciliation.primary -> capability.workflow-engine.execution-primitives — calls
- component.global-runtime-reconciliation.primary -> capability.runtime-harness.hook-adapters — calls
- component.global-runtime-reconciliation.primary -> component.action-commands.skill-surface-catalog — calls
- component.global-runtime-reconciliation.primary -> capability.runtime-harness.task-agent-host — calls
- component.global-runtime-reconciliation.release-packaging -> component.global-runtime-reconciliation.cli-root — calls
- component.global-runtime-reconciliation.release-packaging -> capability.workflow-engine.execution-primitives — calls
- component.global-runtime-reconciliation.release-packaging -> component.action-commands.skill-surface-catalog — calls
- component.hook-adapters.edit-guards -> capability.runtime-harness.evidence-ledger — calls
- component.hook-adapters.edit-guards -> capability.workflow-engine.execution-primitives — calls
- component.hook-adapters.edit-guards -> component.hook-adapters.primary — depends-on
- component.hook-adapters.edit-guards -> capability.workflow-engine.workflow-state — calls
- component.hook-adapters.host-installer -> capability.public-surface.adoption — calls
- component.hook-adapters.host-installer -> capability.workflow-engine.contract-assets — calls
- component.hook-adapters.host-installer -> capability.workflow-engine.execution-primitives — calls
- component.hook-adapters.host-installer -> capability.runtime-harness.global-runtime-reconciliation — calls
- component.hook-adapters.host-installer -> component.hook-adapters.primary — calls
- component.hook-adapters.host-installer -> component.action-commands.skill-surface-catalog — calls
- capability.runtime-harness.hook-adapters -> component.hook-adapters.primary — calls
- component.hook-adapters.primary -> capability.workflow-engine.execution-primitives — calls
- component.hook-adapters.primary -> capability.workflow-engine.workflow-state — calls
- component.hook-adapters.primary -> component.hook-adapters.edit-guards — calls
- component.hook-adapters.primary -> capability.runtime-harness.global-runtime-reconciliation — calls
- component.hook-adapters.primary -> component.hook-adapters.session-lifecycle — calls
- component.hook-adapters.session-lifecycle -> capability.public-surface.adoption — calls
- component.hook-adapters.session-lifecycle -> component.hook-adapters.edit-guards — calls
- component.hook-adapters.session-lifecycle -> capability.runtime-harness.evidence-ledger — calls
- component.hook-adapters.session-lifecycle -> capability.workflow-engine.execution-primitives — calls
- component.hook-adapters.session-lifecycle -> component.hook-adapters.primary — depends-on
- component.hook-adapters.session-lifecycle -> capability.organization.task-fleet — calls
- component.hook-adapters.session-lifecycle -> capability.workflow-engine.workflow-state — calls
- capability.workflow-engine.inspection-migration -> component.inspection-migration.primary — calls
- component.inspection-migration.primary -> capability.workflow-engine.contract-assets — reads
- capability.runtime-harness.integration-acceptance -> component.integration-acceptance.primary — calls
- component.integration-acceptance.primary -> capability.verification.acceptance-review — calls
- component.integration-acceptance.primary -> capability.workflow-engine.execution-primitives — calls
- component.integration-acceptance.primary -> capability.workflow-engine.workflow-state — reads
- capability.runtime-harness.integration-acceptance -> capability.organization.publication — reads
- capability.runtime-harness.interface-change -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.interface-change -> capability.runtime-harness.engineer-scheduling — calls
- capability.runtime-harness.interface-change -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.interface-change -> component.interface-change.primary — calls
- capability.runtime-harness.interface-change -> capability.workflow-engine.workflow-state — reads
- capability.runtime-harness.mcp-sidecar -> capability.runtime-harness.agent-runtime-effects — calls
- component.mcp-sidecar.coding-profile -> capability.verification.codegraph-readiness — calls
- component.mcp-sidecar.coding-profile -> capability.workflow-engine.execution-primitives — calls
- component.mcp-sidecar.coding-profile -> component.mcp-sidecar.repo-policy-registry — calls
- component.mcp-sidecar.coding-profile -> capability.runtime-harness.task-agent-host — calls
- component.mcp-sidecar.coding-profile -> capability.workflow-engine.workflow-state — calls
- capability.runtime-harness.mcp-sidecar -> capability.runtime-harness.collaboration — calls
- capability.runtime-harness.mcp-sidecar -> capability.runtime-harness.engineer-messages — calls
- capability.runtime-harness.mcp-sidecar -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.mcp-sidecar -> capability.runtime-harness.engineer-scheduling — calls
- component.mcp-sidecar.host-setup -> capability.runtime-mcp.chatgpt-browser — calls
- component.mcp-sidecar.host-setup -> component.mcp-sidecar.coding-profile — calls
- component.mcp-sidecar.host-setup -> capability.workflow-engine.execution-primitives — calls
- component.mcp-sidecar.host-setup -> capability.runtime-harness.hook-adapters — calls
- component.mcp-sidecar.host-setup -> component.mcp-sidecar.primary — calls
- component.mcp-sidecar.host-setup -> component.mcp-sidecar.repo-policy-registry — writes
- component.mcp-sidecar.host-setup -> component.mcp-sidecar.transport-auth — calls
- capability.runtime-harness.mcp-sidecar -> capability.runtime-harness.interface-change — calls
- capability.runtime-harness.mcp-sidecar -> component.mcp-sidecar.primary — calls
- component.mcp-sidecar.primary -> capability.runtime-mcp.chatgpt-browser — calls
- component.mcp-sidecar.primary -> capability.verification.codegraph-readiness — calls
- component.mcp-sidecar.primary -> component.mcp-sidecar.coding-profile — calls
- component.mcp-sidecar.primary -> capability.workflow-engine.execution-primitives — calls
- component.mcp-sidecar.primary -> capability.runtime-mcp.general-repo-access — calls
- component.mcp-sidecar.primary -> capability.runtime-harness.pm-dispatch — calls
- component.mcp-sidecar.primary -> capability.organization.publication — calls
- component.mcp-sidecar.primary -> component.mcp-sidecar.repo-policy-registry — calls
- component.mcp-sidecar.primary -> capability.runtime-harness.task-agent-host — calls
- component.mcp-sidecar.primary -> capability.organization.task-fleet — calls
- component.mcp-sidecar.primary -> capability.runtime-harness.work-demand — calls
- component.mcp-sidecar.primary -> capability.workflow-engine.workflow-state — reads
- component.mcp-sidecar.repo-policy-registry -> capability.workflow-engine.execution-primitives — calls
- component.mcp-sidecar.transport-auth -> component.mcp-sidecar.primary — calls
- component.mcp-sidecar.transport-auth -> component.mcp-sidecar.repo-policy-registry — reads
- component.operator.activity-feeds -> capability.runtime-harness.hook-adapters — reads
- component.operator.activity-feeds -> capability.runtime-harness.pipeline-ledger — reads
- component.operator.activity-feeds -> capability.runtime-harness.verified-context — reads
- component.operator.activity-feeds -> component.operator.view-projections — calls
- component.operator.architecture-view -> capability.verification.acceptance-review — calls
- component.operator.architecture-view -> capability.runtime-harness.global-runtime-reconciliation — reads
- component.operator.primary -> capability.verification.acceptance-review — calls
- component.operator.primary -> component.operator.activity-feeds — calls
- component.operator.primary -> component.operator.architecture-view — calls
- component.operator.primary -> capability.runtime-harness.collaboration — calls
- component.operator.primary -> capability.runtime-harness.engineer-scheduling — reads
- component.operator.primary -> capability.runtime-harness.engineering-overlay — reads
- component.operator.primary -> capability.runtime-harness.global-runtime-reconciliation — reads
- component.operator.primary -> capability.runtime-harness.mcp-sidecar — reads
- component.operator.primary -> capability.runtime-harness.verified-context — reads
- component.operator.primary -> component.operator.view-projections — calls
- capability.runtime-harness.operator -> component.operator.primary — calls
- component.operator.primary -> capability.runtime-harness.pipeline-ledger — reads
- component.operator.primary -> capability.organization.task-fleet — reads
- component.operator.view-projections -> capability.verification.acceptance-review — depends-on
- component.operator.view-projections -> component.operator.architecture-view — depends-on
- component.operator.view-projections -> capability.runtime-harness.collaboration — depends-on
- component.operator.view-projections -> capability.organization.task-fleet — reads
- component.operator.web-console -> component.operator.activity-feeds — calls
- component.operator.web-console -> component.operator.primary — calls
- component.operator.web-console -> capability.runtime-harness.pipeline-ledger — reads
- component.operator.web-console -> component.operator.view-projections — calls
- capability.runtime-harness.pipeline-ledger -> capability.runtime-harness.evidence-ledger — calls
- capability.runtime-harness.pipeline-ledger -> component.pipeline-ledger.primary — calls
- capability.runtime-harness.pipeline-ledger -> capability.runtime-harness.task-agent-host — calls
- capability.runtime-harness.pm-dispatch -> capability.runtime-harness.evidence-ledger — calls
- capability.runtime-harness.pm-dispatch -> component.pm-dispatch.primary — calls
- component.pm-dispatch.primary -> capability.workflow-engine.execution-primitives — calls
- component.pm-dispatch.primary -> capability.workflow-engine.workflow-state — calls
- capability.runtime-harness.pm-dispatch -> component.mcp-sidecar.repo-policy-registry — reads
- capability.runtime-harness.pm-dispatch -> capability.runtime-harness.task-agent-host — calls
- capability.runtime-harness.pm-dispatch -> capability.organization.task-fleet — reads
- capability.organization.publication -> capability.workflow-engine.contract-assets — calls
- capability.organization.publication -> capability.runtime-harness.evidence-ledger — calls
- capability.organization.publication -> component.publication.primary — calls
- component.publication.primary -> capability.workflow-engine.execution-primitives — calls
- component.publication.primary -> capability.workflow-engine.workflow-state — calls
- component.publication.provider-feedback -> capability.workflow-engine.execution-primitives — calls
- component.publication.provider-feedback -> component.publication.primary — calls
- component.publication.provider-feedback -> capability.workflow-engine.workflow-state — calls
- capability.runtime-harness.refactor-program -> component.refactor-program.archctx-provider — calls
- component.refactor-program.archctx-provider -> capability.runtime-harness.evidence-ledger — calls
- component.refactor-program.archctx-provider -> capability.runtime-harness.global-runtime-reconciliation — calls
- capability.runtime-harness.refactor-program -> capability.runtime-harness.mcp-sidecar — calls
- capability.public-surface.root-router -> component.root-router.primary — calls
- capability.public-surface.strategy-reflection -> component.strategy-reflection.primary — calls
- component.strategy-reflection.primary -> component.action-commands.skill-surface-catalog — calls
- component.strategy-reflection.primary -> capability.workflow-engine.workflow-state — reads
- capability.runtime-harness.task-agent-host -> capability.runtime-harness.evidence-ledger — calls
- capability.runtime-harness.task-agent-host -> component.task-agent-host.primary — calls
- component.task-agent-host.primary -> capability.workflow-engine.execution-primitives — calls
- capability.organization.task-fleet -> capability.runtime-harness.agent-runtime-effects — calls
- capability.organization.task-fleet -> capability.workflow-engine.contract-assets — calls
- capability.organization.task-fleet -> capability.runtime-harness.engineer-bindings — calls
- capability.organization.task-fleet -> capability.runtime-harness.engineer-messages — calls
- capability.organization.task-fleet -> capability.runtime-harness.evidence-ledger — calls
- capability.organization.task-fleet -> component.task-fleet.primary — calls
- component.task-fleet.primary -> capability.workflow-engine.execution-primitives — calls
- component.task-fleet.primary -> component.task-fleet.task-inbox — calls
- component.task-fleet.primary -> capability.workflow-engine.workflow-state — reads
- capability.organization.task-fleet -> capability.organization.publication — calls
- capability.organization.task-fleet -> component.mcp-sidecar.repo-policy-registry — reads
- component.task-fleet.task-inbox -> capability.workflow-engine.execution-primitives — calls
- component.task-fleet.task-inbox -> capability.workflow-engine.workflow-state — calls
- capability.runtime-harness.verified-context -> capability.runtime-harness.delegated-runs — calls
- capability.runtime-harness.verified-context -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.verified-context -> capability.runtime-harness.engineer-messages — calls
- capability.runtime-harness.verified-context -> component.verified-context.primary — calls
- component.verified-context.primary -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.work-demand -> capability.runtime-harness.engineer-bindings — calls
- capability.runtime-harness.work-demand -> capability.runtime-harness.engineer-scheduling — calls
- capability.runtime-harness.work-demand -> capability.workflow-engine.execution-primitives — calls
- capability.runtime-harness.work-demand -> component.work-demand.primary — calls
- capability.runtime-harness.work-demand -> capability.workflow-engine.workflow-state — writes
- component.workflow-state.continuation-ledger -> capability.runtime-harness.evidence-ledger — calls
- component.workflow-state.continuation-ledger -> capability.workflow-engine.execution-primitives — calls
- component.workflow-state.continuation-ledger -> component.workflow-state.primary — calls
- capability.workflow-engine.workflow-state -> component.workflow-state.coordination-plane — calls
- component.workflow-state.coordination-plane -> component.workflow-state.continuation-ledger — calls
- component.workflow-state.coordination-plane -> capability.runtime-harness.evidence-ledger — calls
- component.workflow-state.coordination-plane -> capability.workflow-engine.execution-primitives — calls
- component.workflow-state.coordination-plane -> component.workflow-state.primary — calls
- component.workflow-state.coordination-plane -> capability.runtime-harness.task-agent-host — reads
- capability.workflow-engine.workflow-state -> component.workflow-state.primary — calls
- component.workflow-state.primary -> capability.workflow-engine.contract-assets — calls
- component.workflow-state.primary -> capability.runtime-harness.evidence-ledger — calls
- component.workflow-state.primary -> capability.workflow-engine.execution-primitives — calls

## Projections

- [Mermaid](diagrams/architecture.mmd)
- [Structurizr JSON](diagrams/architecture.structurizr.json)
- [LikeC4](diagrams/architecture.likec4)
- [Decision index](decisions/index.md)
- [Architecture changelog](changelog.md)
<!-- END ARCHCONTEXT:generated target="projection_target.architecture.index" -->
