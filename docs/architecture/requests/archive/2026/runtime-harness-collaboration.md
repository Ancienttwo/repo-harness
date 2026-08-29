# Architecture Queue Card: runtime-harness-collaboration

> **Status**: Resolved
> **Detected**: 2026-08-29T19:13:23+0800
> **Updated**: 2026-08-29T19:13:23+0800
> **Severity**: medium
> **Change Type**: boundary-or-config
> **File**: `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`
> **Functional Block**: `src/core/collaboration`
> **Capability ID**: `runtime-harness-collaboration`
> **Matched Prefix**: `src/core/collaboration`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `collaboration`
> **Architecture Module**: `docs/architecture/domains/runtime-harness.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/collaboration`
> **Contract Files**: `none`, `none`
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
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/core/collaboration" --request "docs/architecture/requests/runtime-harness-collaboration.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-08-29T19:13:23+0800 | medium | boundary-or-config | `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md` | `sha256:7c100f7fb3d4c9682a11d1ea117eeaa5d930c9e26f4543345e706e66d7028b04` |

## Event Fields

```json
{
  "ts": "2026-08-29T19:13:23+0800",
  "file_path": "docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md",
  "severity": "medium",
  "functional_block": "src/core/collaboration",
  "capability_id": "runtime-harness-collaboration",
  "matched_prefix": "src/core/collaboration",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "collaboration",
  "architecture_module": "docs/architecture/domains/runtime-harness.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/collaboration",
  "contract_agents": "",
  "contract_claude": "",
  "change_type": "boundary-or-config",
  "request_file": "docs/architecture/requests/runtime-harness-collaboration.md",
  "spawn_recommended": false,
  "contract_sync_required": false,
  "event_key": "sha256:7c100f7fb3d4c9682a11d1ea117eeaa5d930c9e26f4543345e706e66d7028b04"
}
```

## Event Records

```json
[
  {
    "ts": "2026-08-29T19:13:23+0800",
    "file_path": "docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md",
    "severity": "medium",
    "functional_block": "src/core/collaboration",
    "capability_id": "runtime-harness-collaboration",
    "matched_prefix": "src/core/collaboration",
    "architecture_domain": "runtime-harness",
    "architecture_capability": "collaboration",
    "architecture_module": "docs/architecture/domains/runtime-harness.md",
    "workstream_dir": "tasks/workstreams/runtime-harness/collaboration",
    "contract_agents": "",
    "contract_claude": "",
    "change_type": "boundary-or-config",
    "request_file": "docs/architecture/requests/runtime-harness-collaboration.md",
    "spawn_recommended": false,
    "contract_sync_required": false,
    "event_key": "sha256:7c100f7fb3d4c9682a11d1ea117eeaa5d930c9e26f4543345e706e66d7028b04"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-08-29T19:13:33+0800
- Artifacts:
- `docs/architecture/domains/runtime-harness.md`
- `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`
- `tests/unit/collaboration-authority-baseline.test.ts`
- Note: C0 accepts capability.runtime-harness.collaboration as an additive, non-authoritative plane: zero Task/Lease/Publication/Acceptance writes, DELEGATION_PROTOCOL unbumped, collaboration provenance carried by an additive CollaborationRunContextBinding. Frozen decisions D1-D12 and the C0-C9 slice ledger live in the research artifact. Architecture Module points at the runtime-harness domain doc because the capability has no module yet: an archcontext node needs entrypoint path+symbol anchors and capability prefixes that exist, and docs/architecture/modules plus tasks/workstreams reject files that no declared capability owns (scripts/capability-resolver.ts:306,326). C1 registers the node with the first real src/core/collaboration source, at which point ArchContext projects the capability module, the domain listing gains its row, and repo-harness run workstream-sync ensure creates the durable ledger. C0 changes no runtime source.
