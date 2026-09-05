> **Archived**: 2026-09-05 14:53
> **Related Plan**: plans/archive/plan-20260905-0342-review-boundary-repairs.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-1453
> **Archive Projection V1**: `plans/plan-20260905-0342-review-boundary-repairs.md` => `plans/archive/plan-20260905-0342-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/notes/20260905-0342-review-boundary-repairs.notes.md` => `tasks/archive/notes-20260905-1453-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0342-review-boundary-repairs.contract.md` => `tasks/archive/contract-20260905-1453-review-boundary-repairs.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0342-review-boundary-repairs.review.md` => `tasks/archive/review-20260905-1453-review-boundary-repairs.md`

# Implementation Notes: review-boundary-repairs

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-0342-review-boundary-repairs.md
> **Contract**: tasks/archive/contract-20260905-1453-review-boundary-repairs.md
> **Review**: tasks/archive/review-20260905-1453-review-boundary-repairs.md
> **Last Updated**: 2026-09-05 03:42
> **Lifecycle**: notes

## Design Decisions

- Controller reads the existing immutable DelegatedRun intent/admission/envelope chain before reserving budget. No second dispatch authority is introduced.
- WorkDemand publication intent and receipt are fsynced before Git CAS under a demand-scoped common-directory lock. Recovery reuses the exact commit; it does not infer a replacement from a moved target.
- Refactor uses complete accepted Recommendation payloads at materialization and the existing begin_plan Program digest afterward. Execution binding reads the verifier-owned receipt store and requires the verified PR head verbatim.
- Board evidence binds a single final-main HEAD, while merge ancestry is checked independently for each PR. The measured HEAD participates in Board identity.
- Stop uses one 20-second deferred-work deadline. Host-budget exhaustion leaves projection work pending without consuming the three business attempts; explicit CLI drain retains the longer policy budget. Existing strict gates are preserved.
- The new root and generated verification rules distinguish docs/ledger, isolated code, and high-risk/shared/runtime changes. This work-package remains full-suite scope; its own gate is not weakened.

## Deviations From Plan Or Spec

- Campaign post-merge continuation cannot be safely enabled: events contain untyped evidence references and have no authoritative join to owned publication receipts. This work-package repairs inspection/termination and keeps execution fail-closed.
- Archctx 0.5.6 generic openSession digest traverses nested worktrees before applying its projection profile. The consumer has no supported exclusion knob. Bound local waiting/children, but do not patch installed third-party code or misattribute this to CodeGraph.
- providerStage and routeReasonCodes remain a provenance gap because accepted Recommendation readback lacks the assessment's scaleReasonCodes. These fields do not grant execution authority; no local semantic derivation is added.
- Main advanced independently from 41f52197 to 09593083 during work, including agent-fleet routing, BRC4 and a root-only risk-scoped checks change (ded35086). Do not overwrite or silently absorb those commits; integration must be reviewed against the new baseline.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Recompute receipts on recovery | Reject | A fresh commit or timestamp would create a second publication identity after CAS. |
| Allow Campaign target ancestry alone | Reject | An unrelated merge can satisfy ancestry without belonging to this Campaign. |
| Increase Stop timeout or disable strict gates | Reject | It masks latency or weakens acceptance; preserve queued work and bound execution instead. |
| Add CodeGraph exclusions | Reject | The failing .md stat is in Archctx's generic digest, not CodeGraph scanning. |

## Open Questions

- The worktree currently has an unresolved architecture projection candidate/dead-letter. Its exact recovery/approval requirement must be resolved before a clean architecture gate or merge claim.
- Installed global hook refresh remains separate from source tests; do not claim the active runtime consumes the fix until the managed installation is verified.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Authoring dependency boundary repair

- root_cause: gpt-pro-issue-authoring.ts directly imported CLI binding, engine and type modules and selected default browser implementations inside the effect.
- repro: `bun run check:state-boundaries` failed on all three imports at baseline `2016393c` (also reproduced after main integration).
- regression_guard: `tests/effects/gpt-pro-issue-authoring.test.ts`, injected binding authority case; existing `scripts/check-state-boundaries.ts` remains the repository-wide layer guard.
- pre_fix_failure_artifact: `/tmp/review-boundary-authoring-port-red.log`; the test failed before source edits because the effect ignored injected binding and read the removed local file.
- P1/P2/P3: CLI is the composition owner; the effect validates Campaign and binding before intent persistence, then invokes exactly the injected browser action. Required capabilities eliminate effect-to-CLI defaults. Structural port types bind only fields consumed or supplied by the effect; generic results preserve the concrete browser result without copying or changing provider-owned data. At 10x callers, browser/provider capacity remains the first limit; injection adds no storage or runtime lookup.
