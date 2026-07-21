# Architecture Queue Card: runtime-harness-hook-adapters

> **Status**: Pending
> **Detected**: 2026-07-21T21:39:18+0800
> **Updated**: 2026-07-21T21:39:22+0800
> **Severity**: high
> **Change Type**: workflow-surface
> **File**: `src/cli/hook/prompt-intents.ts`
> **Functional Block**: `src/cli/hook`
> **Capability ID**: `runtime-harness-hook-adapters`
> **Matched Prefix**: `src/cli/hook`
> **Architecture Domain**: `runtime-harness`
> **Architecture Capability**: `hook-adapters`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/hook-adapters.md`
> **Workstream Directory**: `tasks/workstreams/runtime-harness/hook-adapters`
> **Contract Files**: `assets/hooks/AGENTS.md`, `assets/hooks/CLAUDE.md`
> **Contract Sync Required**: true
> **Spawn Recommended**: true
> **Open Edits**: 2

## Required Follow-up

- Read root `AGENTS.md` / `CLAUDE.md`.
- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.
- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.
- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.
- When a visual explains the boundary better than prose, add or update a Mermaid fenced block in the relevant architecture module or snapshot Markdown first; that Markdown is the semantic source for LLM readers.
- When a human-readable rendering is useful, generate a matching `$mermaid` architecture HTML file under `docs/architecture/diagrams/` and link it back to the Markdown semantic source.
- Treat `mermaid` as an external installed skill dependency at `~/.codex/skills/mermaid`; do not copy, vendor, or inline its templates into this repo.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "src/cli/hook" --request "docs/architecture/requests/runtime-harness-hook-adapters.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File |
| --- | --- | --- | --- |
| 2026-07-21T21:39:22+0800 | high | workflow-surface | `src/cli/hook/prompt-intents.ts` |
| 2026-07-21T21:39:18+0800 | high | workflow-surface | `src/cli/hook/prompt-handler.ts` |

## Event Fields

```json
{
  "ts": "2026-07-21T21:39:22+0800",
  "file_path": "src/cli/hook/prompt-intents.ts",
  "severity": "high",
  "functional_block": "src/cli/hook",
  "capability_id": "runtime-harness-hook-adapters",
  "matched_prefix": "src/cli/hook",
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
