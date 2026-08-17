# Implementation Notes: lite-enforce-gap

> **Status**: Active
> **Plan**: plans/plan-20260818-0133-lite-enforce-gap.md
> **Contract**: tasks/contracts/20260818-0133-lite-enforce-gap.contract.md
> **Review**: tasks/reviews/20260818-0133-lite-enforce-gap.review.md
> **Last Updated**: 2026-08-18 01:33
> **Lifecycle**: notes

## Design Decisions

- **The lite × enforce intersection is non-empty; this was a real swallow, not a theoretical one.** The deterministic risk floor stays `lite` unless a strict category, cross-capability, `feature`, or medium scope fires (`src/core/workflow/profile.ts:256-273`, with `MEDIUM_TARGET_PATH_COUNT = 4` at `:127`). A single `package.json` edit clears all four: its token set is `{package, json}`, which misses every entry in `STRICT_CATEGORY_TOKENS` (`profile.ts:104-113`); it is not a workflow surface, so it counts as one implementation path (`src/effects/review/diff-fingerprint.ts:399-401`); one capability, `operationKind: 'edit'`. That same edit is exactly what produces a `review` verdict: `manifestKind`/`dependencySignals` (`src/cli/hook/minimal-change-signals.ts:540-545`) emit a `dependency` finding (`:398-408`) and `verdict = findings.length > 0 ? 'review' : 'lean'` (`:589`). The abstraction lane is even wider — a filename containing adapter/factory/manager/wrapper, an `interface` or `abstract class`, or one small forwarding function (`:355-377`) — so an ordinary single-file `src/` edit also lands in lite × review.
- **The two file sets were never the same set anyway.** Stop's report is the per-path artifact the PostEdit observer last wrote (`minimal-change-signals.ts:510-513,571`, `base_ref` default `HEAD` at `:493`); Stop only reads that file back (`src/cli/hook/minimal-change-cli.ts:56-85`). The profile is derived from `explicitTargetPaths ∪ reviewSubject.paths` — a diff against `review_base`/`main` — then filtered to implementation surfaces (`src/effects/state/resolve-effective-state.ts:545-552,565`). Different diff bases and different scopes, so even without the single-file witness the two sets can arbitrarily disagree. Any fix keyed on "profile already tells us the change is small" would have been unsound.
- **The gate moved above the lite early return because a `review` verdict is a property of the change, not of the ceremony level.** Growth (a new dependency, a new abstraction) is orthogonal to workflow profile, and lite is where it hides best. The gate keeps all of its own lazy exits — non-enforce mode, non-`review` verdict, missing report, missing fingerprint all return `null` (`src/cli/hook/stop-handler.ts:552-561`) — so a lite session with nothing to audit stays byte-for-byte silent. `tests/stop-handler.test.ts` pins both halves: the block and the silence.
- **Advice mode now also prints its hint under lite, and that is intended.** The hoist moves the `[MinimalChange] Non-blocking review` summary above the lite early return, so a lite turn with findings gains a stderr line it never used to get. This is the same swallow seen from the other side: advice mode means "surface the hint on every profile", and lite silence was never a considered decision — it was a side effect of where the review sat. Advice still never blocks (stdout stays empty). Pinned by `tests/stop-handler.test.ts` ("a lite profile still gets the advice-mode review hint").
- **`profile` resolution gained an explicit `'lite'` arm.** Previously lite fell through to the `'strict'` fallback, which was harmless only because lite could never reach the gate. Now it can, and that value is the circuit-breaker key (`stop-handler.ts:566-577`), so lite must key as lite rather than borrow strict's budget.
- **The gate now precedes `planCompletenessBlock`, and that is forced, not chosen.** Any placement that makes the gate reachable under lite must sit above the lite early return, which is itself above the plan gate. When both would block, the minimal-change gate now wins. No third ordering exists.
- **The loop-semantics ordering golden was refreshed under explicit authorization.** `observedSourceOrder` (`tests/state/loop-semantics-characterization.test.ts:403-418,701-705`) freezes *source position*, so `minimal_change_review` moving above `lite_early_exit` flips three stop cells in `tests/state/fixtures/loop-semantics/characterization.json`. That flip is not incidental drift — it is the semantic body of this fix, and a golden that still recorded the old order would be asserting the bug. Refreshed with `UPDATE_LOOP_SEMANTICS_GOLDEN=1`, then re-run without the env to confirm green; the diff is exactly the three `ordering` arrays and nothing else (plan frozen decision 4).

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Document the gap as unreachable (route A) | Rejected | The intersection is non-empty; a single-manifest or single-source edit reaches `review` under lite. Documenting it would have frozen a false invariant. |
| Duplicate a lite-only gate call at the early return | Rejected | Two call sites means two authorities for one decision, and the second would drift. Hoisting the single call is smaller and keeps one source of truth. |
| Keep the gate below `planCompletenessBlock` to preserve block precedence | Not available | Reachability under lite forces the gate above the lite early return, which is above the plan gate. The precedence change is a consequence, not a preference. |
| Leave the ordering golden untouched | Rejected (authorized) | No fix exists that keeps the recorded order; an unrefreshed golden would encode the swallow as expected behavior. |

## Open Questions

- The installed global runtime predates this fix, so the installed-layer behavior baseline still reflects the swallow. Repackaging and reinstalling is a separate slice; nothing here depends on it.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
