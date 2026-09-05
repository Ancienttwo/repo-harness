# Task Review: operator-web-composer-truth

> **Status**: Pending
> **Plan**: plans/plan-20260905-1414-operator-web-composer-truth.md
> **Contract**: tasks/contracts/20260905-1414-operator-web-composer-truth.contract.md
> **Notes File**: tasks/notes/20260905-1414-operator-web-composer-truth.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 14:14
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: frontend
- Intended files changed: `src/operator-web/{App.tsx,i18n.ts,types.ts,styles.css,fixture.ts}`,
  `tests/operator-web/{operator-ui,operator-interactions,operator-collaboration}.test.tsx`,
  `tests/unit/operator-web-types.test.ts`, this work package's plan/contract/review/notes,
  `tasks/todos.md`
- Actual files changed: as intended; no file outside `src/operator-web/**`,
  `tests/**`, or this work package's workflow artifacts was touched
- Commands passed: `bun test --timeout 60000` (four operator suites),
  `bun run build:operator-web`, `bun x tsc --noEmit`,
  `verify-contract --strict` (21/21), the six repository-integrity checks,
  and one full `bun test --timeout 60000` run
- Residual risks: no real browser was opened. Contrast is computed from the
  shipped stylesheet and the layouts are asserted through happy-dom and static
  render, so the AA pair and the 44px targets are proved from source rather
  than from a rendered page.
- Reviewer action required: inspect diff and card
- Rollback: revert the commits on `codex/operator-web-composer-truth`; base is 1a9a5ae1

## Mode Evidence

- Selected route: planning (captured work-package plan)
- P1/P2/P3 evidence: `plans/plan-20260905-1414-operator-web-composer-truth.md`
  `## Captured Planning Output`
- Root cause or plan evidence: contract `## Root Cause Evidence`; pre-fix runs in
  `.ai/harness/evidence/pre-fix/` record 15 named failures across the four
  guarded files with `PRE_FIX_EXIT=1`

## Verification Evidence

- Waza `/check` run: not run; verification is the contract's exit criteria
- Commands run: see the Human Review Card above
- Manual checks: none; the browser render is the open residual risk
- Supporting artifacts: `.ai/harness/evidence/pre-fix/*.log`
- Implementation notes reviewed: `tasks/notes/20260905-1414-operator-web-composer-truth.notes.md`
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

- No browser render was performed; contrast and target sizes are proved from the
  stylesheet, not from a page.
- `counts.unclassified` remains a server-side gap: the board still cannot state a
  fleet-level unclassified total, and the plan defers that to a sibling package.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- None observed by the executor; the acceptance verdict is the gate's.

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/operator-web/operator-ui.test.tsx tests/operator-web/operator-interactions.test.tsx tests/operator-web/operator-collaboration.test.tsx tests/unit/operator-web-types.test.ts`
- Re-check: `bun src/cli/index.ts run verify-contract --contract tasks/contracts/20260905-1414-operator-web-composer-truth.contract.md --strict`

## Summary

- The composer, its contrast, its draft safety, its error copy, and the board's
  counting authorities were brought in line with the Fleet snapshot the board
  already holds. Verdict and recommendation are left for the acceptance gate.
