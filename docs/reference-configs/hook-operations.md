# Hook Operations Reference

> Partially externalized: full troubleshooting runbook lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/runbooks/runbook-repo-harness-hook-troubleshooting.md`
- gbrain slug: `runbooks/runbook-repo-harness-hook-troubleshooting`

## Hook Authority Map

Start with the shortest truth path:

1. `~/.claude/settings.json` and `~/.codex/hooks.json` wire host events into `repo-harness-hook`, with `repo-harness hook` as the compatibility fallback.
2. `repo-harness-hook` checks whether the current repo is opted in through `.ai/harness/workflow-contract.json`.
3. The route registry selects the ordered `.ai/hooks/*` scripts for that event and route.
4. `.ai/hooks/*` is the shared implementation layer and the default place to edit.

`UserPromptSubmit.default` keeps that same public route, but prompt-guard has a
split implementation:

1. `repo-harness-hook UserPromptSubmit --route default` dispatches to `.ai/hooks/prompt-guard.sh`.
2. `prompt-guard.sh` parses host prompt JSON, reads workflow files, performs capture side effects, runs quality gates, and renders host-safe stdout/stderr.
3. For intent plus workflow-state routing, `prompt-guard.sh` calls `repo-harness-hook prompt-guard-decide`.
4. The TypeScript decision engine classifies prompt facts, reads state facts from environment variables, and returns one action enum from the explicit decision table.
5. `prompt-guard.sh` renders that action as allow, advice, block, capture guidance, execution guidance, or done-gate output.

If you are asking "which hook file should I edit?", default to `.ai/hooks/`.
After installing or refreshing `~/.codex/hooks.json`, open Codex Settings and
mark the user-level hook config as trusted; otherwise Codex will not execute it.
Repo-local `.claude/settings.json` and `.codex/hooks.json` hook adapters are
legacy project-level config and should be retired during migration.

`Stop.default` routes through `stop-orchestrator.sh`. On Codex, dispatcher
stdout stays quiet for ordinary successful hooks, but valid Stop decision JSON
is forwarded so Codex can honor a one-shot planning completeness block; success
stderr such as handoff refresh noise remains suppressed.

`SessionStart.default` runs `session-start-context.sh` and
`security-sentinel.sh` under the same adapter entry. The dispatcher aggregates
their SessionStart context into one JSON payload. The security sentinel is
changed-only and advisory: it scans only `~/.claude/settings.json`,
`~/.codex/hooks.json`, current repo `.vscode/tasks.json`, and legacy repo-local
hook adapter files, then writes `.ai/harness/security/latest.json`.

Use this command for an explicit read-only audit:

```bash
repo-harness security scan --json
```

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

Run these after hook or workflow contract changes:

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bash scripts/migrate-project-template.sh --repo . --dry-run
```
