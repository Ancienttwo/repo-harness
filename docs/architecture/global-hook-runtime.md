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
   point (with the full CLI as the install-time command fallback when the
   small binary is unavailable).
3. `ROUTES` contains the 12 public `(event, routeId, matcher)` tuples. Every
   tuple has exactly one `handler`; there is no `scripts` field and no Bash
   host-event dispatcher.
4. `handler-registry.ts` runs one typed in-process handler. `runtime.ts` owns
   host output shaping and writes one event-level telemetry record.

The only shell file left in the hook projection is
`assets/hooks/lib/workflow-state.sh`. Only the source checkout mirrors it to
`.ai/hooks/lib/`. Consumer repositories use the package asset. It is an
operator/workflow-state helper and is not a host-event route. The deleted
`run-hook.sh`, per-event guards, hook shims, and root helper runtime are not
read by host-event execution.

## P2 — Concrete trace

For a Claude or Codex event, the path is:

```text
host event
  -> managed user-level adapter command
  -> resolve git root + opt-in marker
  -> getRoute(event, routeId)
  -> getHandlerForRoute(route)
  -> one typed handler.run(context)
  -> hostOutput(result)
  -> one loop-engine-hook-event/v1 record
```

The input payload is captured once by the CLI. The typed handler receives the
payload, repository root, environment, and the event-scoped
`StateInputCollector`. State reads are memoized at the collector boundary.
Handlers return a structured result; they do not write directly to host file
descriptors. `runtime.ts` decides whether Claude or Codex receives stdout,
stderr, a decision envelope, or SessionStart context.

The public route inventory is:

| Event | Route | Matcher / host | Typed handler |
| --- | --- | --- | --- |
| `SessionStart` | `default` | all | `session-context` |
| `PreToolUse` | `edit` | `Edit\|Write` | `mutation-guard` |
| `PreToolUse` | `subagent` | `Task\|Agent\|SendUserMessage` | `subagent` |
| `PostToolUse` | `edit` | `Edit\|Write` | `mutation-observed` |
| `PostToolUse` | `bash` | `Bash` | `command-observed` |
| `PostToolUse` | `always` | all | `trace-observer` |
| `UserPromptSubmit` | `default` | all | `prompt` |
| `UserPromptSubmit` | `inbox` | all | `task-inbox` |
| `UserPromptSubmit` | `delegation` | Codex only | `subagent` |
| `SubagentStart` | `context` | Codex only | `subagent` |
| `SubagentStop` | `quality` | Codex only | `subagent` |
| `Stop` | `default` | all | `stop` |

The tuple order and membership are a stable public contract that Codex trust-
hashes, so additions require an explicit installer projection and trust
transition. Task Inbox uses a dedicated `UserPromptSubmit.inbox` row because
peer bodies are untrusted and must remain outside prompt classification and
authorization. Three pre-existing rows carry the earlier coordination surface:

| Route | WP3 addition | Failure mode |
| --- | --- | --- |
| `SubagentStart` / `context` | `BoardSliceV1` appended to the context array | advisory; resolution failure means no block |
| `PreToolUse` / `subagent` | the same slice appended to the `Task\|Agent` prompt, guarded by `HOOK_HOST != codex` for exactly-once; the `SendUserMessage` branch is untouched | advisory |
| `PreToolUse` / `edit` | `LeaseOwnershipGuard`, armed only by a claim token whose `unit_ref` is the active-plan marker AND a linked worktree | fail-closed `exit(2)` once armed; advisory before arming |

See `docs/architecture/shared-coordination-plane.md` §9 for the arming
predicate, the five ownership steps, and the measured cost basis.

The event result is fail-closed for unknown routes and missing handler
bindings. A non-git or non-opt-in repository exits quietly without creating a
runtime event record.

## Pi package boundary

Pi owns the agent loop and tool execution. `src/pi/extension.ts` maps supported
native events to the shared typed handlers. It invokes the current package's
`dist/hook-entry.js` through `src/pi/hook-bridge.ts`. The bridge uses protocol 1
JSON output and a ten-second deadline for ordinary checks. Stop uses the shared
150-second managed host limit. It limits stdin to 16 MiB and diagnostics
to 8 KiB. It cancels its own child processes on shutdown or session replacement.

The adapter uses Pi 1.1.0's installed `resolveToCwd` implementation. It resolves
paths against the session directory before guard and journal dispatch. This
keeps `@`, `~`, file URLs and subdirectory calls bound to the native tool target.
Pi does not export this resolver from its public SDK. The version is exact;
a missing resolver or another version leaves opt-in edits blocked.

Session context keeps the existing provider budgets. The adapter sends each
SessionStart snapshot once. It leaves later prompt context to UserPromptSubmit.
Each model run has a fresh run ID. Tool call IDs bind the original payload to its result. Nested calls keep
the parent tool call ID. Stop runs once at `agent_settled`, after retries and
queued input have settled. The bridge never retries an external operation.

The extension checks native edit/write calls in opt-in repositories. Hook
refusal, timeout, process failure or invalid output prevents execution. A failed
session context or observation blocks later edits until `/reload` succeeds.
Shell writes, direct extension writes and third-party MCP writes are outside
this tool gate. Bash uses Pi's `structuredContent.exit_code` field. A result
without an integer exit code stays `unknown`. Short unknown output stays inline.
It cannot create passing verification evidence. Bash observation diagnostics
also reach the model through tool-result content. The native output, structured
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

The telemetry reader and the harness profile benchmark read the retained archive
plus the active file as UTF-8 lines. Samples describe retained history, not
lifetime history. An explicitly selected custom telemetry log is a single file.
Rotation/retention and snapshot file opening share the existing owner-fenced
lock; appends remain O_APPEND, and a renamed inode is never truncated. Readers
open their descriptors under that lock and consume them unlocked, so subsequent
retention cannot invalidate the selected snapshot. Foreign archive filenames and
symlink targets are never pruned. Telemetry write failure cannot change hook
safety. Existing large logs within the archive budget are preserved as one
segment on their first rotation; no migration command or second writer exists.

A valid handled event record has:

- protocol `loop-engine-hook-event/v1`;
- `runtime_entries: 1`;
- one ordered `in_process` handler step;
- `child_processes: 0` for typed route dispatch;
- `measurement.opaque_steps: []`.

The direct-child metric does not claim to count internal `git`, Bun, or OS
processes that a handler may use. File, durable-write, and transaction counts
are only evidence at boundaries where the handler supplies an explicit
observer. Consumers must inspect `complete_metrics` and
`incomplete_metrics`; they must not turn an unobserved file count into proof of
complete filesystem coverage or infer provider calls from the event record.
Telemetry append failure never changes hook safety, while malformed, duplicate,
or incomplete records must not be used as complete runtime evidence.
The telemetry reader reports invalid input, mixed protocols, and duplicate IDs.
The one-time diet report script is retired.

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
- `bun test tests/prompt-handler.test.ts tests/subagent-handler.test.ts`
- `bun test tests/command-observed.test.ts tests/trace-observer.test.ts`
- `bun run check:type`
- `bun run check:hooks`
- `bash scripts/check-architecture-sync.sh`

Historical canary observations remain in archived research and are not runtime
inputs. Current behavior is defined by the typed registry, installer projection,
and event protocol above.
