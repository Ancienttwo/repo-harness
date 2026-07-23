> **Archived**: 2026-07-24 03:08
> **Related Plan**: plans/archive/plan-20260724-0300-provider-subprocess-isolation.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260724-0308

# Task Review: provider-subprocess-isolation

> **Status**: Reviewed
> **Plan**: plans/plan-20260724-0300-provider-subprocess-isolation.md
> **Contract**: tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md
> **Notes File**: tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-24 03:06
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:9b209f8c60b30efaa0b3fd413d44a46af1abd951207b6e295acb139ad8b63427
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: ebd8498240ae374d04a893bb1812d2f4e462f11e

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: Claude routing provider command, its focused test, two Todo rows, and bounded workflow artifacts.
- Actual files changed: `scripts/run-skill-routing-eval.ts`, `tests/skill-routing-eval.test.ts`, `tasks/todos.md`, and the linked plan/contract/notes/review.
- Commands passed: red-first routing test; one focused post-fix test; one live Claude project-source sample; exact helper-to-fleet bounded replay; final `verify-sprint --prepare-acceptance` with ContractVerify 18/18.
- Residual risks: real-provider routing-quality thresholds remain intentionally unmeasured; this package proves the apparatus, not the 136-case quality result.
- Reviewer action required: none.
- Rollback: revert this package; no data, auth, or schema migration.

## Mode Evidence

- Selected route: `hunt`.
- P1/P2/P3 evidence: P1 isolated authority at the per-case project/provider boundary; P2 traced `.claude/skills` projection into `claude -p` and its ambient user-source contamination; P3 selected the official project-only setting-source flag while preserving OAuth and provider semantics.
- Root cause or plan evidence: `buildClaudeRoutingCommand` omitted `--setting-sources project`; the historical verify-context symptom was already fixed by `8763ad5d` and reproduced green today.

## Verification Evidence

- Waza `/check` run: not separately invoked; one final sprint gate supplied the bounded acceptance evidence.
- Commands run: final ContractVerify 18/18, including 59 routing tests, typecheck, task-sync, and diff hygiene.
- Manual checks: live Claude init contained only the case skill plus built-ins and emitted `Skill(repo-harness-plan)`; default OAuth remained active.
- Supporting artifacts: `.ai/harness/runs/20260724-0300-provider-subprocess-isolation/` and `.ai/harness/checks/latest.json`.
- Implementation notes reviewed: `tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md`.
- Run snapshot: `.ai/harness/runs/run-20260724T030623-35230-20260724-0300-provider-subprocess-isolation.json`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:9b209f8c60b30efaa0b3fd413d44a46af1abd951207b6e295acb139ad8b63427
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: ebd8498240ae374d04a893bb1812d2f4e462f11e
> **Verification Evidence SHA256**: sha256:42702a9e7f0bb8dbb796840b0fd306464d91e5e4a504615c32352054ad730173
> **Issued At**: 2026-07-23T19:07:43.572Z

- Summary: Claude routing evaluation now loads project setting sources only; a red-first guard and one bounded live provider sample prove the case-local skill surface is authoritative, and the historical verify-context row is closed by its existing fix plus exact green replay.
- Findings: none

## Behavior Diff Notes

- Before: Claude routing cases inherited the operator's user skills and measured an unrelated ambient surface.
- After: Claude loads project setting sources only, so the case-local projected surface is authoritative while built-in skills and OAuth continue to work.
- The Codex provider, routing corpus, thresholds, aggregation, and auth paths are unchanged.

## Residual Risks / Follow-ups

- Valid real-provider routing quality is still unmeasured; a future matrix rerun needs an explicit cost decision.
- No same-shape contamination remains in sibling provider runners: the harness benchmark already isolates project settings, while cross-review and run-skill-evals disable slash commands.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Red-first guard and live provider evidence cover the exact command boundary. |
| Product depth | 9/10 | Repairs measurement authority without claiming unrun quality results. |
| Design quality | 10/10 | One official CLI flag; no secret copy, fallback registry, or compatibility path. |
| Code quality | 10/10 | Two production argument lines plus one focused fake-provider regression test. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/skill-routing-eval.test.ts`.
- Re-check: inspect `system.init.skills` in one bounded real-provider sample before any future full matrix.

## Summary

- Pass. The intended project skill is now authoritative, the stale verify-context Todo is independently closed, and the final gate is green for the normalized subject above.
