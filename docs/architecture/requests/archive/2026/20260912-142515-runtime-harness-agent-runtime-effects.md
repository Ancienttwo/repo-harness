# Architecture Queue Card: runtime-harness-agent-runtime-effects

> **Status**: Resolved
> **Detected**: 2026-09-09T02:02:06+0800
> **Updated**: 2026-09-09T02:02:06+0800
> **Severity**: low
> **Change Type**: source-change
> **File**: `src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts`
> **Functional Block**: `src/effects/engineers/agent-runtime-adapters`
> **Capability ID**: `runtime-harness-agent-runtime-effects`
> **Matched Prefix**: `src/effects/engineers/agent-runtime-adapters`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `agent-runtime-effects`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/agent-runtime-effects`
> **Contract Files**: `src/core/engineers/AGENTS.md`, `src/core/engineers/CLAUDE.md`
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
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/effects/engineers/agent-runtime-adapters" --request "docs/architecture/requests/runtime-harness-agent-runtime-effects.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-09-09T02:02:06+0800 | low | source-change | `src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts` | `sha256:1fd381f33708644cf386795634c92a0ab5e0a80cea26cf35b31bd01acc4437ac` |

## Event Fields

```json
{
  "ts": "2026-09-09T02:02:06+0800",
  "file_path": "src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts",
  "severity": "low",
  "functional_block": "src/effects/engineers/agent-runtime-adapters",
  "capability_id": "runtime-harness-agent-runtime-effects",
  "matched_prefix": "src/effects/engineers/agent-runtime-adapters",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "agent-runtime-effects",
  "architecture_module": "docs/architecture/modules/runtime-harness/agent-runtime-effects.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/agent-runtime-effects",
  "contract_agents": "src/core/engineers/AGENTS.md",
  "contract_claude": "src/core/engineers/CLAUDE.md",
  "change_type": "source-change",
  "request_file": "docs/architecture/requests/runtime-harness-agent-runtime-effects.md",
  "spawn_recommended": false,
  "contract_sync_required": false,
  "event_key": "sha256:1fd381f33708644cf386795634c92a0ab5e0a80cea26cf35b31bd01acc4437ac"
}
```

## Event Records

```json
[
  {
    "ts": "2026-09-09T02:02:06+0800",
    "file_path": "src/effects/engineers/agent-runtime-adapters/herdr-cli-agent.ts",
    "severity": "low",
    "functional_block": "src/effects/engineers/agent-runtime-adapters",
    "capability_id": "runtime-harness-agent-runtime-effects",
    "matched_prefix": "src/effects/engineers/agent-runtime-adapters",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "agent-runtime-effects",
    "architecture_module": "docs/architecture/modules/runtime-harness/agent-runtime-effects.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/agent-runtime-effects",
    "contract_agents": "src/core/engineers/AGENTS.md",
    "contract_claude": "src/core/engineers/CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-agent-runtime-effects.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:1fd381f33708644cf386795634c92a0ab5e0a80cea26cf35b31bd01acc4437ac"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-09-12T14:25:15+0800
- Artifacts:
- `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
- Note: Adapter swap already recorded by d8c082b1 in the capability node, module doc and local contracts; no boundary, entrypoint, dependency, runtime-path or verification change remains.
