# Implementation Notes: run identity threading

## Decision

Add one small module, `src/cli/hook/run-identity.ts`, as the single resolution
and minting authority for hook-path run identity. SessionStart's in-process
handler is the only mint/adopt point; every other consumption point
(`event-telemetry.ts`, `command-observed.ts`) only resolves through the same
unified chain (`payload.run_id -> HOOK_RUN_ID -> CODEX_RUN_ID -> CLAUDE_RUN_ID
-> session-state lookup by session_id -> null`) and never fabricates a value
itself.

## Rationale

`.ai/harness/runs/hook-events.jsonl` events had an empty `run_id` because
nothing ever populated one, and the three evidence writers
(`verify-producer.ts`, `post-bash-importer.ts`, `attested-import.ts`) each
minted their own `run-${Date.now()}` on demand when a caller omitted
`correlationRunId`, so hook telemetry and evidence records never shared a
joinable identity. Minting the identity once at SessionStart and threading it
through the same resolution chain everywhere else closes that join without
touching the evidence protocol/schema (both `run_id` and `correlation_run_id`
already existed).

## Scope

- New: `src/cli/hook/run-identity.ts` — `resolveRunIdentity` (unified chain)
  and `mintOrAdoptSessionRunIdentity` (SessionStart-only mint/adopt).
- Storage: `.ai/harness/state/session-run-identity.json`, a single-slot JSON
  object overwritten per session (pattern reference:
  `session-context-budget.ts`'s `session-context-budget.json`), not a
  growing map keyed by every historical `session_id`.
- Wired consumption points: `event-telemetry.ts` (its `run_id`/`session_id`
  fields now come from `resolveRunIdentity`), `session-context.ts` (new
  `ensureSessionRunIdentity`, called from `handler-registry.ts`'s
  `session-context` handler — the SessionStart in-process path), and
  `command-observed.ts` (threads the resolved id into
  `importPostBashObservation`'s `correlationRunId`).
- Left untouched by design: `verify-producer.ts` and `attested-import.ts` —
  neither is called from any hook-path handler today (only from the
  standalone `scripts/emit-verify-evidence.ts` and
  `scripts/acceptance-receipt.ts` CLIs, which carry no session context and
  are explicitly out of scope). Their `?? run-${Date.now()}` fallback is
  unmodified in all three writer files.

## Tradeoff

The state file is a single overwritten slot rather than a bounded map of
recent sessions, so two genuinely concurrent sessions racing writes to the
same worktree could overwrite each other's stored identity; a later lookup
for the overwritten session degrades to `null` (fail-closed, never
fabricated) rather than resolving. This mirrors the accepted concurrency
model of the referenced `session-context-budget.json` precedent, which makes
the same single-slot-overwrite tradeoff for the same reason: this repo's hook
state files are per-worktree, and the common case is one active session per
worktree at a time.
