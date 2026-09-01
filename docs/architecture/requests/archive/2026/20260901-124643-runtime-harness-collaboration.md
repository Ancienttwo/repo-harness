# Architecture Queue Card: runtime-harness-collaboration

> **Status**: Resolved
> **Detected**: 2026-09-01T12:44:55+0800
> **Updated**: 2026-09-01T12:44:55+0800
> **Severity**: low
> **Change Type**: source-change
> **File**: `src/effects/collaboration/work-exchange.ts`
> **Functional Block**: `src/effects/collaboration`
> **Capability ID**: `runtime-harness-collaboration`
> **Matched Prefix**: `src/effects/collaboration`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `collaboration`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/collaboration.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/collaboration`
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
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/effects/collaboration" --request "docs/architecture/requests/runtime-harness-collaboration.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-09-01T12:44:55+0800 | low | source-change | `src/effects/collaboration/work-exchange.ts` | `sha256:69ab75b64e0e3b9f508d491831dd82e04ae20206729695312cf266d22edf1b16` |

## Event Fields

```json
{
  "ts": "2026-09-01T12:44:55+0800",
  "file_path": "src/effects/collaboration/work-exchange.ts",
  "severity": "low",
  "functional_block": "src/effects/collaboration",
  "capability_id": "runtime-harness-collaboration",
  "matched_prefix": "src/effects/collaboration",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "collaboration",
  "architecture_module": "docs/architecture/modules/runtime-harness/collaboration.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/collaboration",
  "contract_agents": "AGENTS.md",
  "contract_claude": "CLAUDE.md",
  "change_type": "source-change",
  "request_file": "docs/architecture/requests/runtime-harness-collaboration.md",
  "spawn_recommended": false,
  "contract_sync_required": false,
  "event_key": "sha256:69ab75b64e0e3b9f508d491831dd82e04ae20206729695312cf266d22edf1b16"
}
```

## Event Records

```json
[
  {
    "ts": "2026-09-01T12:44:55+0800",
    "file_path": "src/effects/collaboration/work-exchange.ts",
    "severity": "low",
    "functional_block": "src/effects/collaboration",
    "capability_id": "runtime-harness-collaboration",
    "matched_prefix": "src/effects/collaboration",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "collaboration",
    "architecture_module": "docs/architecture/modules/runtime-harness/collaboration.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/collaboration",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-collaboration.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:69ab75b64e0e3b9f508d491831dd82e04ae20206729695312cf266d22edf1b16"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-09-01T12:46:43+0800
- Artifacts:
- `.archcontext/model/nodes/capability.runtime-harness.collaboration.yaml`
- `.archcontext/model/flows/flow.collaboration.context-delivery.yaml`
- `docs/architecture/modules/runtime-harness/collaboration.md`
- Note: Accepted as changeset.docs-projection-4121ba806cbbf60a; collaboration mode now participates in the same overlapping double-read consistency fence.
