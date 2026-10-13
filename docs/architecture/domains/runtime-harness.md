# Architecture Domain: Runtime Harness

> **Source**: `repo-harness run capability-resolver`
> **Owner**: Host hook routes, the installed runtime, task agents, evidence and observation ledgers, the local MCP sidecar, and the Module Engineer organization.

## Purpose

The runtime harness gives Claude, Codex and Pi a file-backed workflow shell.
User-level host hooks call the `repo-harness-hook` binary. Its typed route
registry selects one in-process handler. Repo-local hook adapters are retired.
The package operator library is `assets/hooks/lib/workflow-state.sh`. This
source repository keeps no copy of it.

## Capabilities

The domain has 22 capabilities. They are grouped by theme.

### Host integration

- `runtime-harness-hook-adapters` -> `docs/architecture/modules/runtime-harness/hook-adapters.md`: installs and runs the typed Claude, Codex and Pi hook routes.
- `runtime-harness-global-runtime-reconciliation` -> `docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md`: reconciles the installed runtime, its ArchContext closure and profile-owned external tooling, and owns the CLI root.
- `runtime-harness-mcp-sidecar` -> `docs/architecture/modules/runtime-harness/mcp-sidecar.md`: serves the local MCP sidecar and its repository access policy.

### Task agents and dispatch

- `runtime-harness-task-agent-host` -> `docs/architecture/modules/runtime-harness/task-agent-host.md`: hosts persistent task agents in Herdr panes with role profiles, task worktrees and request-bound results.
- `runtime-harness-pm-dispatch` -> `docs/architecture/modules/runtime-harness/pm-dispatch.md`: gives shared task-level PM operations and a fixed coding host without task or result authority.
- `runtime-harness-agent-runtime-effects` -> `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`: records at-most-once Agent Runtime effects for the Herdr CLI Agent adapter.

### Evidence and observation

- `runtime-harness-evidence-ledger` -> `docs/architecture/modules/runtime-harness/evidence-ledger.md`: appends the per-worktree evidence log, stores blobs and checkpoints and builds recovery views.
- `runtime-harness-pipeline-ledger` -> `docs/architecture/modules/runtime-harness/pipeline-ledger.md`: records pipeline facts per task in one SQLite observer ledger.
- `runtime-harness-operator` -> `docs/architecture/modules/runtime-harness/operator.md`: serves local read-only HTTP views of registered repositories.
- `runtime-harness-refactor-program` -> `docs/architecture/modules/runtime-harness/refactor-program.md`: shows measured refactor suggestions and records the user decision.

### Module Engineer organization

- `runtime-harness-engineer-bindings` -> `docs/architecture/modules/runtime-harness/engineer-bindings.md`: defines Module Engineer contracts, Binding authority and Claim actor provenance.
- `runtime-harness-engineer-messages` -> `docs/architecture/modules/runtime-harness/engineer-messages.md`: persists Module Engineer messages and binding-fenced delivery state.
- `runtime-harness-engineer-scheduling` -> `docs/architecture/modules/runtime-harness/engineer-scheduling.md`: projects Work Package graphs into revision-fenced Engineer offers.
- `runtime-harness-engineering-overlay` -> `docs/architecture/modules/runtime-harness/engineering-overlay.md`: projects Engineer observations into read-only views.
- `runtime-harness-bound-task-freezes` -> `docs/architecture/modules/runtime-harness/bound-task-freezes.md`: freezes live Claim, Binding, WorkEnvelope and Git observations and refuses unsafe Session rotation.
- `runtime-harness-delegated-runs` -> `docs/architecture/modules/runtime-harness/delegated-runs.md`: admits one Role Profile and journals one read-only Codex CLI host action as untrusted evidence.
- `runtime-harness-collaboration` -> `docs/architecture/modules/runtime-harness/collaboration.md`: publishes append-only coordination signals and handoffs and reads them back as one Work Exchange snapshot.

### Work intake and product acceptance

- `runtime-harness-work-demand` -> `docs/architecture/modules/runtime-harness/work-demand.md`: stores Agent-originated work requests and materializes accepted ones into Sprint and Work Graph.
- `runtime-harness-interface-change` -> `docs/architecture/modules/runtime-harness/interface-change.md`: records revision-fenced cross-capability interface decisions.
- `runtime-harness-external-source-intake` -> `docs/architecture/modules/runtime-harness/external-source-intake.md`: keeps immutable external Issue evidence and its binding to one canonical task.
- `runtime-harness-verified-context` -> `docs/architecture/modules/runtime-harness/verified-context.md`: projects Contract constraints, verification checkpoints and Human decisions into one context packet.
- `runtime-harness-integration-acceptance` -> `docs/architecture/modules/runtime-harness/integration-acceptance.md`: binds requirements, publications, one Git candidate and the AcceptanceReceipt into product-acceptance projections.

## Stable Rules

- The `repo-harness-hook` typed route registry is the host adapter authority.
- User-level `~/.claude/settings.json` and `~/.codex/hooks.json` are the host adapter surfaces.
- Repo-local `.claude/settings.json` and `.codex/hooks.json` hook adapters are retired legacy config, not required contract files.
- Other repo-local `.codex/*` files are runtime residue unless promoted by an explicit contract change.
- Runtime files under `.ai/harness/checks`, `.ai/harness/handoff`, `.ai/harness/failures`, `.ai/harness/worktrees`, and `.ai/harness/runs` are ignored state, not durable deliverables.
- The MCP sidecar keeps planner/executor/orchestrator boundaries stable. Direct local coding exists only in the default-off, user-scoped `coding` profile with explicit repo grants and revision-bound OAuth.
- Observers stay read-only. The operator serves read-only views. The pipeline ledger never dispatches, merges or cleans. Refactor recommendations never execute a refactor.

## Verification Surface

- `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/workflow-contract.test.ts`
- `bash scripts/check-task-workflow.sh`
