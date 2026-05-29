# Architecture Module: runtime-harness/hook-adapters

> **Capability ID**: `runtime-harness-hook-adapters`
> **Matched Prefixes**: `assets/hooks`, `.ai/hooks`, `src/cli/installer`, `src/cli/hook`, `src/cli/hook-entry.ts`, `scripts/run-skill-hook.ts`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

The hook adapter layer connects agent tool events to the repo-local workflow
contract.

Authoritative split:

- `assets/hooks/`: installable shared hook source.
- `.ai/hooks/`: self-host runtime hook implementation.
- `src/cli/installer/targets/*`: user-level adapter writers for `~/.claude/settings.json` and `~/.codex/hooks.json`.
- `src/cli/hook/*`: public route registry and compatibility runtime bridge.
- `src/cli/hook-entry.ts`: minimal hook-only entrypoint that checks repo opt-in and dispatches ordered `.ai/hooks/*` scripts without loading the full CLI.
- Repo-local `.claude/settings.json` and `.codex/hooks.json`: retired legacy project-level adapters cleaned by migration.
- Repo-local `.codex/*`: ignored Codex runtime residue.
- Codex Settings trust state: user-controlled runtime approval required before Codex executes `~/.codex/hooks.json`.
- `scripts/run-skill-hook.ts`: skill lifecycle hook runner for pre/post migration events.

Runtime state is stored under ignored `.ai/harness/*` paths and `.claude` runtime
files. It is not a product deliverable.

## P2 Trace

Concrete route: Claude or Codex `PreToolUse` for edit/write -> host adapter
runs `repo-harness-hook` from user-level config -> hook entry checks the current repo's
`.ai/harness/workflow-contract.json` opt-in marker -> route registry selects
the ordered scripts -> invokes `worktree-guard.sh` and `pre-edit-guard.sh`
-> guards inspect policy, active plan state, protected paths, and task workflow
expectations -> warning or block is returned to the agent.
After adapter configuration, Codex still requires the user to trust
`~/.codex/hooks.json` in Codex Settings before that route executes.

Post-edit route: edit/write -> `post-edit-guard.sh` -> architecture-sensitive
paths call `architecture-drift.sh` -> capability resolver binds the changed file
to a capability -> pending request is written under `docs/architecture/requests`
and an event is appended under `.ai/harness/architecture/events.jsonl`.

Error paths:

- Hook input parsing falls back across stdin JSON, env, and argv compatibility.
- Worktree guard warns by default and blocks only when marker policy is enabled.
- Runtime write failures should produce structured warnings or failure logs without corrupting the repo contract.

## P3 Decision

The shared `.ai/hooks` layer exists to avoid maintaining separate Claude and
Codex hook implementations. The invariant is single implementation, adapter-only
host config. The adapter now lives at user level so new repos only opt in by
carrying repo-local workflow contract files and hook implementation.

At 10x hook events, the first failure is cold-loading the full CLI on every
hook event. The invariant is that host adapters point at the minimal
hook-only entrypoint and then `.ai/hooks`, instead of creating separate
per-host implementation trees or loading non-hook command modules.

## Optimization Backlog

- Keep `repo-harness init` and migration from regenerating repo-local `.claude/settings.json` / `.codex/hooks.json` adapters.
- Remind users to trust `~/.codex/hooks.json` in Codex Settings after user-level adapter installation.
- Keep hook asset parity test coverage whenever `.ai/hooks` or `assets/hooks` changes.
