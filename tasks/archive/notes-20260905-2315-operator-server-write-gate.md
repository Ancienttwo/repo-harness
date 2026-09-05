> **Archived**: 2026-09-05 23:15
> **Related Plan**: plans/archive/plan-20260905-1414-operator-server-write-gate.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-2315
> **Archive Projection V1**: `plans/plan-20260905-1414-operator-server-write-gate.md` => `plans/archive/plan-20260905-1414-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/notes/20260905-1414-operator-server-write-gate.notes.md` => `tasks/archive/notes-20260905-2315-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md` => `tasks/archive/contract-20260905-2315-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md` => `tasks/archive/review-20260905-2315-operator-server-write-gate.md`

# Implementation Notes: operator-server-write-gate

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-1414-operator-server-write-gate.md
> **Contract**: tasks/archive/contract-20260905-2315-operator-server-write-gate.md
> **Review**: tasks/archive/review-20260905-2315-operator-server-write-gate.md
> **Last Updated**: 2026-09-05 14:14
> **Lifecycle**: notes

## Design Decisions

- The collaboration identity assertion is one exported function applied at two
  call sites: the reader's own projection in `collaboration.ts`, and the worker
  payload in `server.ts` where the requested id is still in scope. Two call
  sites, one rule — the alternative was a second copy of the comparison on the
  transport side, which is exactly the drift the assertion exists to prevent.
- The refusal log lives in one `sendRefusal()` wrapper rather than inside
  `sendJson()`. `sendJson()` has no request in scope and also serves the 2xx
  responses, which must stay silent; routing every non-2xx through a named
  refusal helper makes the logged set the same set as the refused set.
- The write admission bound has no queue. Collaboration queues because several
  repositories can legitimately be observed at once; the board only ever has one
  send in flight, so a caller above the cap is not a browser waiting its turn.
- Write admission and collaboration admission read the same `max_concurrency`
  value but keep separate counters, so the aggregate child-process budget is
  2x `max_concurrency` plus the Fleet collector; that is deliberate, because the
  browser has at most one write in flight and the two paths bound unrelated
  workloads.

## Deviations From Plan Or Spec

- The plan sketched the API prefix match as `pathname.toLowerCase().startsWith('/api')`.
  The implementation keeps the existing prefix boundary and only makes it
  case-insensitive (`=== '/api'` or `startsWith('/api/')`). The bare prefix
  would also claim a static asset named `apidocs.html`, which widens the change
  beyond the stated goal that any case variant is an API 404.
- The route inventory gate lives in a new `tests/effects/operator-write-boundary.test.ts`
  rather than in `tests/cli/operator-serve.test.ts`. It is the only guard that
  needs symbols the fix introduces, so keeping it separate leaves the pre-fix
  artifact for the transport guards showing real assertion failures instead of a
  module-resolution error that would have hidden all of them.
- The collaboration identity mismatch cannot be produced through the registry:
  `readRepoHarnessRegistryStrictSnapshot()` already refuses an entry whose id is
  not derived from its canonical path, and the collector derives the snapshot id
  from that same path. The guard is therefore a direct assertion test plus a
  transport test that the typed code maps to a 500-class refusal with a fixed
  public sentence, not an end-to-end forged mismatch.
- Task Profile was promoted from the scaffold's `code-change` to `bugfix` so the
  Root Cause Evidence gate actually evaluates the captured pre-fix artifact.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Clear the shared Fleet observation at cancellation vs. keep it until settlement and let a retry wait | Clear at cancellation | The collector's abort path drains a grace period and then waits for a process group; a reload inside that window is a new reader, not a subscriber to the dying collection. This is what the collaboration path already does. |
| Attach the refusal log to `sendJson()` vs. a `sendRefusal()` wrapper | Wrapper | `sendJson()` also serves 2xx and has no request in scope; the wrapper makes the logged set exactly the refused set. |
| Per-resource `Allow` vs. one server-wide value | Server-wide `GET, HEAD, POST` | The approved decision; the refusal already names which route accepts what in its message. |

## Open Questions

- None.

## Evidence Links

- Pre-fix artifacts: `.ai/harness/evidence/pre-fix/operator-serve.test.log`,
  `.ai/harness/evidence/pre-fix/operator-write-boundary.test.log`
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
