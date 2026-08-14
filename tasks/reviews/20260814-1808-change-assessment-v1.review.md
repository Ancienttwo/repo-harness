# Task Review: change-assessment-v1

> **Status**: Verified
> **Plan**: plans/plan-20260814-1808-change-assessment-v1.md
> **Contract**: tasks/contracts/20260814-1808-change-assessment-v1.contract.md
> **Notes File**: tasks/notes/20260814-1808-change-assessment-v1.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-14 20:36
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: `sha256:a148205e4f752ba6ba4db6cca566f3153bb5ae2008e59713cd74392c69b95d28`
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: `b2fd1379a5eca9e18eee011482f59fb9cfd27954`

## Human Review Card

- Verdict: pass for machine-verified implementation; external semantic acceptance remains pending a committed candidate.
- Change type: code-change
- Intended files changed: deterministic review selection, canonical evidence binding, package runtime receipt, projections/docs/artifacts.
- Actual files changed: `src/core/review`, `src/effects/review`, `src/core/release`, `src/effects/release`, verify/receipt/release helpers, their projected package copies, tests, and workflow docs.
- Commands passed: focused 23-test suite, 14-test runtime/assessment suite, 20-test merge-gate/attested-import suite, complete 123-test helper suite, typecheck, helper/reference projections, source `verify-sprint --prepare-acceptance`, deploy SQL, architecture/task sync, source-root strict workflow, inspector, and init dry-run.
- Residual risks: final evidence ledger/AcceptanceReceipt cannot bind before the worktree contract is committed; this is fail-closed and intentional. The exact global `repo-harness run check-task-workflow --strict` sees the prior installed package and reports the two new helpers missing; source-root strict workflow passes. Publishing/global installation is outside this work-package. Full `bun test --reporter=dot` remains red only for the pre-existing ArchContext fake-Node assertion and five global-runtime bootstrap environment cases; all changed Change Assessment surfaces pass.
- Reviewer action required: inspect the final packet's selected paths/reasons/oracles, the per-path oracle gap, the re-prepare-after-disagreement closeout boundary, and the installed-package/tarball identity bind.
- Rollback: revert this one work-package; no receipt, scheduler, external service, or published package state was created.

## Mode Evidence

- Selected route: complex-engineering-plan, captured in `plans/plan-20260814-1808-change-assessment-v1.md`.
- P1/P2/P3 evidence: policy review base + `buildReviewSubject` are sole authority; trace and design decisions are recorded in the paired notes.
- Root cause or plan evidence: work-package plan P1/P2/P3 and falsifier are complete; this is not a bugfix contract.

## Verification Evidence

- Waza `/check` run: source-equivalent required checks run directly in the isolated worktree; no external semantic verdict is represented here.
- Commands run: see notes Evidence Links; source `verify-sprint --prepare-acceptance` passed.
- Manual checks: inspected the source prepared packet; it binds one policy target revision, normalized final subject, selected paths, and deterministic/runtime oracles. Its exact hash is runtime evidence, not a durable review claim.
- Supporting artifacts: `tests/change-assessment.test.ts`, `tests/runtime-evidence-receipt.test.ts`, and the source run snapshot named in notes.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/runs/run-20260814T194118-45673-20260814-1808-change-assessment-v1.json`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:33cc7efdb91e37d0f0fad9fbeb18bdb7099203e4c6ec9dbddc0dd3dce553ffc0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 6a8d77e0160f78ca93a3d486b3645d701e3d51a3
> **Verification Evidence SHA256**: sha256:f7d293f4ec10db57e6194e16d9a8a8427473676abeb236a7d9a2da7ecfc37492
> **Issued At**: 2026-08-14T14:04:15.864Z

- Summary: Claude final review passed with no P0/P1; range-diff after rebase shows no semantic patch change, only the deferred-ledger timestamp resolution.
- Findings: P3: Different --packet and --output paths preserve the disagreement source but write a failure envelope to output; the canonical verifier uses the same path.; P3: Archived contract identity compares normalized slug rather than timestamps, so deliberate same-slug reuse remains a theoretical ambiguity.

## Behavior Diff Notes

- Hooks remain advisory/fail-open. The new authority runs only at
  `verify-sprint --prepare-acceptance` and fails closed when policy/base/subject/
  packet/oracle evidence is unavailable.
- `ReviewSelectionPacket` is hash-bound to exact final subject and target
  revision. Reviewer disagreement is append-only; it cannot lower a reason or
  widen the subject. It must be fresh-prepared again before finalization, which
  rejects stale prepared evidence.
- AcceptanceReceipt remains protocol 2 and its canonical verification hash now
  includes Change Assessment evidence. It recomputes the base assessment and
  permits only the monotonic disagreement overlay, rejecting forged assessment
  hashes even when their packet hash is recomputed. RuntimeEvidenceReceipt has
  a separate release lifecycle using the trusted Bun shebang PATH.
- RuntimeEvidenceReceipt now rejects arbitrary regular-file stand-ins: canonical
  `.bin` paths must resolve to package manifest bins, and their three essential
  members match the verified published tarball. Rename-only existing abstractions
  no longer create a `pattern_novelty` routing signal.
- Check fixtures on the merge and attested-import paths use effect-prepared,
  exact-subject assessment evidence. They cannot retain or synthesize the old
  unchecked evidence shape.
- Bundled-helper verification fixtures exercise the real, synchronized
  Change Assessment runtime and legal contract declaration; multi-run fixtures
  ignore the generated `*.latest.json` cache, and the advisory path remains
  non-gating without weakening the assessment guard.

## Residual Risks / Follow-ups

- An actual AcceptanceReceipt and merge seal remain correctly unavailable until
  a committed candidate lets the authoritative evidence ledger bind this
  contract. No follow-up implementation is required for this work-package.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All approved WP0–WP3 gates are represented and fixtures cover both pass and fail-closed paths. |
| Product depth | 9/10 | Routes review to deterministic, executable oracle evidence while retaining external acceptance. |
| Design quality | 9/10 | One final-subject/base authority; no Hook/model authority or receipt protocol fork. |
| Code quality | 9/10 | Pure core, isolated effects, package projections, deterministic hashes, focused and full tests. |

## Failing Items

- No Change Assessment implementation failures. The uncommitted-contract ledger refusal is an expected authority precondition. The full-suite runner has six unrelated runtime-environment failures recorded above.

## Retest Steps

- Re-run: `bun test tests/change-assessment.test.ts tests/runtime-evidence-receipt.test.ts tests/acceptance-receipt.test.ts tests/acceptance-receipt-evidence-fingerprint.test.ts`.
- Re-check: `bash scripts/verify-sprint.sh --prepare-acceptance`, then after committing the exact candidate record external acceptance and run final `verify-sprint`.

## Summary

- Recommendation: pass implementation review. AcceptanceReceipt/merge authority intentionally remains a separate post-commit lifecycle.
