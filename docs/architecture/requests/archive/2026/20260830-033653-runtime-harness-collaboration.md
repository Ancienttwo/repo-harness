# Architecture Queue Card: runtime-harness-collaboration

> **Status**: Resolved
> **Detected**: 2026-08-30T03:36:21+0800
> **Updated**: 2026-08-30T03:36:30+0800
> **Severity**: low
> **Change Type**: source-change
> **File**: `src/core/collaboration/adoption.ts`
> **Functional Block**: `src/core/collaboration`
> **Capability ID**: `runtime-harness-collaboration`
> **Matched Prefix**: `src/core/collaboration`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `collaboration`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/collaboration.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/collaboration`
> **Contract Files**: `AGENTS.md`, `CLAUDE.md`
> **Contract Sync Required**: false
> **Spawn Recommended**: false
> **Open Edits**: 7

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
| 2026-08-30T03:36:30+0800 | low | source-change | `src/core/collaboration/adoption.ts` | `sha256:77d65e28349a8e5b49d9965e7c679c0eb6ac6eb84a04a0f6f5a0caf82e9984c2` |
| 2026-08-30T03:36:30+0800 | low | source-change | `src/core/collaboration/handoff.ts` | `sha256:7bd0d165fe35d6d882f9799af1f0a523a74b4a0230ee718e907eff766d1aa1f6` |
| 2026-08-30T03:36:29+0800 | low | source-change | `src/effects/collaboration/adoption-store.ts` | `sha256:0c40dda090a716747bda1ea659627cc59c985a99753da165ec5cc62a149bb517` |
| 2026-08-30T03:36:29+0800 | low | source-change | `src/effects/collaboration/handoff-store.ts` | `sha256:6e4bae7ffa1ab3a5943d95cd4b2d77998e9af9c673b6838447e03af732903c3e` |
| 2026-08-30T03:36:29+0800 | low | source-change | `src/effects/collaboration/signal-store.ts` | `sha256:19d31b30adeccef6ae0f34b8832ed9169cf1c2d9cf4e9ea33064c14c7c3190ad` |
| 2026-08-30T03:36:28+0800 | low | source-change | `src/effects/collaboration/actor.ts` | `sha256:9f11b055d053a2e2acd918666a314bcbf73da87d5f54f87983b96bacb6ce56a6` |
| 2026-08-30T03:36:21+0800 | low | source-change | `src/effects/collaboration/record-store.ts` | `sha256:1b79fbc84c6829b423646244ce0a3c316693275dc84e8276eec471ff2355b3e3` |

## Event Fields

```json
{
  "ts": "2026-08-30T03:36:30+0800",
  "file_path": "src/core/collaboration/adoption.ts",
  "severity": "low",
  "functional_block": "src/core/collaboration",
  "capability_id": "runtime-harness-collaboration",
  "matched_prefix": "src/core/collaboration",
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
  "event_key": "sha256:77d65e28349a8e5b49d9965e7c679c0eb6ac6eb84a04a0f6f5a0caf82e9984c2"
}
```

## Event Records

```json
[
  {
    "ts": "2026-08-30T03:36:30+0800",
    "file_path": "src/core/collaboration/adoption.ts",
    "severity": "low",
    "functional_block": "src/core/collaboration",
    "capability_id": "runtime-harness-collaboration",
    "matched_prefix": "src/core/collaboration",
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
    "event_key": "sha256:77d65e28349a8e5b49d9965e7c679c0eb6ac6eb84a04a0f6f5a0caf82e9984c2"
  },
  {
    "ts": "2026-08-30T03:36:30+0800",
    "file_path": "src/core/collaboration/handoff.ts",
    "severity": "low",
    "functional_block": "src/core/collaboration",
    "capability_id": "runtime-harness-collaboration",
    "matched_prefix": "src/core/collaboration",
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
    "event_key": "sha256:7bd0d165fe35d6d882f9799af1f0a523a74b4a0230ee718e907eff766d1aa1f6"
  },
  {
    "ts": "2026-08-30T03:36:29+0800",
    "file_path": "src/effects/collaboration/adoption-store.ts",
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
    "event_key": "sha256:0c40dda090a716747bda1ea659627cc59c985a99753da165ec5cc62a149bb517"
  },
  {
    "ts": "2026-08-30T03:36:29+0800",
    "file_path": "src/effects/collaboration/handoff-store.ts",
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
    "event_key": "sha256:6e4bae7ffa1ab3a5943d95cd4b2d77998e9af9c673b6838447e03af732903c3e"
  },
  {
    "ts": "2026-08-30T03:36:29+0800",
    "file_path": "src/effects/collaboration/signal-store.ts",
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
    "event_key": "sha256:19d31b30adeccef6ae0f34b8832ed9169cf1c2d9cf4e9ea33064c14c7c3190ad"
  },
  {
    "ts": "2026-08-30T03:36:28+0800",
    "file_path": "src/effects/collaboration/actor.ts",
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
    "event_key": "sha256:9f11b055d053a2e2acd918666a314bcbf73da87d5f54f87983b96bacb6ce56a6"
  },
  {
    "ts": "2026-08-30T03:36:21+0800",
    "file_path": "src/effects/collaboration/record-store.ts",
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
    "event_key": "sha256:1b79fbc84c6829b423646244ce0a3c316693275dc84e8276eec471ff2355b3e3"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-08-30T03:36:54+0800
- Artifacts:
- `.archcontext/model/nodes/capability.runtime-harness.collaboration.yaml`
- `docs/architecture/modules/runtime-harness/collaboration.md`
- `src/effects/collaboration/record-store.ts`
- `src/effects/collaboration/actor.ts`
- `tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md`
- Note: C3 extracts the durable create-once publish protocol and the server-side actor derivation out of signal-store.ts into record-store.ts and actor.ts, and adds the WorkStateHandoffV1 and HandoffAdoptionReceiptV1 record families on top of them. The capability boundary is unchanged: still one additive, non-authoritative plane holding zero Task, Lease, Publication or Acceptance authority, with the same source prefixes. What changed is inside it. The archcontext node's flow selectors named resolveModuleEngineerActor and readPersistedSignal, both of which the extraction moved out of signal-store.ts, so archctx classified the run unresolved-major-change with reasonCode verified-flow-proof-changed. The node was corrected to name the symbols that now exist (resolveCollaborationActor in actor.ts, readCollaborationRecord in record-store.ts) and extended with the shared durable-publish entrypoint plus the handoff-publish and handoff-adoption entrypoints, every selector re-anchored to a direct call edge verified with codegraph node. The old read selector proved readPersistedSignal -> canonicalCoordinationSignalBytes; that check is now reached through the record codec, which is an indirect call and unprovable, so it was replaced with readCollaborationRecord -> collaborationRecordPath, the 64-hex-before-join guard that protects the same property. The major change was approved by the orchestrator and accepted through the recorded C1 internal-API route.
