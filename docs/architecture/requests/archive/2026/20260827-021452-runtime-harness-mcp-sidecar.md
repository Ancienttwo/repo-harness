# Architecture Queue Card: runtime-harness-mcp-sidecar

> **Status**: Resolved
> **Detected**: 2026-08-27T02:13:48+0800
> **Updated**: 2026-08-27T02:13:48+0800
> **Severity**: low
> **Change Type**: source-change
> **File**: `src/cli/mcp/engineer-tools.ts`
> **Functional Block**: `src/cli/mcp`
> **Capability ID**: `runtime-harness-mcp-sidecar`
> **Matched Prefix**: `src/cli/mcp`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `mcp-sidecar`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/mcp-sidecar.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/mcp-sidecar`
> **Contract Files**: `AGENTS.md`, `CLAUDE.md`
> **Contract Sync Required**: false
> **Spawn Recommended**: false
> **Open Edits**: 1

## Required Follow-up

- Read root `AGENTS.md` / `CLAUDE.md`.
- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.
- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.
- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.
- When a visual materially improves the explanation, add an evidence-backed Mermaid fenced block to the architecture module or snapshot Markdown.
- Mermaid Markdown is the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only for authoring and review.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/cli/mcp" --request "docs/architecture/requests/runtime-harness-mcp-sidecar.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-08-27T02:13:48+0800 | low | source-change | `src/cli/mcp/engineer-tools.ts` | `sha256:6d7796d6398e833b949923eca9bbd0e240ac04c2330f4e244ab7f2e833216ba5` |

## Event Fields

```json
{
  "ts": "2026-08-27T02:13:48+0800",
  "file_path": "src/cli/mcp/engineer-tools.ts",
  "severity": "low",
  "functional_block": "src/cli/mcp",
  "capability_id": "runtime-harness-mcp-sidecar",
  "matched_prefix": "src/cli/mcp",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "mcp-sidecar",
  "architecture_module": "docs/architecture/modules/runtime-harness/mcp-sidecar.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/mcp-sidecar",
  "contract_agents": "AGENTS.md",
  "contract_claude": "CLAUDE.md",
  "change_type": "source-change",
  "request_file": "docs/architecture/requests/runtime-harness-mcp-sidecar.md",
  "spawn_recommended": false,
  "contract_sync_required": false,
  "event_key": "sha256:6d7796d6398e833b949923eca9bbd0e240ac04c2330f4e244ab7f2e833216ba5"
}
```

## Event Records

```json
[
  {
    "ts": "2026-08-27T02:13:48+0800",
    "file_path": "src/cli/mcp/engineer-tools.ts",
    "severity": "low",
    "functional_block": "src/cli/mcp",
    "capability_id": "runtime-harness-mcp-sidecar",
    "matched_prefix": "src/cli/mcp",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "mcp-sidecar",
    "architecture_module": "docs/architecture/modules/runtime-harness/mcp-sidecar.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/mcp-sidecar",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-mcp-sidecar.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:6d7796d6398e833b949923eca9bbd0e240ac04c2330f4e244ab7f2e833216ba5"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-08-27T02:14:53+0800
- Artifacts:
- `docs/architecture/modules/runtime-harness/mcp-sidecar.md`
- Note: ME-4B authenticated Engineer MCP verbs and the interface-change relation are represented by the accepted ArchContext projection.
