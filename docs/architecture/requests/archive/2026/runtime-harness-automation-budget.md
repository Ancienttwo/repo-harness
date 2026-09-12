# Architecture Queue Card: runtime-harness-automation-budget

> **Status**: Resolved
> **Detected**: 2026-09-08T05:10:09+0800
> **Updated**: 2026-09-08T05:10:12+0800
> **Severity**: low
> **Change Type**: source-change
> **File**: `src/effects/automation/campaign-capability-registry.ts`
> **Functional Block**: `src/effects/automation`
> **Capability ID**: `runtime-harness-automation-budget`
> **Matched Prefix**: `src/effects/automation`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `automation-budget`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/automation-budget.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/automation-budget`
> **Contract Files**: `AGENTS.md`, `CLAUDE.md`
> **Contract Sync Required**: false
> **Spawn Recommended**: false
> **Open Edits**: 3

## Required Follow-up

- Read root `AGENTS.md` / `CLAUDE.md`.
- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.
- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.
- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.
- When a visual materially improves the explanation, add an evidence-backed Mermaid fenced block to the architecture module or snapshot Markdown.
- Mermaid Markdown is the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only for authoring and review.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/effects/automation" --request "docs/architecture/requests/runtime-harness-automation-budget.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-09-08T05:10:12+0800 | low | source-change | `src/effects/automation/campaign-capability-registry.ts` | `sha256:3dbf5d3bbae05c0ba58cf02458b7d8b8ddc1ee1bc299c99d946849037b02febf` |
| 2026-09-08T05:10:11+0800 | low | source-change | `src/effects/automation/budget-store.ts` | `sha256:64946c36b32d2579dc732b5c0d3c8c5a7f08ecf441e1be52e8ab69d7474f7b45` |
| 2026-09-08T05:10:09+0800 | low | source-change | `src/core/automation/budget.ts` | `sha256:01f2df382bf6a80f4cbbd24f1fae29d864da35d6668eeeead50d2d319bf32f29` |

## Event Fields

```json
{
  "ts": "2026-09-08T05:10:12+0800",
  "file_path": "src/effects/automation/campaign-capability-registry.ts",
  "severity": "low",
  "functional_block": "src/effects/automation",
  "capability_id": "runtime-harness-automation-budget",
  "matched_prefix": "src/effects/automation",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "automation-budget",
  "architecture_module": "docs/architecture/modules/runtime-harness/automation-budget.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/automation-budget",
  "contract_agents": "AGENTS.md",
  "contract_claude": "CLAUDE.md",
  "change_type": "source-change",
  "request_file": "docs/architecture/requests/runtime-harness-automation-budget.md",
  "spawn_recommended": false,
  "contract_sync_required": false,
  "event_key": "sha256:3dbf5d3bbae05c0ba58cf02458b7d8b8ddc1ee1bc299c99d946849037b02febf"
}
```

## Event Records

```json
[
  {
    "ts": "2026-09-08T05:10:12+0800",
    "file_path": "src/effects/automation/campaign-capability-registry.ts",
    "severity": "low",
    "functional_block": "src/effects/automation",
    "capability_id": "runtime-harness-automation-budget",
    "matched_prefix": "src/effects/automation",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "automation-budget",
    "architecture_module": "docs/architecture/modules/runtime-harness/automation-budget.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/automation-budget",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-automation-budget.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:3dbf5d3bbae05c0ba58cf02458b7d8b8ddc1ee1bc299c99d946849037b02febf"
  },
  {
    "ts": "2026-09-08T05:10:11+0800",
    "file_path": "src/effects/automation/budget-store.ts",
    "severity": "low",
    "functional_block": "src/effects/automation",
    "capability_id": "runtime-harness-automation-budget",
    "matched_prefix": "src/effects/automation",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "automation-budget",
    "architecture_module": "docs/architecture/modules/runtime-harness/automation-budget.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/automation-budget",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-automation-budget.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:64946c36b32d2579dc732b5c0d3c8c5a7f08ecf441e1be52e8ab69d7474f7b45"
  },
  {
    "ts": "2026-09-08T05:10:09+0800",
    "file_path": "src/core/automation/budget.ts",
    "severity": "low",
    "functional_block": "src/core/automation",
    "capability_id": "runtime-harness-automation-budget",
    "matched_prefix": "src/core/automation",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "automation-budget",
    "architecture_module": "docs/architecture/modules/runtime-harness/automation-budget.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/automation-budget",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-automation-budget.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:01f2df382bf6a80f4cbbd24f1fae29d864da35d6668eeeead50d2d319bf32f29"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-09-12T14:25:21+0800
- Artifacts:
- `docs/architecture/modules/runtime-harness/automation-budget.md`
- Note: Touched files stayed inside the declared src/core/automation and src/effects/automation prefixes; the capability node and module doc were reprojected afterwards by 9cc12bac (PR #395).
