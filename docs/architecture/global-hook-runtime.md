# Global Hook Runtime

> **Status**: HRD-09 — legacy host-event runtime retired (2026-07-21)
> **Authority**: `src/cli/hook/route-registry.ts` and `src/cli/hook/runtime.ts`
> **Adapters**: `src/cli/installer/managed-entries.ts`

This document describes the current host-event boundary. The user-level Codex
and Claude adapters are only transport configuration. The route registry and
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
3. `ROUTES` contains the 11 public `(event, routeId, matcher)` tuples. Every
   tuple has exactly one `handler`; there is no `scripts` field and no Bash
   host-event dispatcher.
4. `handler-registry.ts` runs one typed in-process handler. `runtime.ts` owns
   host output shaping and writes one event-level telemetry record.

The only shell file left in the hook projection is
`assets/hooks/lib/workflow-state.sh` (mirrored to `.ai/hooks/lib/`). It is an
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
| `UserPromptSubmit` | `delegation` | Codex only | `subagent` |
| `SubagentStart` | `context` | Codex only | `subagent` |
| `SubagentStop` | `quality` | Codex only | `subagent` |
| `Stop` | `default` | all | `stop` |

The event result is fail-closed for unknown routes and missing handler
bindings. A non-git or non-opt-in repository exits quietly without creating a
runtime event record.

## Telemetry contract

`src/cli/hook/event-telemetry.ts` is the sole writer for
`.ai/harness/runs/hook-events.jsonl`. A valid handled event record has:

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
or incomplete records fail closed in the diet report.

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
