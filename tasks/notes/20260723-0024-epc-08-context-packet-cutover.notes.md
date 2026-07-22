# Implementation Notes: epc-08-context-packet-cutover

> **Status**: Active
> **Plan**: plans/plan-20260723-0024-epc-08-context-packet-cutover.md
> **Contract**: tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md
> **Review**: tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md
> **Last Updated**: 2026-07-23 00:24
> **Lifecycle**: notes

## Design Decisions

- Goal 1's inventory (recorded in the contract) found exactly ONE
  primary-source re-derivation in `session-context.ts`: `resumeAvailable()`'s
  marker/header string-scan of the rendered resume.md. Every other read is
  either already a canonical-projection read (handoff/resume view files,
  `tasks/current.md`) or a legitimate direct read of a tracked subsystem's
  own source of truth (plan status, todos, capability/architecture queues,
  sprint backlog, tooling advisory cache, delegation/minimal-change policy).
  Cut over to `resolveRecoveryEvidence(repoRoot).available`
  (`src/effects/evidence/recovery-materializer.ts`, read-only import).
- The sprint's "materialized checks/latest for verification state" and
  "tasks/current.md for the derived snapshot" Goal-2 bullets were both
  already satisfied before this package started: the former by the
  pre-existing `effective-state` section (`runtime.ts`, sourced from
  `resolve-effective-state.ts`'s own `CHECKS_PATH` constant pointing at the
  same materialized file `checks-materializer.ts` writes), the latter by
  `currentStatusSnapshotContext`. Neither required a code change; adding a
  duplicate verification-state section to `session-context.ts` itself would
  have been an unrequested extra.
- Panel measurement runner (`scripts/session-context-packet-panel.ts`) is a
  new sibling script to `scripts/hook-dispatch-diet-report.ts` (HRD-08), not
  an extension of it -- kept separate to avoid touching that script's own
  tested surface (`tests/hook-dispatch-diet-report.test.ts`,
  `tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts`). It mirrors
  (does not import) that script's `percentile()`/token-estimator/
  synthetic-subprocess-probe shape, and mirrors (does not import)
  `tests/state/effective-state-fixture.ts`'s fixture-builder shape --
  neither is exported, and no script in this repo imports from `tests/`
  (`tsconfig.json`'s `include` never even covers `scripts/**`), so this
  follows the repo's own established "small helper duplicated across a
  layer boundary" convention (`recovery-materializer.ts`/
  `checks-materializer.ts`).
- The panel renders the FULL SessionStart packet (effective-state +
  post-edit-journal + `buildSessionStartSections()`'s three sections, all
  budgeted) via the real `bun src/cli/hook-entry.ts SessionStart --route
  default` subprocess against a freshly git-initialized fixture repo per
  (authority, profile) cell -- not just `session-context.ts`'s own output --
  since that is what a live host actually receives, and it is exactly what
  `hook-dispatch-diet-report.ts`'s own `session_start_context` probe already
  measures for this same packet.

## Deviations From Plan Or Spec

- None. The plan's Goal 1 inventory-first sequencing was followed exactly:
  contract inventory recorded before any Phase B (cutover) edit; the red
  test run (32 pass / 3 fail, all three tied directly to the not-yet-applied
  cutover) was captured before applying the code change.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Extend `hook-dispatch-diet-report.ts` in place for the panel | Rejected; new sibling script | Different measurement shape (27-state grid vs. dispatch/phase-probe/runtime-evidence); avoids risk to that script's own characterized tests |
| Import `tests/state/effective-state-fixture.ts` fixture builder from the new script | Rejected; duplicated the fixture shape instead | No script in this repo imports from `tests/`; `tsconfig.json` never typechecks `scripts/**`; matches this repo's existing small-helper-duplication convention |
| Also cut over `resumeCurrentForHandoff`'s mtime comparison to the checkpoint reader | Rejected; kept as-is | It is a same-materializer-pass plumbing check (was resume written in the same/later pass as handoff), not an evidence claim; EPC-07 already made both views one atomic write so it is nearly always true by construction |
| Add a new verification-state section to `session-context.ts` reading `checks/latest.json` directly | Rejected; not needed | The delivered packet already sources verification state canonically via the pre-existing, out-of-scope `effective-state` section; adding a second one would be an unrequested extra |

## Open Questions

- None blocking. One observed-but-not-diagnosed-further artifact: the
  `corrupt-policy` panel state renders a deterministic EMPTY (0-token)
  packet, same as `no-plan`, even though it retains an active plan/contract.
  Tracing this fully would require entering `resolve-effective-state.ts`'s
  own policy-parsing path, which is out of this package's owned surface (not
  `session-context.ts` or a named collaborator); the observed behavior is
  safe (fail-closed to an empty, well-under-budget packet, exit code 0, no
  crash), so it is recorded here rather than chased further.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Panel report: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.panel.md`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
