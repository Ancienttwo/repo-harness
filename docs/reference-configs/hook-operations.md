# Hook Operations Reference

> Full troubleshooting runbook: `brain/repo-harness/runbooks/runbook-repo-harness-hook-troubleshooting.md` (`gbrain` slug `runbooks/runbook-repo-harness-hook-troubleshooting`).

## Hook Authority Map

Start with the shortest truth path:

1. `~/.claude/settings.json` and `~/.codex/hooks.json` wire host events into `repo-harness-hook`, with `repo-harness hook` as the compatibility fallback.
2. `repo-harness-hook` checks whether the current repo is opted in through `.ai/harness/workflow-contract.json`.
3. The route registry selects the ordered `.ai/hooks/*` scripts for that event and route.
4. `.ai/hooks/*` is the shared implementation layer and the default place to edit.

The installed CLI carries the route registry; migration copies `.ai/hooks/*` into each opted-in repo. Missing advisory scripts warn and skip, but required guard routes still fail closed. Refresh stale repos with `repo-harness update --repo <root>`.
Generated host adapter commands carry a 30 second timeout; long-running work belongs in explicit CLI commands, not hook foreground execution.

`UserPromptSubmit.default` dispatches to `.ai/hooks/prompt-guard.sh`. The shell layer parses host prompt JSON, reads workflow files, performs capture side effects, and renders host-safe output; it pipes `{"prompt": ...}` into `repo-harness-hook prompt-guard-decide`, which owns every prompt-text intent classifier (Unicode-aware, in `src/cli/hook/prompt-intents.ts`) plus the intent x state decision table and returns one verdict JSON line (action, intent facts, derived strings). If the engine is unreachable or predates the protocol, the prompt layer degrades to a one-shot advisory instead of guessing; there is no shell fallback decision table.

Prompt-layer plan/spec/contract gates are advisory routing only. Hard enforcement lives in `PreToolUse.edit`: `pre-edit-guard.sh` blocks implementation edits (paths outside plans/tasks/docs/deploy/harness/markdown surfaces) unless the active plan is Approved/Executing and `docs/spec.md` exists. Modes `enforce` (default) | `advice` | `off` via policy `.guards.edit_plan_gate` or `REPO_HARNESS_EDIT_PLAN_GATE`. Done-claim gates in the prompt layer keep blocking because they verify file-backed completion evidence, not language.

If you are asking "which hook file should I edit?", default to `.ai/hooks/`.
After installing or refreshing `~/.codex/hooks.json`, open Codex Settings and mark the user-level hook config as trusted; otherwise Codex will not execute it.
Repo-local `.claude/settings.json` and `.codex/hooks.json` hook adapters are legacy project-level config and should be retired during migration.

`Stop.default` routes through `stop-orchestrator.sh`. On Codex, dispatcher stdout stays quiet for ordinary successful hooks, but valid Stop decision JSON is forwarded so Codex can honor a one-shot planning completeness block; success stderr such as handoff refresh noise remains suppressed.

`SessionStart.default` runs `session-start-context.sh` and `security-sentinel.sh` under one adapter entry and aggregates their context into one JSON payload. The security sentinel is changed-only and advisory; stale repo-local copies emit one drift reminder instead of blocking the host session.

Use this command for an explicit read-only audit:

```bash
repo-harness security scan --json
```

`PostToolUse.always` runs one merged observer, `post-tool-observer.sh` (JSONL trace + context-pressure monitoring); the trace file `.claude/.trace.jsonl` is the single tool-trace record and context-budget probes are sampled every 5th call.

`PostToolUse.edit` runs a downstream sync chain after local edit reminders: architecture drift record, context contract sync, capability-context queueing, repo-to-brain mirror sync, and active contract verification. These stages remain advisory. A failed downstream stage must emit one `[SyncChain] WARN: ...` line and let the edit hook exit 0 so local editing is not blocked by maintenance drift.

`scripts/sync-brain-docs.sh --changed <path>` is hot-path optimized: the PostEdit hook starts it only when the changed repo path appears in the brain manifest. The script still owns authoritative JSON parsing and containment checks. Source files that resolve outside the repo, or brain targets that resolve outside the configured brain root through symlinks, are rejected.

Architecture drift requests use the current capability match as the pending pointer owner. Recording a newer request removes stale pending index lines for the same capability/path. Archiving a request removes it from the index and clears any local `AGENTS.md`/`CLAUDE.md` contract block that still points at that request.

## Hook Failure Playbook

When a hook blocks work:

1. Read the terminal output first.
2. Read `.ai/harness/failures/latest.jsonl` for the durable failure record.
3. Read `.claude/.trace.jsonl` for surrounding tool activity and timing.
4. Use the external runbook for extended examples and historical failure modes.

Common guards:

- `PlanStatusGuard` (edit layer): implementation edit attempted with no active approved plan, or the plan is in the wrong state; the prompt layer emits the same guard name as advisory guidance only.
- `ContractGuard`: the approved plan has not been projected into contract/review/notes scaffolding.
- `ContractGuard`: completion was claimed without passing contract verification.
- `WorktreeGuard`: writes were attempted from the wrong worktree.

## Architecture Drift Hooks

Hook scope is detect, classify, record, and remind:

- `scripts/architecture-drift.sh` writes requests/events.
- `scripts/workstream-sync.sh` maintains durable capability workstreams.
- `scripts/context-contract-sync.sh` updates only controlled local agent-context blocks.
- `repo-harness capability-context request` may enqueue ignored runtime work under `.ai/harness/capability-context/`; `SessionStart` reminds the current agent to run `repo-harness capability-context sync --pending --apply`.

Agents, not hooks, author semantic snapshots and diagrams.
Hooks do not spawn LLM agents in `PostEdit`.

## Self-Host vs Generated Parity Contract

This repo has two hook surfaces on purpose:

- `assets/hooks/` defines what downstream generated repos receive.
- `.ai/hooks/` defines this self-hosted repo's current runtime behavior.
- User-level `~/.claude/settings.json` and `~/.codex/hooks.json` are host adapters only.

Every hook change should state whether it affects `self-host`, `generated`, or
`both`. If behavior must stay aligned, update both surfaces in the same change.

## Verification Checklist

Run after hook or workflow contract changes: `bun test`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, and `bash scripts/migrate-project-template.sh --repo . --dry-run`.
