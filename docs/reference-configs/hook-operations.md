# Hook Operations Reference

> Full troubleshooting runbook: `brain/repo-harness/runbooks/runbook-repo-harness-hook-troubleshooting.md`.

## Hook Authority Map

Start with the shortest truth path:

1. `~/.claude/settings.json` and `~/.codex/hooks.json` wire host events into `repo-harness-hook` (bash-shim installs use `bash ~/.repo-harness/hook-shim.sh <hook>.sh`), with `repo-harness hook` as the compatibility fallback.
2. The dispatcher checks whether the current repo is opted in through `.ai/harness/workflow-contract.json` (and, for the bash shim, that its primary root is trusted in `~/.repo-harness/trusted-repos`).
3. The route registry selects the ordered hook scripts for that event and route.
4. Hook scripts resolve **central-first**: env `REPO_HARNESS_HOOK_SOURCE` (`repo` | `central` | absolute dir) → repo policy pin `"hook_source": "repo"` in `.ai/harness/policy.json` → the central copy → vendored `<repo>/.ai/hooks` fallback. The central copy is `~/.repo-harness/hooks/` (installed by `scripts/repo-harness.sh install`, stamped with `.version`) on the bash chain, and the packaged `assets/hooks/` inside the globally installed CLI on the `repo-harness-hook` chain.

Central-first means one `install` (or one CLI upgrade) updates hook behavior for every trusted opt-in repo at once; vendored `.ai/hooks` copies are inert defaults unless the repo pins `"hook_source": "repo"`. Missing advisory scripts warn and skip, but required guard routes still fail closed. `repo-harness doctor` and `scripts/repo-harness.sh status` report which source is active for the current repo.
Generated host adapter commands carry a 30 second timeout; long-running work belongs in explicit CLI commands, not hook foreground execution.

`repo-harness adopt`, migration, and new-project scaffold paths do not copy the full hook runtime into ordinary downstream repos. Without a `"hook_source": "repo"` pin they prune stale top-level `.ai/hooks/*.sh` entry scripts and refresh only `.ai/hooks/lib/` helper libraries plus a README tombstone, because active execution should come from the user-level adapter and packaged hooks. Repos that intentionally develop or override hooks must set `"hook_source": "repo"` before syncing a full vendored hook runtime.

`UserPromptSubmit.default` dispatches to the active `prompt-guard.sh` resolved by the central-first hook source decision. For ordinary repos that means the packaged/user-level runtime; `.ai/hooks/prompt-guard.sh` is active only when the repo pins `"hook_source": "repo"`. The shell layer parses host prompt JSON, reads workflow files, performs capture side effects, and renders host-safe output; it pipes `{"prompt": ...}` into `repo-harness-hook prompt-guard-decide`, which owns every prompt-text intent classifier (Unicode-aware, in `src/cli/hook/prompt-intents.ts`) plus the intent x state decision table and returns one verdict JSON line (action, intent facts, derived strings). Review/release prompts add Review Rubric v1 plus the current implementation diff fingerprint to local `/check` and peer acceptance guidance; Done blocks stale/malformed recorded fingerprints, legacy missing fingerprints warn, and Stop nudges without blocking. If the engine is unreachable or predates the protocol, the prompt layer degrades to a one-shot advisory instead of guessing; there is no shell fallback decision table.

`UserPromptSubmit.delegation` dispatches to `codex-delegation-advisor.sh`: Codex-only, explicit-mode (`/delegate`, `/parallel`, imperative `spawn/use/run subagents to ...`, parallel investigation, Chinese equivalents), forwards only valid `UserPromptSubmit` `additionalContext` JSON, and records scoped state under `.ai/harness/delegation/` with `latest.json` as the current pointer. Explicit delegation without a valid active plan/contract emits permission-only context and never claims a nonexistent contract. In auto mode, standing authorization is not an execution instruction: the advisor requires a valid active plan/contract and reuses `repo-harness-hook prompt-route`; only deterministic execute/verify routes receive contract-bound context. Ordinary questions, status/diagnosis prompts, mechanism discussions, and invalid/missing active state emit nothing.

Prompt-layer plan/spec/contract gates are advisory routing only. Hard enforcement lives in `PreToolUse.edit`: `pre-edit-guard.sh` blocks implementation edits (paths outside plans/tasks/docs/deploy/harness/markdown surfaces) unless the active plan is Approved/Executing and `docs/spec.md` exists. Modes `enforce` (default) | `advice` | `off` via policy `.guards.edit_plan_gate` or `REPO_HARNESS_EDIT_PLAN_GATE`. Done-claim gates in the prompt layer keep blocking because they verify file-backed completion evidence, not language.

If you are asking "which hook file should I edit?", edit canonical `assets/hooks/` for product changes, then run `bun run sync:hooks` to refresh this self-host repo's checked-in `.ai/hooks/` projection. `assets/hooks/projection.json` is package-only metadata and is not projected. Static host-adapter templates are retired; the typed installers under `src/cli/installer/targets/` generate the only supported adapter shape. Runtime pickup outside repo-pinned development happens on the next `install`/CLI upgrade because hooks resolve central-first.
After installing or refreshing `~/.codex/hooks.json`, open Codex Settings and mark the user-level hook config as trusted; otherwise Codex will not execute it.
Repo-local `.claude/settings.json` and `.codex/hooks.json` hook adapters are legacy project-level config and should be retired during migration.

`SubagentStart.context` runs `subagent-start-context.sh` after Codex creates a subagent; it marks explicit delegation as spawned and injects role, permission-scope, evidence, and final-response requirements, but cannot cause a spawn.
`SubagentStop.quality` runs `subagent-stop-quality.sh` and forwards only valid decision JSON; it asks Codex to continue the same subagent once when the final report is obviously incomplete, keyed by session/run identity, subagent identity, and message hash. These delegation lifecycle routes are installed only into the Codex adapter; Claude keeps the shared `PreToolUse.subagent` return-channel route.
`Stop.default` routes through `stop-orchestrator.sh`. Lite refreshes only the compact handoff/resume pair and exits; minimal-change review, review freshness, plan completeness, and delegation fallback remain Standard/Strict orchestration. On Codex, dispatcher stdout stays quiet for ordinary successful hooks and also suppresses Stop decision JSON, because current Codex Desktop rejects that turn-finalization stdout as an unsupported content type. Claude keeps the direct `stop-orchestrator.sh` decision JSON path.

`SessionStart.default` runs `session-start-context.sh`, `minimal-change-context.sh`, and `security-sentinel.sh` under one adapter entry and aggregates their context into one JSON payload. The minimal-change context is fixed, advice-only, and disabled by `.ai/harness/policy.json` `minimal_change.mode=off`; the security sentinel is changed-only and advisory; stale repo-local copies emit one drift reminder instead of blocking the host session.

Explicit read-only audit: `repo-harness security scan --json`.

`PostToolUse.always` runs one merged observer, `post-tool-observer.sh` (JSONL trace + lightweight advisories); the trace file `.claude/.trace.jsonl` is the single tool-trace record.

`PostToolUse.edit` runs local edit reminders, the FirstPrinciples
anti-overengineering advisory, the downstream sync chain, then
`minimal-change-observer.sh`. The sync chain records architecture drift, context
contract sync, capability-context queueing, repo-to-brain mirror sync, and active
contract verification. These stages remain advisory. A failed downstream stage
must emit one `[SyncChain] WARN: ...` line and let the edit hook exit 0 so local
editing is not blocked by maintenance drift. The FirstPrinciples advisory
reviews only the current file diff and asks whether new dependencies,
compatibility branches, abstractions, config surfaces, or branch-heavy logic
truly need to exist; it must not override trust-boundary validation, data-loss
prevention, security, accessibility, or explicit user-requested behavior. The
minimal-change observer is stdout-silent and writes bounded objective facts to
`.ai/harness/checks/minimal-change.latest.json`: scoped path, diff fingerprint,
numstat, package.json dependency changes, low-confidence abstraction candidates,
and protected-change markers.

Brain-vault export is not part of PostEdit. Operators may invoke `repo-harness run sync-brain-docs --changed <path>` explicitly; the script owns authoritative JSON parsing and containment checks. Source files that resolve outside the repo, or brain targets that resolve outside the configured brain root through symlinks, are rejected.

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
- `WorktreeGuard`: writes were attempted from the wrong worktree. Circuit-breaker updates lock the complete read-modify-write, wait at most two seconds, and fail closed; they never reclaim a stale-looking lock because unlinking can race a live owner. After verifying no hook process is active, an operator may remove `.ai/harness/state/circuit-breaker.json.lock` and retry.

## Architecture Drift Hooks

Hook scope is detect, classify, record, and remind:

- `repo-harness run architecture-queue` writes requests/events.
- `repo-harness run workstream-sync` maintains durable capability workstreams.
- `repo-harness run context-contract-sync` updates only controlled local agent-context blocks.
- `repo-harness capability-context request` may enqueue ignored runtime work under `.ai/harness/capability-context/`; `SessionStart` reminds the current agent to run `repo-harness capability-context sync --pending --apply`.

Agents, not hooks, author semantic snapshots and diagrams.
Hooks do not spawn LLM agents in `PostEdit`.
Hooks also do not start long-running `codex exec` or worker/verifier commands; they may inject bounded delegation contracts or block once for continuation, while deterministic execution belongs in explicit CLI commands such as `scripts/contract-run.ts`.
## Self-Host vs Generated Parity Contract

This repo has two hook surfaces on purpose:

- `assets/hooks/` defines what downstream repos and the central runtime receive (`install` copies it to `~/.repo-harness/hooks/`; the npm package ships it for `repo-harness-hook`).
- `.ai/hooks/` defines this self-hosted repo's current runtime behavior; the self-host policy pins `"hook_source": "repo"` so hook development runs live working-tree code instead of the central copy.
- User-level `~/.claude/settings.json` and `~/.codex/hooks.json` are host adapters only.

Every hook change should state whether it affects `self-host`, `generated`, or
`both`. If behavior must stay aligned, update both surfaces in the same change.

## Verification Checklist

Run after hook or workflow contract changes: `bun test`, `repo-harness run check-task-sync`, `repo-harness run check-task-workflow --strict`, and `repo-harness adopt --repo . --dry-run`.
