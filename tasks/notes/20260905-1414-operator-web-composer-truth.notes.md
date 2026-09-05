# Implementation Notes: operator-web-composer-truth

> **Status**: Active
> **Plan**: plans/plan-20260905-1414-operator-web-composer-truth.md
> **Contract**: tasks/contracts/20260905-1414-operator-web-composer-truth.contract.md
> **Review**: tasks/reviews/20260905-1414-operator-web-composer-truth.review.md
> **Last Updated**: 2026-09-05 14:14
> **Lifecycle**: notes

## Design Decisions

- The new lease-state cards live in a separate `leaseStateSnapshot` rather than
  inside `stableSnapshot`. Several suites assert `stableSnapshot`'s exact card
  lists and group counts; appending to it would have rewritten those assertions
  without changing what they prove.
- `composer.held.bound` exists because a claim can appear after a task-scoped
  draft was frozen. Without its own sentence that transient would reuse another
  lease state's copy, which is the class of defect this work package removes.
- The disabled send button sets `opacity: 1` and its own neutral pair. The
  shared `.operator-button:disabled` alpha composites the control against the
  panel and turns a 5.4:1 pair into 2.6:1, so the token choice alone could not
  hold AA there.
- Fixture identity is derived arithmetically (reversed seed for the revision
  digest, a seed-shaped UUID for the claim) instead of by hashing, because
  `fixture.ts` reaches the browser bundle and must not pull in Node `crypto`.
- `clientApiError` builds the browser's own typed errors out of the dictionary,
  so a code has exactly one English sentence instead of one in the constant and
  one in the copy table.
- `--carrot-500` was removed rather than left defined: once hover moved to
  `--carrot-800` no rule referenced it. The brand orange itself still lives in
  `marks.tsx`, which the brand-literal guard whitelists.

## Deviations From Plan Or Spec

- The plan lists the decoder-valid fixture as an implementation step. It landed
  in the RED commit instead, so each guard fails on its own defect rather than
  on a module that cannot load. The pre-fix artifacts show 15 named failures
  across the four files, not one import error.
- The footer's `observe-only · one write: task message` literal stays
  untranslated. The plan's finding names only `OPERATOR_WRITE_BOUNDARY`, and
  `operator-interactions.test.tsx` pins that footer string in `zh` as a
  deliberate untranslated contract.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rename the scope for a non-bound live claim to `claim` | Rejected | `src/effects/fleet/task-inbox.ts:718` fails `recipient_unavailable` unless the lease is `bound`; the scope was already right and only the copy lied |
| One generic "held elsewhere" sentence | Rejected | A generic branch is how `reserving` and `released` came to share copy in the first place; exhaustive `Record`s over the lease-state union fail typecheck when the protocol grows |
| Keep `.composer__send` on `--carrot-600` and lighten the text | Rejected | `--text-inverse` is already the lightest paper token; only a darker carrot clears 4.5:1 |
| Confirm dialog before Escape closes a draft | Rejected | Browser modal dialogs are forbidden by the design brief and the automation contract |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix failures: `.ai/harness/evidence/pre-fix/operator-{interactions,ui,collaboration}.log`
  and `.ai/harness/evidence/pre-fix/operator-web-types.log`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
