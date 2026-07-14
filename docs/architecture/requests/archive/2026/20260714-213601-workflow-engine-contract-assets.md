# Architecture Queue Card: workflow-engine-contract-assets

> **Status**: Resolved
> **Detected**: 2026-07-14T21:32:26+0800
> **Updated**: 2026-07-14T21:32:26+0800
> **Severity**: high
> **Change Type**: workflow-surface
> **File**: `assets/workflow-contract.v1.json`
> **Functional Block**: `assets/workflow-contract.v1.json`
> **Capability ID**: `workflow-engine-contract-assets`
> **Matched Prefix**: `assets/workflow-contract.v1.json`
> **Architecture Domain**: `workflow-engine`
> **Architecture Capability**: `contract-assets`
> **Architecture Module**: `docs/architecture/modules/workflow-engine/contract-assets.md`
> **Workstream Directory**: `tasks/workstreams/workflow-engine/contract-assets`
> **Contract Files**: `assets/AGENTS.md`, `assets/CLAUDE.md`
> **Contract Sync Required**: true
> **Spawn Recommended**: true
> **Open Edits**: 1

## Required Follow-up

- Read root `AGENTS.md` / `CLAUDE.md`.
- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.
- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.
- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.
- When a visual explains the boundary better than prose, add or update a Mermaid fenced block in the relevant architecture module or snapshot Markdown first; that Markdown is the semantic source for LLM readers.
- When a human-readable rendering is useful, generate a matching `$mermaid` architecture HTML file under `docs/architecture/diagrams/` and link it back to the Markdown semantic source.
- Treat `mermaid` as an external installed skill dependency at `~/.codex/skills/mermaid`; do not copy, vendor, or inline its templates into this repo.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "assets/workflow-contract.v1.json" --request "docs/architecture/requests/workflow-engine-contract-assets.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File |
| --- | --- | --- | --- |
| 2026-07-14T21:32:26+0800 | high | workflow-surface | `assets/workflow-contract.v1.json` |

## Event Fields

```json
{
  "ts": "2026-07-14T21:32:26+0800",
  "file_path": "assets/workflow-contract.v1.json",
  "severity": "high",
  "functional_block": "assets/workflow-contract.v1.json",
  "capability_id": "workflow-engine-contract-assets",
  "matched_prefix": "assets/workflow-contract.v1.json",
  "architecture_domain": "workflow-engine",
  "architecture_capability": "contract-assets",
  "architecture_module": "docs/architecture/modules/workflow-engine/contract-assets.md",
  "workstream_dir": "tasks/workstreams/workflow-engine/contract-assets",
  "contract_agents": "assets/AGENTS.md",
  "contract_claude": "assets/CLAUDE.md",
  "change_type": "workflow-surface",
  "request_file": "docs/architecture/requests/workflow-engine-contract-assets.md",
  "spawn_recommended": true,
  "contract_sync_required": true
}
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-07-14T21:36:01+0800
- Artifacts:
- `docs/architecture/modules/workflow-engine/contract-assets.md`
- Note: helpers.descriptions extended to 48 during origin/main rebase; module closeout updated
