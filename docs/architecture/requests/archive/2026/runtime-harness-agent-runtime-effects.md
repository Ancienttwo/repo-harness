# Architecture Queue Card: runtime-harness-agent-runtime-effects

> **Status**: Resolved
> **Detected**: 2026-08-30T20:31:21+0800
> **Updated**: 2026-08-30T20:31:22+0800
> **Severity**: low
> **Change Type**: source-change
> **File**: `src/effects/engineers/agent-runtime-adapters/tmux-cli-agent.ts`
> **Functional Block**: `src/effects/engineers/agent-runtime-adapters`
> **Capability ID**: `runtime-harness-agent-runtime-effects`
> **Matched Prefix**: `src/effects/engineers/agent-runtime-adapters`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `agent-runtime-effects`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/agent-runtime-effects`
> **Contract Files**: `AGENTS.md`, `CLAUDE.md`
> **Contract Sync Required**: false
> **Spawn Recommended**: false
> **Open Edits**: 2

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
| 2026-08-30T20:31:22+0800 | low | source-change | `src/effects/engineers/agent-runtime-adapters/tmux-cli-agent.ts` | `sha256:1f8719af5d9f295792b0a3559cf943e102cae28450bcd580de28efacdfa3909b` |
| 2026-08-30T20:31:21+0800 | low | source-change | `src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts` | `sha256:38f062704adf8cf5d9bd1f9ff3c71dbc19b14f3382ccc116af6ca06cd0e1250c` |

## Event Fields

```json
{
  "ts": "2026-08-30T20:31:22+0800",
  "file_path": "src/effects/engineers/agent-runtime-adapters/tmux-cli-agent.ts",
  "severity": "low",
  "functional_block": "src/effects/engineers/agent-runtime-adapters",
  "capability_id": "runtime-harness-agent-runtime-effects",
  "matched_prefix": "src/effects/engineers/agent-runtime-adapters",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "agent-runtime-effects",
  "architecture_module": "docs/architecture/modules/runtime-harness/agent-runtime-effects.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/agent-runtime-effects",
  "contract_agents": "AGENTS.md",
  "contract_claude": "CLAUDE.md",
  "change_type": "source-change",
  "request_file": "docs/architecture/requests/runtime-harness-agent-runtime-effects.md",
  "spawn_recommended": false,
  "contract_sync_required": false,
  "event_key": "sha256:1f8719af5d9f295792b0a3559cf943e102cae28450bcd580de28efacdfa3909b"
}
```

## Event Records

```json
[
  {
    "ts": "2026-08-30T20:31:22+0800",
    "file_path": "src/effects/engineers/agent-runtime-adapters/tmux-cli-agent.ts",
    "severity": "low",
    "functional_block": "src/effects/engineers/agent-runtime-adapters",
    "capability_id": "runtime-harness-agent-runtime-effects",
    "matched_prefix": "src/effects/engineers/agent-runtime-adapters",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "agent-runtime-effects",
    "architecture_module": "docs/architecture/modules/runtime-harness/agent-runtime-effects.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/agent-runtime-effects",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-agent-runtime-effects.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:1f8719af5d9f295792b0a3559cf943e102cae28450bcd580de28efacdfa3909b"
  },
  {
    "ts": "2026-08-30T20:31:21+0800",
    "file_path": "src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts",
    "severity": "low",
    "functional_block": "src/effects/engineers/agent-runtime-adapters",
    "capability_id": "runtime-harness-agent-runtime-effects",
    "matched_prefix": "src/effects/engineers/agent-runtime-adapters",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "agent-runtime-effects",
    "architecture_module": "docs/architecture/modules/runtime-harness/agent-runtime-effects.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/agent-runtime-effects",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-agent-runtime-effects.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:38f062704adf8cf5d9bd1f9ff3c71dbc19b14f3382ccc116af6ca06cd0e1250c"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-08-30T21:25:19+0800
- Artifacts:
- `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
- `docs/architecture/snapshots/2026-08-30-agent-runtime-effects-boundary-acceptance.md`
- Note: R1 adapter paths are covered by the accepted Agent Runtime Effects boundary and fixed-point projection receipt sha256:b416d52adc7b1ea07924cf14750c7dcc79a3ee8c6d238179e199de89e41d3f41.
