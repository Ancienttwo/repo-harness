# Architecture Module: runtime-harness/hook-adapters

> **Capability ID**: `runtime-harness-hook-adapters`
> **Matched Prefixes**: `assets/hooks`, `.ai/hooks`, `.claude/settings.json`, `scripts/run-skill-hook.ts`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

The hook adapter layer connects agent tool events to the repo-local workflow
contract.

Authoritative split:

- `assets/hooks/`: installable shared hook source.
- `.ai/hooks/`: self-host runtime hook implementation.
- `.claude/settings.json`: committed Claude adapter that dispatches into `.ai/hooks/run-hook.sh`.
- Repo-local `.codex/`: not a committed contract surface unless Codex documents a repo-local config convention. Current repo-local implementation should stay under `.ai/`.
- `scripts/run-skill-hook.ts`: skill lifecycle hook runner for pre/post migration events.

Runtime state is stored under ignored `.ai/harness/*` paths and `.claude` runtime
files. It is not a product deliverable.

## P2 Trace

Concrete route: Claude `PreToolUse` for edit/write -> `.claude/settings.json`
runs `.ai/hooks/run-hook.sh` -> dispatcher resolves repo root -> invokes
`worktree-guard.sh` and `pre-edit-guard.sh` -> guards inspect policy, active
plan state, protected paths, and task workflow expectations -> warning or block
is returned to the agent.

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
host config.

At 10x hook events, the first failure would be duplicated host-specific adapter
logic. The invariant is that host adapters point at `.ai/hooks` instead of
creating separate per-host implementation trees.

## Optimization Backlog

- Ignore or clean local `.codex/` residue unless official Codex repo-local config support is verified.
- Keep hook asset parity test coverage whenever `.ai/hooks` or `assets/hooks` changes.
