# Architecture Queue Card: verification-evals-checks

> **Status**: Resolved
> **Detected**: 2026-09-01T12:44:54+0800
> **Updated**: 2026-09-01T12:44:54+0800
> **Severity**: high
> **Change Type**: workflow-surface
> **File**: `scripts/check-task-workflow.sh`
> **Functional Block**: `scripts/check-task-workflow.sh`
> **Capability ID**: `verification-evals-checks`
> **Matched Prefix**: `scripts/check-task-workflow.sh`
> **Architecture Domain**: `verification`
> **Architecture Capability**: `evals-checks`
> **Architecture Module**: `docs/architecture/modules/verification/evals-checks.md`
> **Workstream Directory**: `tasks/workstreams/verification/evals-checks`
> **Contract Files**: `AGENTS.md`, `CLAUDE.md`
> **Contract Sync Required**: true
> **Spawn Recommended**: true
> **Open Edits**: 1

## Required Follow-up

- Read root `AGENTS.md` / `CLAUDE.md`.
- If functional block is not `root`, read its local `AGENTS.md` / `CLAUDE.md`.
- Decide whether this change affects module boundaries, entrypoints, dependency rules, runtime paths, or verification commands.
- For substantial changes, write a snapshot under `docs/architecture/snapshots/`.
- When a visual materially improves the explanation, add an evidence-backed Mermaid fenced block to the architecture module or snapshot Markdown.
- Mermaid Markdown is the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only for authoring and review.
- If this starts or advances durable execution, run `repo-harness run workstream-sync ensure --block "scripts/check-task-workflow.sh" --request "docs/architecture/requests/verification-evals-checks.md"`.
- After the snapshot or diagram is produced, run `repo-harness run context-contract-sync sync-latest` so the local architecture contract block links to the latest artifacts.

## Touched Files

| Last Event | Severity | Change Type | File | Event Key |
| --- | --- | --- | --- | --- |
| 2026-09-01T12:44:54+0800 | high | workflow-surface | `scripts/check-task-workflow.sh` | `sha256:ae59b09bd97973bf29a4b2cde3b5ffca5d944ffaf0be0c1a93b91756852ee026` |

## Event Fields

```json
{
  "ts": "2026-09-01T12:44:54+0800",
  "file_path": "scripts/check-task-workflow.sh",
  "severity": "high",
  "functional_block": "scripts/check-task-workflow.sh",
  "capability_id": "verification-evals-checks",
  "matched_prefix": "scripts/check-task-workflow.sh",
  "architecture_domain": "verification",
  "architecture_capability": "evals-checks",
  "architecture_module": "docs/architecture/modules/verification/evals-checks.md",
  "workstream_dir": "tasks/workstreams/verification/evals-checks",
  "contract_agents": "AGENTS.md",
  "contract_claude": "CLAUDE.md",
  "change_type": "workflow-surface",
  "request_file": "docs/architecture/requests/verification-evals-checks.md",
  "spawn_recommended": true,
  "contract_sync_required": true,
  "event_key": "sha256:ae59b09bd97973bf29a4b2cde3b5ffca5d944ffaf0be0c1a93b91756852ee026"
}
```

## Event Records

```json
[
  {
    "ts": "2026-09-01T12:44:54+0800",
    "file_path": "scripts/check-task-workflow.sh",
    "severity": "high",
    "functional_block": "scripts/check-task-workflow.sh",
    "capability_id": "verification-evals-checks",
    "matched_prefix": "scripts/check-task-workflow.sh",
    "architecture_domain": "verification",
    "architecture_capability": "evals-checks",
    "architecture_module": "docs/architecture/modules/verification/evals-checks.md",
    "workstream_dir": "tasks/workstreams/verification/evals-checks",
    "contract_agents": "AGENTS.md",
    "contract_claude": "CLAUDE.md",
    "change_type": "workflow-surface",
    "request_file": "docs/architecture/requests/verification-evals-checks.md",
    "spawn_recommended": true,
    "contract_sync_required": true,
    "event_key": "sha256:ae59b09bd97973bf29a4b2cde3b5ffca5d944ffaf0be0c1a93b91756852ee026"
  }
]
```

## Archive Resolution

- Status: Resolved
- Archived: 2026-09-01T12:46:43+0800
- Artifacts:
- `docs/architecture/modules/verification/evals-checks.md`
- `plans/plan-20260901-1119-close-265-review-gaps.md`
- Note: Boundary unchanged; existing verification capability now documents exact final-diff digest binding as the workflow evidence invariant.
