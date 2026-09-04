# Architecture Queue Card: runtime-harness-global-runtime-reconciliation

> **Status**: Resolved
> **Detected**: 2026-09-04T07:42:22+0800
> **Updated**: 2026-09-04T07:42:27+0800
> **Severity**: medium
> **Change Type**: source-change
> **File**: `src/effects/architecture/archctx-provider.ts`
> **Functional Block**: `src/effects/architecture`
> **Capability ID**: `runtime-harness-global-runtime-reconciliation`
> **Matched Prefix**: `src/effects/architecture`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `global-runtime-reconciliation`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/global-runtime-reconciliation`
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
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/effects/architecture" --request "docs/architecture/requests/runtime-harness-global-runtime-reconciliation.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-09-04T07:42:27+0800 | low | source-change | `src/effects/architecture/archctx-provider.ts` | `sha256:e35d9302a127ed3bb155625ff7200adcd3c86da423c8ab7d28afbfb1f7f7ab0b` |
| 2026-09-04T07:42:22+0800 | medium | boundary-or-config | `package.json` | `sha256:60d2436e3700de656967045b80a49829af2f0c39e98203b20d256d48c6ac7ccc` |

## Event Fields

```json
{
  "ts": "2026-09-04T07:42:27+0800",
  "file_path": "src/effects/architecture/archctx-provider.ts",
  "severity": "low",
  "functional_block": "src/effects/architecture",
  "capability_id": "runtime-harness-global-runtime-reconciliation",
  "matched_prefix": "src/effects/architecture",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "global-runtime-reconciliation",
  "architecture_module": "docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/global-runtime-reconciliation",
  "contract_agents": "AGENTS.md",
  "contract_claude": "CLAUDE.md",
  "change_type": "source-change",
  "request_file": "docs/architecture/requests/runtime-harness-global-runtime-reconciliation.md",
  "spawn_recommended": false,
  "contract_sync_required": false,
  "event_key": "sha256:e35d9302a127ed3bb155625ff7200adcd3c86da423c8ab7d28afbfb1f7f7ab0b"
}
```

## Event Records

```json
[
  {
    "ts": "2026-09-04T07:42:27+0800",
    "file_path": "src/effects/architecture/archctx-provider.ts",
    "severity": "low",
    "functional_block": "src/effects/architecture",
    "capability_id": "runtime-harness-global-runtime-reconciliation",
    "matched_prefix": "src/effects/architecture",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "global-runtime-reconciliation",
    "architecture_module": "docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/global-runtime-reconciliation",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "source-change",
    "request_file": "docs/architecture/requests/runtime-harness-global-runtime-reconciliation.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:e35d9302a127ed3bb155625ff7200adcd3c86da423c8ab7d28afbfb1f7f7ab0b"
  },
  {
    "ts": "2026-09-04T07:42:22+0800",
    "file_path": "package.json",
    "severity": "medium",
    "functional_block": "package.json",
    "capability_id": "runtime-harness-global-runtime-reconciliation",
    "matched_prefix": "package.json",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "global-runtime-reconciliation",
    "architecture_module": "docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/global-runtime-reconciliation",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "boundary-or-config",
    "request_file": "docs/architecture/requests/runtime-harness-global-runtime-reconciliation.md",
    "spawn_recommended": false,
    "contract_sync_required": true,
    "event_key": "sha256:60d2436e3700de656967045b80a49829af2f0c39e98203b20d256d48c6ac7ccc"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-09-04T07:43:29+0800
- Artifacts:
- `docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md`
- Note: Shared package-local ArchContext process boundary accepted and projected.
