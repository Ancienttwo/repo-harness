# Hook Operations Reference

> Full troubleshooting runbook: `brain/repo-harness/runbooks/runbook-repo-harness-hook-troubleshooting.md` (`gbrain` slug `runbooks/runbook-repo-harness-hook-troubleshooting`).

## Hook Authority Map

Start with the shortest truth path:

1. `~/.claude/settings.json` and `~/.codex/hooks.json` wire host events into `repo-harness-hook` (bash-shim installs use `bash ~/.repo-harness/hook-shim.sh <hook>.sh`), with `repo-harness hook` as the compatibility fallback.
2. The dispatcher checks whether the current repo is opted in through `.ai/harness/workflow-contract.json` (and, for the bash shim, that its primary root is trusted in `~/.repo-harness/trusted-repos`).
3. The route registry selects the ordered hook scripts for that event and route.
4. Hook scripts resolve **central-first**: env `REPO_HARNESS_HOOK_SOURCE` (`repo` | `central` | absolute dir) → repo policy pin `"hook_source": "repo"` in `.ai/harness/policy.json` → the central copy → vendored `<repo>/.ai/hooks` fallback. The central copy is `~/.repo-harness/hooks/` (installed by `scripts/repo-harness.sh install`, stamped with `.version`) on the bash chain, and the packaged `assets/hooks/` inside the globally installed CLI on the `repo-harness-hook` chain.

Central-first means one `install` (or one CLI upgrade) updates hook behavior for every trusted opt-in repo at once; vendored `.ai/hooks` copies are inert defaults unless the repo pins `"hook_source": "repo"`. Missing advisory scripts warn and skip, but required guard routes still fail closed. `repo-harness doctor` and `scripts/repo-harness.sh status` report which source is active for the current repo.
Generated host adapter commands carry a 30 second timeout; long-running work belongs in explicit CLI commands, not hook foreground execution.

`UserPromptSubmit.default` dispatches to `.ai/hooks/prompt-guard.sh`. The shell layer parses host prompt JSON, reads workflow files, performs capture side effects, and renders host-safe output; it pipes `{"prompt": ...}` into `repo-harness-hook prompt-guard-decide`, which owns Unicode-aware explicit trigger facts (`src/cli/hook/prompt-triggers.ts`) plus deterministic action routing (`src/cli/hook/prompt-guard-decision.ts`) and returns one verdict JSON line (action, trigger facts, derived strings). If the engine is unreachable or predates the protocol, the prompt layer degrades to a one-shot advisory instead of guessing; there is no shell fallback decision table.

Prompt-layer plan/spec/contract gates are advisory routing only. Hard enforcement lives in `PreToolUse.edit`: `pre-edit-guard.sh` blocks implementation edits (paths outside plans/tasks/docs/deploy/harness/markdown surfaces) unless the active plan is Approved/Executing and `docs/spec.md` exists. Modes `enforce` (default) | `advice` | `off` via policy `.guards.edit_plan_gate` or `REPO_HARNESS_EDIT_PLAN_GATE`. Done-claim gates in the prompt layer keep blocking because they verify file-backed completion evidence, not language.

If you are asking "which hook file should I edit?", default to `.ai/hooks/` and mirror the change into `assets/hooks/`; runtime pickup outside this repo happens on the next `install`/CLI upgrade because hooks resolve central-first.
After installing or refreshing `~/.codex/hooks.json`, open Codex Settings and mark the user-level hook config as trusted; otherwise Codex will not execute it.
Repo-local `.claude/settings.json` and `.codex/hooks.json` hook adapters are legacy project-level config and should be retired during migration.

`Stop.default` routes through `stop-orchestrator.sh`. On Codex, dispatcher stdout stays quiet for ordinary successful hooks, but valid Stop decision JSON is forwarded so Codex can honor a one-shot planning completeness block; success stderr such as handoff refresh noise remains suppressed.

`SessionStart.default` dispatches one script, `session-start-context.sh`. That script internally runs the changed-only advisory security sentinel and aggregates its context into the same SessionStart JSON payload. The standalone `security-sentinel.sh` remains available for manual smoke/debug, but it is no longer a separate route-dispatched hook.

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

- `assets/hooks/` defines what downstream repos and the central runtime receive (`install` copies it to `~/.repo-harness/hooks/`; the npm package ships it for `repo-harness-hook`).
- `.ai/hooks/` defines this self-hosted repo's current runtime behavior; the self-host policy pins `"hook_source": "repo"` so hook development runs live working-tree code instead of the central copy.
- User-level `~/.claude/settings.json` and `~/.codex/hooks.json` are host adapters only.

Every hook change should state whether it affects `self-host`, `generated`, or
`both`. If behavior must stay aligned, update both surfaces in the same change.

## Verification Checklist

Run after hook or workflow contract changes: `bun test`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, and `bash scripts/migrate-project-template.sh --repo . --dry-run`.
