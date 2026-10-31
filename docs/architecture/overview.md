# Architecture Overview

`repo-harness` is a repo-local workflow harness CLI and skill with an optional
local MCP sidecar. It is not a hosted product runtime, agent gateway, or database
service. It inspects a target repository, installs or refreshes a file-backed
workflow contract, routes public command skills, exposes explicitly configured
local MCP capabilities, and verifies that generated repo-local surfaces stay
consistent. Product intent and non-goals are in [the product spec](../spec.md).

The product has two layers that share one set of files (`README.md`, "Two
Layers"):

- **Session contract.** One human, one agent session, one issue. A skill routes
  the work. The GitHub issue and PR own task identity, claim, status and
  dependency; the PR and CI carry change, verification and risk.
- **Bot-scheduled programs.** The Bot drives the repo-harness CLI and Herdr task
  agents. repo-harness supplies the tools and the evidence. The Bot decides what
  runs next.

## Architecture surfaces

- Model: `.archcontext/model/{nodes,relations,flows}/` owns boundaries, entry
  points, relations and flows. Change it through an archctx ChangeSet.
- Capability pages: `docs/architecture/modules/<domain>/<capability>.md`. The
  `repo-harness/v1` projection renders one page per capability. Text inside
  `ARCHCONTEXT:generated` markers is generated; the text outside the markers is
  human-owned.
- Runtime topology: `docs/architecture/runtime-topology.md` and
  `docs/architecture/diagrams/runtime-topology.mmd`, when the model declares
  topology nodes.
- Human map: `docs/architecture/archimap.html`.
- Decisions: `docs/adr/`. Projection manifest:
  `docs/architecture/.projection-manifest.json`.

The archctx rolling writer publishes generated regions, diagram exports and the
projection manifest after merge. Workers commit only the model and human prose.

## Authority and State Map

Each datum has one authority. Every other representation is a projection.

| Datum | Authority (store) | Owner capability | Projections and readers |
| --- | --- | --- | --- |
| Workflow contract | `assets/workflow-contract.v1.json`; the repo opt-in marker `.ai/harness/workflow-contract.json` | contract-assets | Templates, helper copies and reference configs are byte projections. |
| Architecture model | `.archcontext/model/{nodes,relations,flows}/`, written through archctx ChangeSets | contract-assets (files); global-runtime-reconciliation runs the projection | Generated regions in `docs/architecture/**`. `repo-harness module` and the operator read the committed HEAD snapshot (`src/effects/architecture/model-reader.ts`). |
| Capability ownership | Policy-selected source: archcontext model or registry | contract-assets | Archcontext mode uses package-local `archctx resolve`; registry mode uses local longest-prefix matching. Components and parent chains participate in archcontext ownership. |
| Product intent | `docs/prds/` and the parent issue | repo-harness-product drafts; repo-harness-issue-flow splits work | The child issue body carries requirement, scope, boundaries, dependencies and acceptance. |
| Current task identity, claim, status and dependency | GitHub issue and PR | Human/Bot decisions | Issue comments carry claim, status, handoff and decisions. No local task file holds these facts; CI carries proof. |
| State content and published version | `state_revision` identifies resolved content; `state resolve` alone allocates shared `state_version` | workflow-state | Read-only hooks and MCP can return a version allocated for a different revision. |
| Historical coordination | Persisted Sprint rows, owner records and claim tokens | none | No reader parses Sprint rows, owner records or claim tokens. Retirement does not delete historical bytes. |
| Current execution admission | Protected approval under the OS account gates root, current provider goal and exact session/claim selection | acceptance-review; task-agent-host binds execution | `effects/admission/` and `effects/sessions/` reobserve authority. A board or native host attribution record cannot grant it. |
| Task mutex | `<git-common-dir>/repo-harness/coordination/v1/locks/tasks/<64hex>.lock` | execution-primitives | Inbox and feedback retain the same physical lock path through `effects/locking/task-lock.ts`. |
| Task messages | Admitted records below `<git-common-dir>/repo-harness/task-inbox/v2` | task-fleet | Exact admission SHA and claim reference/revision fence delivery. Session context renders messages as untrusted data; historical records remain separate. |
| Publication | Provider PR state on GitHub. Stored bytes under `<git-common-dir>/repo-harness/publications/v1` have no reader or writer. | publication | No code reads publication receipts. Current PR readiness observes canonical provider identity, expected head/base, checks and reviews, then reobserves identity. |
| Acceptance | `~/.repo-harness/gates/<sha256(worktree root realpath)>/acceptance.latest.json`, and immutable receipt records at `acceptance-receipts/<digest>.json` in the same directory | acceptance-review | Acceptance review validates exact subject and verification evidence; Effective State has no acceptance projection. Each later review replaces `acceptance.latest.json`. A record keeps one receipt's exact bytes under its digest. Dependency authority and product acceptance read the record by digest. |
| Harness evidence | `.ai/harness/evidence/events/log.jsonl` and `.ai/harness/evidence/blobs` | evidence-ledger | Handoff and resume recovery views. |
| Engineer contracts | Tracked `agents/engineers/**`. Stored bindings under `<git-common-dir>/repo-harness/engineers/v1` have no reader or writer. | engineer-bindings | Current scheduling joins explicitly selected profile revisions to admitted sessions. It does not infer engineers from actors or historical bindings. |
| Task agent sessions | Herdr panes; records under `.ai/harness/runs/task-agents` and task worktrees under `.ai/harness/runs/task-workspaces` | task-agent-host | Shared session discovery and current context revalidate exact bindings. Native host attribution grants no authority; runtime state does not set issue status. |
| Repository registry | `~/.repo-harness/registered-repos.json` | mcp-sidecar | Provider fleet and operator observations use its exact repository scope. |
| Global configuration | `~/.repo-harness/config.json` | global-runtime-reconciliation | Projection policy (`src/effects/architecture/projection-config.ts`). |
| Merge | The provider and the user | none | repo-harness never merges. |

Storage roots, sharing scope, locks and retention of these stores are described
in the owning capability page and
[the agentic development flow](../reference-configs/agentic-development-flow.md).

## Architecture update flow

- Hooks do not record architecture drift. The pull request is the update unit.
- When a change alters responsibilities, entrypoints, relations or flows, write
  the model change through an archctx ChangeSet and commit only the model and
  human prose. Do not run projection apply in a feature branch.
- Read architecture documents on demand. Update real boundaries explicitly.
- Fact priority: current source > model > documents. When a page conflicts with
  `src/`, `scripts/` or `assets/`, the source wins.
- `repo-harness run capability-resolver` routes through the policy-selected
  resolver. A provider failure is not permission to fall back to registry
  matching.
- Semantic diagrams live as Mermaid fenced blocks in the relevant capability
  page. Agents do not generate standalone HTML; the human map belongs to
  `repo-harness-archimap`. The external `mermaid` skill reviews layout and
  renderability only.
