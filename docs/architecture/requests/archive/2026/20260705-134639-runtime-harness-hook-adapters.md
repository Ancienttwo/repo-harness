# Architecture Queue Card: runtime-harness-hook-adapters

> **Status**: No architecture change
> **Detected**: 2026-07-05T13:44:57+0800
> **Updated**: 2026-07-05T13:45:11+0800
> **Severity**: high
> **Change Type**: workflow-surface
> **File**: `assets/hooks/codex-delegation-advisor.sh`
> **Functional Block**: `assets/hooks`
> **Capability ID**: `runtime-harness-hook-adapters`
> **Matched Prefix**: `assets/hooks`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `hook-adapters`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/hook-adapters.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/hook-adapters`
> **Contract Files**: `assets/hooks/AGENTS.md`, `assets/hooks/CLAUDE.md`
> **Contract Sync Required**: true
> **Spawn Recommended**: true
> **Open Edits**: 1

## Required Follow-up

- Read root `AGENTS.md` / `CLAUDE.md`.
- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.
- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.
- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.
- When a visual explains the boundary better than prose, add or update a Mermaid fenced block in the relevant architecture module or snapshot Markdown first; that Markdown is the semantic source for LLM readers.
- When a human-readable rendering is useful, generate a matching `$mermaid` architecture HTML file under `docs/architecture/diagrams/` and link it back to the Markdown semantic source.
- Treat `mermaid` as an external installed skill dependency at `~/.codex/skills/mermaid`; do not copy, vendor, or inline its templates into this repo.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "assets/hooks" --request "docs/architecture/requests/runtime-harness-hook-adapters.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File |
| --- | --- | --- | --- |
| 2026-07-05T13:45:11+0800 | high | workflow-surface | `assets/hooks/codex-delegation-advisor.sh` |

## Event Fields

```json
{
  "ts": "2026-07-05T13:45:11+0800",
  "file_path": "assets/hooks/codex-delegation-advisor.sh",
  "severity": "high",
  "functional_block": "assets/hooks",
  "capability_id": "runtime-harness-hook-adapters",
  "matched_prefix": "assets/hooks",
  "architecture_domain": "runtime-harness",
  "architecture_capability": "hook-adapters",
  "architecture_module": "docs/architecture/modules/runtime-harness/hook-adapters.md",
  "workstream_dir": "tasks/workstreams/runtime-harness/hook-adapters",
  "contract_agents": "assets/hooks/AGENTS.md",
  "contract_claude": "assets/hooks/CLAUDE.md",
  "change_type": "workflow-surface",
  "request_file": "docs/architecture/requests/runtime-harness-hook-adapters.md",
  "spawn_recommended": true,
  "contract_sync_required": true
}
```

## Archive Resolution

- Status: No architecture change
- Archived: 2026-07-05T13:46:39+0800
- Artifacts: (none)
- Note: codex-delegation-advisor now reads policy delegation limits/runners and points delegation at the contract brief with non-silent runner degradation. Behavior refinement within existing hook-adapters boundary; no new entrypoint, dependency, or runtime path.
