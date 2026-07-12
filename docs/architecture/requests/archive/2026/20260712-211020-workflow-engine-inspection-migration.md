# Architecture Queue Card: workflow-engine-inspection-migration

> **Status**: Resolved
> **Detected**: 2026-07-12T21:08:59+0800
> **Updated**: 2026-07-12T21:08:59+0800
> **Severity**: high
> **Change Type**: workflow-surface
> **File**: `scripts/lib/project-init-lib.sh`
> **Functional Block**: `scripts/lib`
> **Capability ID**: `workflow-engine-inspection-migration`
> **Matched Prefix**: `scripts/lib`
> **Architecture Domain**: `workflow-engine`
> **Architecture Capability**: `inspection-migration`
> **Architecture Module**: `docs/architecture/modules/workflow-engine/inspection-migration.md`
> **Workstream Directory**: `tasks/workstreams/workflow-engine/inspection-migration`
> **Contract Files**: `scripts/AGENTS.md`, `scripts/CLAUDE.md`
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
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "scripts/lib" --request "docs/architecture/requests/workflow-engine-inspection-migration.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File |
| --- | --- | --- | --- |
| 2026-07-12T21:08:59+0800 | high | workflow-surface | `scripts/lib/project-init-lib.sh` |

## Event Fields

```json
{
  "ts": "2026-07-12T21:08:59+0800",
  "file_path": "scripts/lib/project-init-lib.sh",
  "severity": "high",
  "functional_block": "scripts/lib",
  "capability_id": "workflow-engine-inspection-migration",
  "matched_prefix": "scripts/lib",
  "architecture_domain": "workflow-engine",
  "architecture_capability": "inspection-migration",
  "architecture_module": "docs/architecture/modules/workflow-engine/inspection-migration.md",
  "workstream_dir": "tasks/workstreams/workflow-engine/inspection-migration",
  "contract_agents": "scripts/AGENTS.md",
  "contract_claude": "scripts/CLAUDE.md",
  "change_type": "workflow-surface",
  "request_file": "docs/architecture/requests/workflow-engine-inspection-migration.md",
  "spawn_recommended": true,
  "contract_sync_required": true
}
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-07-12T21:10:21+0800
- Artifacts:
- `docs/architecture/modules/workflow-engine/inspection-migration.md`
- Note: Policy generation and init now consume only external_tooling.agent_fleet and the packaged helper authority.
