# Architecture Queue Card: workflow-engine-contract-assets

> **Status**: Resolved
> **Detected**: 2026-09-04T07:42:19+0800
> **Updated**: 2026-09-04T07:42:19+0800
> **Severity**: high
> **Change Type**: workflow-surface
> **File**: `.ai/harness/policy.json`
> **Functional Block**: `.ai/harness/policy.json`
> **Capability ID**: `workflow-engine-contract-assets`
> **Matched Prefix**: `.ai/harness/policy.json`
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
- When a visual materially improves the explanation, add an evidence-backed Mermaid fenced block to the architecture module or snapshot Markdown.
- Mermaid Markdown is the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only for authoring and review.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block ".ai/harness/policy.json" --request "docs/architecture/requests/workflow-engine-contract-assets.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-09-04T07:42:19+0800 | high | workflow-surface | `.ai/harness/policy.json` | `sha256:a414d0f015ca1f5102a56025b69fd584dcfb5a2805c1d4239d2a21e3a6a5e408` |

## Event Fields

```json
{
  "ts": "2026-09-04T07:42:19+0800",
  "file_path": ".ai/harness/policy.json",
  "severity": "high",
  "functional_block": ".ai/harness/policy.json",
  "capability_id": "workflow-engine-contract-assets",
  "matched_prefix": ".ai/harness/policy.json",
  "architecture_domain": "workflow-engine",
  "architecture_capability": "contract-assets",
  "architecture_module": "docs/architecture/modules/workflow-engine/contract-assets.md",
  "workstream_dir": "tasks/workstreams/workflow-engine/contract-assets",
  "contract_agents": "assets/AGENTS.md",
  "contract_claude": "assets/CLAUDE.md",
  "change_type": "workflow-surface",
  "request_file": "docs/architecture/requests/workflow-engine-contract-assets.md",
  "spawn_recommended": true,
  "contract_sync_required": true,
  "event_key": "sha256:a414d0f015ca1f5102a56025b69fd584dcfb5a2805c1d4239d2a21e3a6a5e408"
}
```

## Event Records

```json
[
  {
    "ts": "2026-09-04T07:42:19+0800",
    "file_path": ".ai/harness/policy.json",
    "severity": "high",
    "functional_block": ".ai/harness/policy.json",
    "capability_id": "workflow-engine-contract-assets",
    "matched_prefix": ".ai/harness/policy.json",
    "architecture_domain": "workflow-engine",
    "architecture_capability": "contract-assets",
    "architecture_module": "docs/architecture/modules/workflow-engine/contract-assets.md",
    "workstream_dir": "tasks/workstreams/workflow-engine/contract-assets",
    "contract_agents": "assets/AGENTS.md",
    "contract_claude": "assets/CLAUDE.md",
    "change_type": "workflow-surface",
    "request_file": "docs/architecture/requests/workflow-engine-contract-assets.md",
    "spawn_recommended": true,
    "contract_sync_required": true,
    "event_key": "sha256:a414d0f015ca1f5102a56025b69fd584dcfb5a2805c1d4239d2a21e3a6a5e408"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-09-04T07:43:30+0800
- Artifacts:
- `docs/architecture/modules/workflow-engine/contract-assets.md`
- Note: Closed refactor policy schema and defaults accepted and projected.
