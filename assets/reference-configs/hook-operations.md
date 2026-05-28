# Hook Operations Reference

> Partially externalized: full troubleshooting runbook lives in default brain.

## Default Brain

- File vault: `icloud/brain/agentic-dev/runbooks/runbook-agentic-dev-hook-troubleshooting.md`
- gbrain slug: `runbooks/runbook-agentic-dev-hook-troubleshooting`

## Hook Authority Map

Start with the shortest truth path:

1. `.claude/settings.json` wires Claude events into the repo-local hook runner.
2. `.codex/hooks.json` wires Codex events into the same repo-local hook runner.
3. `.ai/hooks/run-hook.sh` resolves the repo root and dispatches the selected hook.
4. `.ai/hooks/*` is the shared implementation layer and the default place to edit.

If you are asking "which hook file should I edit?", default to `.ai/hooks/`.
After installing or refreshing `.codex/hooks.json`, open Codex Settings and
mark this repo hook as trusted; otherwise Codex will not execute it.

## Hook Failure Playbook

When a hook blocks work:

1. Read the terminal output first.
2. Read `.ai/harness/failures/latest.jsonl` for the durable failure record.
3. Read `.claude/.trace.jsonl` for surrounding tool activity and timing.
4. Use the external runbook for extended examples and historical failure modes.

Common guards:

- `PlanStatusGuard`: no active approved plan, or active plan is in the wrong state.
- `ContractGuard`: the approved plan has not been projected into contract/review/notes scaffolding.
- `ContractGuard`: completion was claimed without passing contract verification.
- `WorktreeGuard`: writes were attempted from the wrong worktree.

## Architecture Drift Hooks

Hook scope is detect, classify, record, and remind:

- `scripts/architecture-drift.sh` writes requests/events.
- `scripts/workstream-sync.sh` maintains durable capability workstreams.
- `scripts/context-contract-sync.sh` updates only controlled local agent-context blocks.

Agents, not hooks, author semantic snapshots and diagrams.

## Self-Host vs Generated Parity Contract

This repo has two hook surfaces on purpose:

- `assets/hooks/` defines what downstream generated repos receive.
- `.ai/hooks/` defines this self-hosted repo's current runtime behavior.
- `.claude/settings.json` and `.codex/hooks.json` are host adapters only.

Every hook change should state whether it affects `self-host`, `generated`, or
`both`. If behavior must stay aligned, update both surfaces in the same change.

## Verification Checklist

Run these after hook or workflow contract changes:

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bash scripts/migrate-project-template.sh --repo . --dry-run
```
