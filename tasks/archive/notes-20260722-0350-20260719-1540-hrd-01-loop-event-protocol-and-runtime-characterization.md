# Implementation Notes: hrd-01-loop-event-protocol-and-runtime-characterization

> **Status**: Active
> **Plan**: plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md
> **Contract**: tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md
> **Review**: tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md
> **Last Updated**: 2026-07-19 17:05
> **Lifecycle**: notes

## Design Decisions

### Route -> `LoopEvent` kind derivation (the Falsifier's three least-obvious cells)

`routeToLoopEvent` in `src/core/loop/loop-event-protocol.ts` maps all 11 route
tuples onto the 8 kinds without any host-specific branch, so the Falsifier is
not tripped. The three cells the contract names as least obvious:

- `PostToolUse.always` (`post-tool-observer.sh`, fires on every tool with no
  matcher) -> `command_observed`. It is a generic "a tool call was observed"
  event; `command_observed`'s shape (`command`, `exitCode`, `outputRef?`) is
  the only kind generic enough to represent an arbitrary tool outcome rather
  than a file mutation, so it is the natural catch-all, not
  `mutation_observed` (which requires edit-specific `changedPaths`).
- `SubagentStart.context` (Codex-only) -> `subagent_started`. Direct match:
  this route fires exactly when a subagent starts.
- `SubagentStop.quality` (Codex-only) -> `subagent_stopped`. Direct match:
  this route fires exactly when a subagent stops and its report is graded.

The remaining, less contentious cells: `PreToolUse.subagent` (guards
Task/Agent spawn *and* blocks a subagent's own `SendUserMessage`) is scoped
to `subagent_started` because it is the Pre-guard for subagent-related tool
*requests*, paralleling how `PreToolUse.edit` is a request-time
`mutation_requested` guard rather than an after-the-fact observation.
`UserPromptSubmit.delegation` (Codex-only) shares `prompt_submitted` with
`UserPromptSubmit.default` -- both routes fire on the same underlying event
(a user prompt was submitted), differing only by which host-specific script
handles it. All 8 kinds are reachable from at least one route (asserted by
`tests/loop-event-protocol.test.ts`), and 11 routes onto 8 kinds is
deliberately non-injective (several routes legitimately share a kind).

### `LoopEventResult` field set: no `state`/`readiness`/`contextPacket`/`checkpoint`

The audit §6 draft's `LoopEventResult` also carries `state: EffectiveStateV1`,
`readiness: Readiness`, `contextPacket?`, and `checkpoint?`. The contract's
own enumerated shape for this package is narrower: `protocol: 1`, `eventId`,
`decision` (verdict/reasons/nextAction), `effects`, `telemetry` counters --
it does not list a state/readiness surface. Per EXECUTION_BOUNDARY, the
narrower, explicit list governs: adding those four extra fields would be
unrequested design space this package was not scoped to fill (they belong to
whichever HRD row actually threads `EffectiveStateV1`/`Readiness` through).
Correspondingly, the contract's example type-only import
(`EvaluateReadinessResult` from `operation-readiness.ts`) is *not* used here:
nothing in the contract's literal `LoopEventResult` field list has a natural
slot for it, and importing it only to satisfy the "allowed" language would be
speculative wiring with no consumer. `HookEvent`, `RouteId`, and `RouteHost`
from `route-registry.ts` *are* imported (type-only) and used directly --
`RouteHost` as every `LoopEvent` variant's `host` field type, `HookEvent`/
`RouteId` as `LoopRouteTuple`'s field types -- since the contract explicitly
asks the mapping to "consume the registry's exported types."

### Totality mechanism: explicit tuple array + test-side registry cross-check, not a compile-time-exhaustive `Record`

`routeToLoopEvent` is `readonly LoopRouteTuple[]`, not a
`Record<RouteKey, LoopEventKind>` keyed by a hand-authored 11-member string
union. A `Record` would give stronger *compile-time* totality (TS errors on
a missing/extra key), but its keys would be flat string literals with no
type-level tie back to `HookEvent`/`RouteId` (a typo would compile silently
until the test caught it -- no stronger than the array in practice) and it
would not "consume the registry's exported types" as directly. The array's
`{event, routeId, kind}` objects typecheck each field against the real
`HookEvent`/`RouteId` unions via ordinary structural typing (a misspelled
event/routeId is a compile error), while `tests/loop-event-protocol.test.ts`
owns the actual totality proof by cross-checking the array's key set against
the live `ROUTES` export (count, no duplicates, exact match) -- which is
also exactly the split the contract's own deliverable list assigns (module:
explicit data; test: "route-mapping totality... vs the registry's ROUTES").
This keeps the module free of type-level machinery (`satisfies` assertions,
template-literal cross-products) that would read as "clever generation"
rather than "explicit typed data" per the contract's taste constraint.

### Characterization harness: capturing host-visible output requires a subprocess boundary

`RunHookResult` (the return value of `runHook()`) does not surface captured
child stdout/stderr -- for the common (Claude, non-SessionStart) case,
`runHook()` internally captures the spawned script's output into
`child.stdout`/`child.stderr` and immediately re-`writeAllSync`s it to the
*caller's own* real fd 1/2, then discards it; nothing is returned. An earlier
grep confirmed no existing test in this repo calls `runHook()` in-process
with default (`undefined`) `stdio` and asserts on real output for this
reason (`tests/cli/hook.test.ts` only does so for three early-exit paths that
never reach the write). To observe genuine host-visible output the way a
real host does, `tests/hook-runtime-characterization.test.ts` invokes
`runHook()` inside a `bun -e` wrapper subprocess (dynamic `import()` of
`src/cli/hook/runtime.ts` by file URL, no new file on disk) and captures
*that* subprocess's real stdout/stderr via the outer `spawnSync`'s
`encoding: 'utf-8'` result -- the same process boundary a real host adapter
crosses when it spawns the hook CLI. The wrapper is invoked via the
absolute, unstubbed real bun binary path (`process.execPath`) rather than
the bare `bun` name, specifically so the PATH-stub directory (below) does
not also count the wrapper's own launch as a route-internal child process --
only the nested `bash <script>.sh` -> `bun`/`git` calls the route's own
scripts make go through the stub.

### PATH-instrumented stubs classify by argv, not by logging raw argv

`git`/`bun` stubs in a directory prepended to `PATH` append one
classification word (`git`, `cli`, or `generic`) per invocation to a shared
log, then `exec` the real binary (resolved once via `process.execPath` for
bun and `which git` for git) so the route's actual behavior is unaffected.
The classification decision (does any arg end in `/cli/index.ts` or
`/cli/hook-entry.ts`?) happens *inside* the stub, before logging -- the log
never contains raw argv. This was a deliberate fix after a first attempt
logged `"bun $*"` directly: inline `bun -e '<multi-line JS>'` invocations
(used throughout `assets/hooks/*.sh` for JSON glue, e.g.
`hook_json_extract_with_bun`) embed literal newlines in their argv, which
corrupted line-oriented log parsing (an invocation's script body could
itself contain lines that looked like new log entries). One-word-per-line
classification records sidestep this entirely.

### `jq` is not stubbed, hidden, or normalized -- its presence is treated as an existing environment precondition

Grep found 30+ `command -v jq`-conditioned branches across `assets/hooks/`,
including one hard dependency
(`subagent-return-channel-guard.sh:72: command -v jq >/dev/null 2>&1 || exit
0`) whose *outcome*, not just its mechanism, differs by jq's availability.
Rather than building PATH-shadowing machinery to force a jq-absent baseline
(rejected: `jq` shares `/usr/bin` with essential coreutils on macOS, so
excluding jq's PATH entry would also remove `sed`/`awk`/`cut`/`curl`/etc.;
a symlink-forest workaround to shadow only `jq` was considered and rejected
as compensating complexity disproportionate to the problem), this
characterization lets `jq` resolve via the normal inherited `PATH`, exactly
like every other existing test in this suite already does implicitly.
`tests/hook-runtime.test.ts`'s own "subagent-return-channel-guard: appends
spawn contract and blocks subagent SendUserMessage" test already exercises
real JSON output from that same jq-gated script and would be equally
meaningless on a jq-less machine -- confirming "jq present" is pre-existing
repo-wide test-suite baseline, not a new assumption this package introduces.

### Determinism is engineered at the input side, not patched in after the fact

Three sources of nondeterminism were found and closed at the source rather
than normalized post hoc (the contract permits normalizing only path/time/
PID, and a couple of these are neither):

- Session/run identifiers: `session_state_new_session_id()` in
  `assets/hooks/lib/session-state.sh` prefers `uuidgen`, falling back to
  `/dev/urandom` entropy -- pure randomness with no time/PID structure, so it
  is *not* normalizable under the contract's rule. `HOOK_SESSION_ID` /
  `CLAUDE_SESSION_ID` / `HOOK_RUN_ID` are pinned to fixed literal strings for
  every route invocation, which every checked call site prefers before
  generating anything, so the random path is never reached.
- Git commit hash: the fixture repo's one commit pins
  `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`/name/email, so its hash is a pure
  function of fixed inputs and reproduces byte-for-byte on any machine --
  no hash normalization needed.
- Residual wall-clock timestamps, elapsed-ms fields, and the fixture's own
  `mkdtemp` root path (unavoidably different every run by OS design) *are*
  normalized via regex/substring replacement in `normalize()` -- squarely
  path/time data, explicitly permitted. Verified deterministic across 5
  consecutive full `bun test tests/hook-runtime-characterization.test.ts`
  runs on this machine before freezing the fixture.

### Fixture repo is deliberately minimal, not a curated "happy path"

The fixture repo has no `docs/spec.md`, no active plan, and no contract --
just an initial commit and the installed hook projection. This is a
legitimate, deterministic "freshly adopted repo" baseline, not an oversight:
`PreToolUse.edit`/`PostToolUse.edit` on `src/example.ts` genuinely resolve a
non-`lite` workflow profile in this minimal state and `PreToolUse.edit`
therefore hits `SpecGuard` and blocks (exit 2, `script-failed`) rather than
allowing -- this is real, current, reproducible behavior, and the contract
asks to freeze *whatever* current behavior is, not an idealized happy path.
Every other stdin payload was drawn from an existing passing scenario in
`tests/hook-runtime.test.ts` or `tests/cli/hook.test.ts` rather than
invented, so each route's captured behavior is independently cross-checked
against a scenario already known to be a valid, working invocation shape.

### Host choice per route

The 3 Codex-only routes (`UserPromptSubmit.delegation`, `SubagentStart.context`,
`SubagentStop.quality`) are exercised with `HOOK_HOST=codex` (their only
valid host per `route-registry.ts` `hosts`); the other 8 use `claude`,
matching `tests/state/loop-semantics-characterization.test.ts`'s
`isolatedEnv()` default. This is one host per route (11 records total), not
a full host x route parity matrix -- the contract's own edge-case note treats
"per-host output-routing differences... recorded as data" as in scope for
*this* package only insofar as each route characterizes cleanly under its
one exercised host; a full host-parity fixture is named later-sprint work
("host-parity fixtures" in the sprint's Design Decision section), not HRD-01.

## Deviations From Plan Or Spec

- None. The plan's captured planning output left `LoopEvent`/`LoopEventResult`
  field shapes and the characterization record schema unspecified beyond the
  contract's literal list; both were derived from the contract text plus the
  audit §6 draft as described above, not invented independently.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `Record<RouteKey, LoopEventKind>` for `routeToLoopEvent` | Rejected | Stronger compile-time totality but weaker tie to `HookEvent`/`RouteId` types and no clearer than the array + test-side registry cross-check the contract's own deliverable split already asks for |
| Copy `LoopEventResult`'s audit-draft `state`/`readiness`/`contextPacket`/`checkpoint` fields | Rejected | Not in the contract's literal enumerated field list; EXECUTION_BOUNDARY treats the narrower list as authoritative |
| Force a jq-absent baseline via PATH shadowing | Rejected | `/usr/bin` co-hosts jq with essential coreutils on macOS; a symlink-forest workaround is compensating complexity disproportionate to the problem, and the rest of this test suite already assumes jq's presence |
| Log raw stub argv for bun/git invocation counting | Rejected after first attempt | Inline `bun -e` script bodies embed newlines that corrupt line-oriented log parsing; switched to in-stub classification + one-word-per-line records |
| Curate the fixture repo with `docs/spec.md`/an active plan to get an "allow" edit baseline | Rejected | The contract asks to freeze current behavior, not an idealized one; the minimal fixture's real, deterministic `SpecGuard`-block outcome is equally valid frozen evidence |
| Record `matcher`/`hosts` route metadata and a redundant `process_exit_code` field in each characterization record | Rejected (trimmed after first draft) | Restates `route-registry.ts` data / duplicates `RunHookResult.exitCode`; kept `host_exercised` (methodologically necessary, not a registry restatement) and replaced `process_exit_code` with an inline `expect()` invariant check instead of a frozen field |

## Open Questions

- None. The Falsifier's three named least-obvious cells all mapped onto
  existing kinds without a host-specific branch, so the host-neutral
  protocol direction is not falsified by this package.

## Remaining Work For Successors

- HRD-02 (`StateInputCollector`) and the handler cutovers (HRD-03..09) are
  the actual consumers of `LoopEvent`/`LoopEventResult`/`routeToLoopEvent`;
  this package wires nothing.
- A full host x route parity fixture (both hosts against every
  host-agnostic route) is out of scope here; see the sprint's "host-parity
  fixtures" note under Design Decision for where that work lands.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
