# OAR request correlation and runtime observation

Status: implemented in Draft PR [#741](https://github.com/Ancienttwo/repo-harness/pull/741).
The user approved request correlation, then approved the bounded snapshot correction on 2026-10-14.
The base is main at `89837e523a333022465986684fd58784e7a08c04`. OAR is pinned to `0.62.1` by merged PR #733.
This plan records the final implementation. The [deep integration plan](plan-20261014-oar-deep-integration.md) owns the remaining proposals.

## P1: Map

OAR owns runtime records, status and input-scoped turn results. Coding and review hosts own the Session. Task sessions own process bindings, TaskRequest and TaskResult. PM reads task sessions. Seatbelt owns child isolation.

Both hosts use `src/effects/terminal/task-runtime-observation.ts`. This shared module is part of the existing Task Agent Host capability. It adds no task store or native runtime parser.

## P2: Trace

PM saves a TaskRequest before delivery. The fixed host uses its canonical request UUID as OAR inputId. A rawEvents subscription folds each record once with SDK reduceStatus. The host atomically saves a closed typed snapshot. PM validates its schema and request, round and host identity before returning runtime_observation.

Only the current promptAndWait result sets outcome. An idle Session's prior outcome cannot set the new request's outcome. Result collection still validates the worker's separate TaskResult. OAR completion cannot authorize acceptance.

## P3: Decision

Replace production raw-log persistence and reader replay with protocol v2. Remove both v1 paths in the same change. Reject v1 captures; do not translate or replay their input.

Limit pretty JSON to 16 KiB. Bound strings and reject extra fields. Keep only identifiers, sequence, status, SDK phase, running start sequence, actual event time, outcome, failure class and prompt control result. Tool phase keeps the SDK tool name, call ID and writing flag. Do not save prompt text, reasoning, tool input or output, native payloads or error prose.

Normal writes are at least one second apart, measured with a monotonic clock. A trailing timer writes the latest event even if no next event arrives. Prompt end flushes immediately. Quiet periods do not write or advance event time. Missing capture and absent event time remain unavailable.

Read cost is constant per request. File size does not grow with token count. OAR's own retained log and total request history remain outside this bound. At ten times the task count, native runtime resources and per-task binding checks become the next costs.

## Recorded checks

- Typecheck passed. Both Node host bundles built.
- The four owning files passed: OAR public types 4, PM 62, Herdr lifecycle 12, generic review 22. Total: 100 pass, 0 fail.
- After tightening the timer boundary, the OAR file passed again: 4 pass, 0 fail. Final typecheck and both bundles passed again. The other three files did not change after their passes.
- The SDK fixture proves continuous-phase freshness, trailing flush, no quiet heartbeat, final flush, native input correlation, prior-outcome isolation and rejected prompt isolation. It also proves bounded storage under two MiB of text, closed schema rejection, identity fences, symlink rejection and timer write failure disposal.
- Raw-record replay tests moved to test-only SDK statusOf(session.records()) comparisons. Production fixtures now use the v2 fields. Result, delivery and cleanup assertions remain.
- ArchContext ChangeSet updates the existing capability responsibility. Ownership does not change. The projection is refreshed through the owned provider; its final check must report noop.

Evidence is retained under `/Volumes/D/verification/repo-harness/oar-runtime-observation/`, with `typed-snapshot-*` filenames and check subject hashes. These are scripted-library and real Herdr/OS fixtures. They are not live-provider acceptance.

## Closeout boundary

The PR stays Draft. A Claude read-only review of source and test changes remains required. This session is outside Herdr. The Herdr skill refuses control from outside its pane. No alternate review is recorded as that review.

No merge, release, credential copy, permission change, automatic retry, resume or provider turn is part of this work.
