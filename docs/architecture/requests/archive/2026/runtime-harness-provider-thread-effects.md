# Architecture Queue Card: runtime-harness-agent-runtime-effects

> **Status**: Resolved
> **Detected**: 2026-08-30T18:58:28+0800
> **Updated**: 2026-08-30T19:18:36+0800
> **Severity**: medium
> **Change Type**: boundary-accepted
> **File**: `.archcontext/model/nodes/capability.runtime-harness.agent-runtime-effects.yaml`
> **Functional Block**: `src/core/engineers/provider-thread-effect.ts`
> **Capability ID**: `runtime-harness-agent-runtime-effects`
> **Matched Prefix**: `src/core/engineers/provider-thread-effect.ts`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `agent-runtime-effects`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/agent-runtime-effects`
> **Contract Files**: `AGENTS.md`, `CLAUDE.md`
> **Contract Sync Required**: true
> **Spawn Recommended**: false
> **Open Edits**: 2

## Required Follow-up

- Read root `AGENTS.md` / `CLAUDE.md`.
- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.
- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.
- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.
- When a visual materially improves the explanation, add an evidence-backed Mermaid fenced block to the architecture module or snapshot Markdown.
- Mermaid Markdown is the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only for authoring and review.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/core/engineers/provider-thread-effect.ts" --request "docs/architecture/requests/runtime-harness-provider-thread-effects.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-08-30T19:18:36+0800 | medium | boundary-accepted | `.archcontext/model/nodes/capability.runtime-harness.agent-runtime-effects.yaml` | `sha256:8fae41efeb1ad6db8db1068f098c39c06c42f64794d1a3ddea39d2117c803cc5` |
| 2026-08-30T18:58:28+0800 | medium | planned-boundary-change | `src/core/engineers/provider-thread-effect.ts` | `sha256:a1749dd04d6b635042083649ac3eae4a7fffc86e91aa069baf6d736e8938b6f3` |

## Event Fields

```json
{
  "ts": "2026-08-30T19:18:36+0800",
  "file_path": ".archcontext/model/nodes/capability.runtime-harness.agent-runtime-effects.yaml",
  "severity": "medium",
  "functional_block": "src/core/engineers/provider-thread-effect.ts",
  "capability_id": "runtime-harness-agent-runtime-effects",
  "matched_prefix": "src/core/engineers/provider-thread-effect.ts",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "agent-runtime-effects",
  "architecture_module": "docs/architecture/modules/runtime-harness/agent-runtime-effects.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/agent-runtime-effects",
  "contract_agents": "AGENTS.md",
  "contract_claude": "CLAUDE.md",
  "change_type": "boundary-accepted",
  "request_file": "docs/architecture/requests/runtime-harness-provider-thread-effects.md",
  "spawn_recommended": false,
  "contract_sync_required": true,
  "event_key": "sha256:8fae41efeb1ad6db8db1068f098c39c06c42f64794d1a3ddea39d2117c803cc5"
}
```

## Event Records

```json
[
  {
    "ts": "2026-08-30T19:18:36+0800",
    "file_path": ".archcontext/model/nodes/capability.runtime-harness.agent-runtime-effects.yaml",
    "severity": "medium",
    "functional_block": "src/core/engineers/provider-thread-effect.ts",
    "capability_id": "runtime-harness-agent-runtime-effects",
    "matched_prefix": "src/core/engineers/provider-thread-effect.ts",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "agent-runtime-effects",
    "architecture_module": "docs/architecture/modules/runtime-harness/agent-runtime-effects.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/agent-runtime-effects",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "boundary-accepted",
    "request_file": "docs/architecture/requests/runtime-harness-provider-thread-effects.md",
    "spawn_recommended": false,
    "contract_sync_required": true,
    "event_key": "sha256:8fae41efeb1ad6db8db1068f098c39c06c42f64794d1a3ddea39d2117c803cc5"
  },
  {
    "ts": "2026-08-30T18:58:28+0800",
    "file_path": "src/core/engineers/provider-thread-effect.ts",
    "severity": "medium",
    "functional_block": "src/core/engineers/provider-thread-effect.ts",
    "capability_id": "runtime-harness-provider-thread-effects",
    "matched_prefix": "src/core/engineers/provider-thread-effect.ts",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "provider-thread-effects",
    "architecture_module": "docs/architecture/modules/runtime-harness/provider-thread-effects.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/provider-thread-effects",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "planned-boundary-change",
    "request_file": "docs/architecture/requests/runtime-harness-provider-thread-effects.md",
    "spawn_recommended": false,
    "contract_sync_required": true,
    "event_key": "sha256:a1749dd04d6b635042083649ac3eae4a7fffc86e91aa069baf6d736e8938b6f3"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-08-30T19:20:00+0800
- Artifacts:
- `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
- `docs/architecture/snapshots/2026-08-30-agent-runtime-effects-boundary-acceptance.md`
- Note: Human-approved replacement of Provider Thread Effects by the provider-neutral Agent Runtime Effects architecture boundary; R1 implementation remains non-active.
