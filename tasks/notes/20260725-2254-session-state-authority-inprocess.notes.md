# Implementation Notes: session-state-authority-inprocess

> **Status**: Complete
> **Plan**: plans/plan-20260725-2254-session-state-authority-inprocess.md
> **Contract**: tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md
> **Review**: tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md
> **Last Updated**: 2026-07-26 10:18
> **Lifecycle**: notes

## Design Decisions

- `session-context-budget.ts` owns the closed nine-provider vocabulary, stable error hashing,
  ordering, and one-entry-per-provider normalization. The runtime and advisory providers only emit
  typed diagnostics into the event sink.
- SessionStart retries the same two transient resolver signatures as PreEdit, but each adapter owns
  its terminal mapping: PreEdit retains null/non-transient versus rethrow/residual-transient;
  SessionStart maps both terminal failure classes to mandatory unavailable context plus evidence.
- `provider_diagnostics` is failure-only and excluded from content identity. A diagnostic-only event
  still invokes the budgeter and persists evidence, while a healthy protocol-1 evidence object has
  the exact pre-change serialized shape.

## Deviations From Plan Or Spec

- The captured design originally described SessionStart as an `inspect` resolve. The deterministic
  pre-change fixture falsified that assumption: `repo-harness state resolve --json` passes no
  operation or profile override, so `operationKind: 'inspect'` changed the fixture from blocked/null
  profile to executing/standard. The implementation and authoritative design were corrected to a
  CLI-equivalent empty risk input. Hook-only `REPO_HARNESS_WORKFLOW_PROFILE` is deliberately not
  consumed by this path because the retired CLI command did not pass `--profile`.
- The duplicated Detailed Design / Risk / Verification material in Captured Planning Output was
  removed before production edits. Template-level sections remain the sole design authority;
  Captured Planning Output now retains only Goal, Scope, Root Cause, Due Diligence, and Deferred.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Pass `operationKind: 'inspect'` in-process | Rejected after fixture | It is semantically cleaner but not behavior parity with the retired CLI invocation. |
| Read hook profile env for SessionStart | Rejected | The old subprocess inherited the env but the state CLI did not translate it into `--profile`; using it would be a hidden behavior change. |
| Add diagnostic data to content hash | Rejected | Diagnostics describe production failure, not model content; including them would break healthy/dedupe identity semantics. |
| Instrument internal helper spawns as `child_processes` | Rejected | HRD-08 freezes the metric as direct route-runtime children and excludes internal Git/Bun plumbing. |

## Open Questions

- None.

## Verification Observations

- The strict verifier twice reported only its aggregated `bun test` command as exit 1 while deleting
  the child log. The same checkout passed an independent full run (2078 pass, 1 skip, 0 fail), then
  passed the verifier's exact detached bounded runner (2078 pass, 1 skip, 0 fail). A final exact
  verifier sequence with its temporary directory preserved passed all 35 criteria, including the
  full suite in 504646 ms, and promoted the contract to `Fulfilled`. No failing test or product
  behavior reproduced, so no production change was made in response to the two unattributed runs.
- The full verification also passed `bun run check:type`, deploy SQL ordering, architecture sync
  (advisory with zero blocking drift), task sync, strict workflow validation, project-state
  inspection, adopt dry-run with zero operations, and `git diff --check`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix guard: `.ai/harness/runs/session-state-authority-inprocess-pre-fix.log`
- Healthy pre-change fixture: `tests/fixtures/session-start/state-authority-baseline.json`
- Focused matrix: `tests/session-state-authority.test.ts`, `tests/session-context.test.ts`,
  `tests/harness-context-budget.test.ts`, `tests/hook-runtime-characterization.test.ts`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
