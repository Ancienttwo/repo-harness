# Architecture Queue Card: workflow-engine-inspection-migration

> **Status**: Resolved
> **Detected**: 2026-09-04T07:42:25+0800
> **Updated**: 2026-09-04T07:42:25+0800
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
- When a visual materially improves the explanation, add an evidence-backed Mermaid fenced block to the architecture module or snapshot Markdown.
- Mermaid Markdown is the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only for authoring and review.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "scripts/lib" --request "docs/architecture/requests/workflow-engine-inspection-migration.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-09-04T07:42:25+0800 | high | workflow-surface | `scripts/lib/project-init-lib.sh` | `sha256:51c36504b41fd7fe0d81e39e2d9e964eff8e39346caf77344c050d3838e36263` |

## Event Fields

```json
{
  "ts": "2026-09-04T07:42:25+0800",
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
  "contract_sync_required": true,
  "event_key": "sha256:51c36504b41fd7fe0d81e39e2d9e964eff8e39346caf77344c050d3838e36263"
}
```

## Event Records

```json
[
  {
    "ts": "2026-09-04T07:42:25+0800",
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
    "contract_sync_required": true,
    "event_key": "sha256:51c36504b41fd7fe0d81e39e2d9e964eff8e39346caf77344c050d3838e36263"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-09-04T07:43:31+0800
- Artifacts:
- `docs/architecture/modules/workflow-engine/inspection-migration.md`
- Note: Generated policy template propagation accepted and projected.
