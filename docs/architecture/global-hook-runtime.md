# Global Hook Runtime

> **Status**: HRD-09 — legacy host-event runtime retired (2026-07-21)
> **Authority**: `src/cli/hook/route-registry.ts` and `src/cli/hook/runtime.ts`
> **Adapters**: `src/cli/installer/managed-entries.ts`

This document describes the current host-event boundary. The user-level Codex
and Claude adapters are transport configuration. Pi uses the official package
extension in `src/pi/extension.ts` and a bounded Bun JSON bridge. The route registry and
typed handler registry are the execution authority; a Markdown card, shell
wrapper, or generated projection is not a second runtime authority.

## P1 — Architecture map

The boundary has four layers:

1. Host configuration in `~/.codex/hooks.json` and
   `~/.claude/settings.json` selects the event, matcher, and stable route id.
2. The installed command resolves the repository, checks the opt-in marker
   `.ai/harness/workflow-contract.json`, and invokes the hook-only CLI entry
   point. Opted-in repositories require this bin on PATH.
3. `ROUTES` contains the 8 public `(event, routeId, matcher)` tuples. Every
   tuple has exactly one `handler`; there is no `scripts` field and no Bash
   host-event dispatcher.
4. `handler-registry.ts` runs one typed in-process handler. The handler
   returns a typed result. The `HOST_RENDERERS` table in `hook-protocol.ts`
   renders it for Claude, Codex or Pi. `runtime.ts` writes one event-level
   telemetry record.

`assets/hooks/` is deleted. The last shell file there,
`workflow-state.sh`, was an operator library and not a host-event route; its
remaining callers now run TypeScript (#696). The deleted `run-hook.sh`,
per-event guards, hook shims, and root helper runtime are not read by
host-event execution.

## P2 — Concrete trace

For a Claude or Codex event, the path is:

```text
host event
  -> managed user-level adapter command
  -> HOOK_HOST check
  -> resolve root (HOOK_REPO_ROOT, else one git rev-parse) + opt-in marker
  -> getRoute(event, routeId) + host support check
  -> parse the payload once + resolve the identity once
  -> getHandlerForRoute(route)
  -> one typed handler.run(context)
  -> HOST_RENDERERS[host](outcome)
  -> one loop-engine-hook-event/v2 record
```

The CLI reads the payload once. A malformed payload stops the event before any
handler runs. The identity comes from the payload only: `session_id`,
`run_id` and `turn_id`. A missing value stays null. No hook mints or stores
an id, and no handler reads a session, run or turn environment variable.

The typed handler receives the payload, the identity, the repository root, the
environment and the event-scoped `StateInputCollector`. The collector resolves
Effective State at most once per event. Handlers return a typed result with an
exit code, an optional permission, optional model context and diagnostics.
They do not write to host file descriptors. The host table renders the result:
Claude and Codex get `hookSpecificOutput` on exit 0 and diagnostics on stderr;
Pi gets one protocol 1 JSON object.

A thrown handler exits 1, except the edit guard. The edit guard route is
fail-closed: a throw exits 2 on Claude and Codex and gives `decision: block`
on Pi. A missing `HOOK_HOST`, an unknown route and a route that is not
installed for the host also stop before a handler runs.

The public route inventory has 12 `(event, routeId, matcher)` tuples. The
Host column of the route table in
[`hook-operations.md`](../reference-configs/hook-operations.md#hook-authority-map)
lists the matcher, host and typed handler of each tuple.

The tuple order and membership are a stable public contract that Codex trust-
hashes, so additions require an explicit installer projection and trust
transition. Task Inbox uses a dedicated `UserPromptSubmit.inbox` row because
peer bodies are untrusted and must remain outside prompt handling and
authorization. Two pre-existing rows carry the board slice:

| Route | WP3 addition | Failure mode |
| --- | --- | --- |
| `SubagentStart` / `context` | `BoardSliceV1` in the child context | advisory; resolution failure means no block |
| `PreToolUse` / `subagent` | the same slice appended once to the `Task\|Agent` prompt, gated by its marker; a `SendUserMessage` call gets no output | advisory |

`PreToolUse.edit` has no lease check. `LeaseOwnershipGuard` was advisory since
#483 and is deleted (#692). The lease authority stays in `start-task`,
`complete-task` and `contract-worktree finish`. See
`docs/architecture/shared-coordination-plane.md` §9 for the board slice and
its measured cost basis.

The event result is fail-closed for unknown routes and missing handler
bindings. A non-git or non-opt-in repository exits quietly without creating a
runtime event record.

## Pi package boundary

Pi owns the agent loop and tool execution. `src/pi/extension.ts` maps supported
native events to the shared typed handlers. It invokes the current package's
`dist/hook-entry.js` through `src/pi/hook-bridge.ts`. The bridge uses protocol 1
JSON output and a 30-second deadline for every call. It limits stdin to 16 MiB and diagnostics
to 8 KiB. It cancels its own child processes on shutdown or session replacement.

The adapter uses Pi 1.2.0's installed `resolveToCwd` implementation. It resolves
paths against the session directory before guard dispatch. This
keeps `@`, `~`, file URLs and subdirectory calls bound to the native tool target.
Pi does not export this resolver from its public SDK. The version is exact;
a missing resolver or another version leaves opt-in edits blocked.

Session context uses the one SessionStart budget. The adapter sends each
SessionStart snapshot once. Pi invokes no UserPromptSubmit route.
Each model run has a fresh run ID. Tool call IDs bind the original payload to its result. Nested calls keep
the parent tool call ID. Stop runs once at `agent_settled`, after retries and
queued input have settled. The bridge never retries an external operation.

The extension checks native edit/write calls in opt-in repositories. Hook
refusal, timeout, process failure or invalid output prevents execution. A failed
session context or observation blocks later edits until `/reload` succeeds.
Shell writes, direct extension writes and third-party MCP writes are outside
this tool gate. Bash uses Pi's `structuredContent.exit_code` field and sends
it as the payload `exit_code`. A result without a safe integer stays unknown,
and the observer records nothing for it. The observer writes no verification
evidence. Bash observation diagnostics also reach the model through
tool-result content. The native output, structured
content and error flag stay intact.

The bridge records tool results with the original call binding. A native edit
or write can report an error after its file write completes. Execution cancellation
does not cancel this observation. The adapter preserves the error result and never
repeats the tool operation.

The skill catalog owns the Pi skill list. `scripts/sync-pi-package.ts` projects
its minimal router and facade entries into `package.json`. Prepack checks this
projection. The Claude/Codex installer rejects a Pi target and leaves Pi package
installation to the host.

## Telemetry contract

`src/cli/hook/event-telemetry.ts` is the sole writer for
`.ai/harness/runs/hook-events.jsonl`. Storage maintenance lives in
`src/effects/hook-event-log.ts`: before the next append, an active file at or
above 8 MiB is atomically renamed into `hook-events.jsonl.archive/`. The archive
retains at most 32 owned segments and 256 MiB, deleting oldest segments first.
The active threshold may be exceeded by the last record or concurrent appends;
individual records larger than 8 MiB are rejected by the non-authoritative sink.
No elapsed-time retention setting or operator configuration is required.

The harness profile benchmark reads the retained archive
plus the active file as UTF-8 lines. Samples describe retained history, not
lifetime history.
Rotation/retention and snapshot file opening share the existing owner-fenced
lock; appends remain O_APPEND, and a renamed inode is never truncated. Readers
open their descriptors under that lock and consume them unlocked, so subsequent
retention cannot invalidate the selected snapshot. Foreign archive filenames and
symlink targets are never pruned. Telemetry write failure cannot change hook
safety. Existing large logs within the archive budget are preserved as one
segment on their first rotation; no migration command or second writer exists.

A handled event record has protocol `loop-engine-hook-event/v2` and these
fields: `event_id`, `started_at`, `completed_at`, `host`, `session_id`,
`run_id`, `turn_id`, `event`, `route_id`, `exit_code`, `blocked`, `reason`,
`elapsed_ms` and `fingerprint`.

- `blocked` is true only for exit 2 or a deny decision.
- `reason` is `handler-failed` only for a thrown handler, `invalid-payload`
  for a malformed payload, `blocked` for a policy block, `handler-exit` for
  another non-zero exit, or the handler's own reason. A policy denial and a
  crash therefore never share a reason.
- `session_id`, `run_id` and `turn_id` are the payload values, or null.

The record has no step, metric or measurement fields. Telemetry append failure
never changes hook safety. The benchmark reader rejects a record from another
protocol or with a missing `elapsed_ms`, `blocked` or `fingerprint`. The
one-time diet report script is retired.

## P3 — Design decision

The invariant is one route tuple, one typed handler, one host-output boundary,
and one telemetry record. HRD-09 removes the second authority rather than
keeping a compatibility reader: old Bash route files are deleted from the
product surface, and migration-only recognition is confined to the adoption
transaction. This keeps host execution deterministic and makes a route change
visible in one registry entry.

At 10x event volume, the first pressure point is synchronous telemetry append
contention or unavailable measurement, not a second handler invocation. The
runtime therefore keeps telemetry non-authoritative and lets evidence
consumers fail closed when required measurements are missing.

## Adapter and migration boundary

`managed-entries.ts` projects the registry into user-level adapter entries and
preserves the host's trust boundary (Codex may still require Settings trust).
`standard-plan.ts` is the only adoption planner. It can recognize and remove
old repo-local adapter commands as a one-shot migration, but runtime dispatch
never reads those commands. The migration uses the same `FsTransaction` as the
rest of adoption; exact fingerprints protect generated-file retirement, while
unmatched bytes and custom sibling hooks remain untouched.

## Verification surfaces

- `bun test tests/cli/route-registry.test.ts tests/cli/hook.test.ts`
- `bun test tests/cli/route-registry.test.ts tests/subagent-handler.test.ts`
- `bun test tests/command-observed.test.ts tests/stop-handler.test.ts`
- `bun run check:type`
- `bun src/cli/index.ts architecture-projection check --json`

Historical canary observations remain in archived research and are not runtime
inputs. Current behavior is defined by the typed registry, installer projection,
and event protocol above.
