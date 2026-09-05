> **Archived**: 2026-09-05 23:15
> **Related Plan**: plans/archive/plan-20260905-1414-operator-web-composer-truth.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260905-2315
> **Archive Projection V1**: `plans/plan-20260905-1414-operator-web-composer-truth.md` => `plans/archive/plan-20260905-1414-operator-web-composer-truth.md`
> **Archive Projection V1**: `tasks/notes/20260905-1414-operator-web-composer-truth.notes.md` => `tasks/archive/notes-20260905-2315-operator-web-composer-truth.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1414-operator-web-composer-truth.contract.md` => `tasks/archive/contract-20260905-2315-operator-web-composer-truth.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1414-operator-web-composer-truth.review.md` => `tasks/archive/review-20260905-2315-operator-web-composer-truth.md`

# Task Review: operator-web-composer-truth

> **Status**: Complete
> **Plan**: plans/archive/plan-20260905-1414-operator-web-composer-truth.md
> **Contract**: tasks/archive/contract-20260905-2315-operator-web-composer-truth.md
> **Notes File**: tasks/archive/notes-20260905-2315-operator-web-composer-truth.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 14:14
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0f137507

## Human Review Card

- Verdict: pass
- Change type: frontend
- Intended files changed: `src/operator-web/{App.tsx,i18n.ts,types.ts,styles.css,fixture.ts}`,
  `tests/operator-web/{operator-ui,operator-interactions,operator-collaboration}.test.tsx`,
  `tests/unit/operator-web-types.test.ts`, this work package's plan/contract/review/notes,
  `tasks/todos.md`
- Actual files changed: as intended; no file outside `src/operator-web/**`,
  `tests/**`, or this work package's workflow artifacts was touched
- Commands passed: 187/187 operator-web tests, `bun x tsc --noEmit` clean,
  `bun run build:operator-web` (vite) ok, the six repository-integrity checks
  at exit 0, `verify-contract --strict` 21/21 Fulfilled, and one full
  `bun test --timeout 60000` run at 4265 pass / 4 skip / 0 fail
- Residual risks: the AA contrast pair and the 44px targets are proved from the
  shipped stylesheet only, not from measured layout boxes. The server's
  `origin_required` code (`src/effects/operator/server.ts:1694`) has no entry in
  the client i18n catalogue; it is unreachable from a browser and is to be added
  on the sibling fleet branch.
- Reviewer action required: inspect diff and card
- Rollback: revert the commits on `codex/operator-web-composer-truth`; base is 1a9a5ae1

## Mode Evidence

- Selected route: planning (captured work-package plan)
- P1/P2/P3 evidence: `plans/archive/plan-20260905-1414-operator-web-composer-truth.md`
  `## Captured Planning Output`
- Root cause or plan evidence: contract `## Root Cause Evidence`; the pre-fix runs
  in `.ai/harness/evidence/pre-fix/` record 15 `(fail)` lines in
  `operator-interactions.log`, 2 in `operator-collaboration.log`, 1 in
  `operator-ui.log`, and a module-load failure in `operator-web-types.log`
  (`SyntaxError: Export named 'OPERATOR_API_ERROR_CODES' not found`), all four
  with `PRE_FIX_EXIT=1`

## Verification Evidence

- Waza `/check` run: not run; verification is the contract's exit criteria
- Commands run: see the Human Review Card above
- Manual checks: the acceptance gate drove a live Playwright readback at
  1280x900 confirming the counts split (All 15, Unreadable repos 942) and the
  zh error copy, with zero console errors; AA contrast was recomputed
  independently at 5.43:1 default, 7.08:1 hover, 5.25:1 disabled
- Supporting artifacts: `.ai/harness/evidence/pre-fix/*.log`
- Implementation notes reviewed: `tasks/archive/notes-20260905-2315-operator-web-composer-truth.md`
- Run snapshot: `.ai/harness/checks/latest.json`

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- A task with a live claim under a non-bound lease now names its holder and that
  lease state in the toggle, scope note, fence, and send button. Scope, the fence
  fields, and the POST envelope are unchanged.
- Escape inside the composer panel is ignored while the draft body is non-empty;
  every other Escape, the close button, and the scrim still close the pane.
- `.composer__send` renders carrot-700 on `--text-inverse` with a carrot-800
  hover and an opaque neutral disabled pair.
- Error bands render client-owned copy keyed by the typed code; an unrecognised
  code shows the server's English labelled as untranslated.
- The All chip counts cards; the unreadable chip counts repositories; the footer
  prints `—` for protocol and sequence with no observed snapshot.
- `inbox.effect_sha256` is rejected unless it is null or `sha256:` + 64 lowercase
  hex.

## Residual Risks / Follow-ups

- The AA contrast pair and the 44px target sizes are proved from the stylesheet,
  not from measured layout boxes.
- `origin_required` (`src/effects/operator/server.ts:1694`) is absent from the
  client i18n catalogue. It is unreachable from a browser, and the entry is to be
  added on the sibling fleet branch.
- `counts.unclassified` remains a server-side gap: the board still cannot state a
  fleet-level unclassified total, and the plan defers that to a sibling package.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All seven plan defects fixed as specified; 187/187 operator-web tests, `tsc --noEmit` clean, `vite build` ok, six repository-integrity checks exit 0, `verify-contract --strict` 21/21 Fulfilled, and a full `bun test --timeout 60000` run at 4265 pass / 4 skip / 0 fail. Held off 10/10 because `origin_required` still has no client-side entry. |
| Product depth | 9/10 | A live Playwright readback at 1280x900 confirmed the counting split the board now claims (All 15 cards vs Unreadable repos 942) and the zh error copy, with zero console errors. `counts.unclassified` stays a server-side gap deferred to the sibling package. |
| Design quality | 9/10 | The AA pairs were recomputed independently from the shipped stylesheet: default 5.43:1, hover 7.08:1, disabled 5.25:1, all clearing 4.5:1. Contrast and the 44px targets are proved from the stylesheet rather than from measured layout boxes. |
| Code quality | 9/10 | One authority per datum: `clientApiError` derives copy from the dictionary, the lease-state copy is an exhaustive `Record` over the union that fails typecheck when the protocol grows, and the dead `--carrot-500` token was removed instead of left defined. |

## Failing Items

- None. The acceptance gate returned PASS at `0f137507`.

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/operator-web/operator-ui.test.tsx tests/operator-web/operator-interactions.test.tsx tests/operator-web/operator-collaboration.test.tsx tests/unit/operator-web-types.test.ts`
- Re-check: `bun src/cli/index.ts run verify-contract --contract tasks/archive/contract-20260905-2315-operator-web-composer-truth.md --strict`

## Summary

- The composer, its contrast, its draft safety, its error copy, and the board's
  counting authorities were brought in line with the Fleet snapshot the board
  already holds. The acceptance gate returned PASS at `0f137507`.
