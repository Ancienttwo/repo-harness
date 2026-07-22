# Task Review: epc-07-recovery-view-cutover

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-2246-epc-07-recovery-view-cutover.md
> **Contract**: tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md
> **Notes File**: tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-23 00:45
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new `src/effects/evidence/recovery-materializer.ts`, standalone `scripts/recovery-view-cli.ts` (+ helper mirror + manifest registration in `assets/workflow-contract.v1.json` + byte-identical `.ai/harness/workflow-contract.json`), Stop internal content-source swap, retired writers thinned/deleted (bash handoff assembly, resume/packet authoring, fifth-writer bootstrap) with canonical+projection+digest lockstep, new 14-test suite, three documented characterization updates, package plan/contract/review/notes, `tasks/todos.md` projection
- Actual files changed: exactly that set — 22 paths, single commit `24bfd715` on base `e5fb55e1`; `session-context.ts`, `tasks/current.md`, `refresh-current-status.sh`, sprint doc untouched; EPC-06 checkpoint modules consumed read-only; all five mirror pairs byte-identical (`cmp` clean)
- Commands passed: new suite 14 pass (red-first), stop-handler/helper-scripts/workflow-state-lib 144 pass with only the three documented updates, full `bun test` 1813 pass / 1 skip / 0 fail (worker + gatekeeper independent runs), `check:type` clean, worktree `check-task-workflow --strict` OK, `contract-run preflight` preflight_pass, deploy-sql/task-sync/architecture-sync (advisory blocking=0) green, `inspect-project-state` no drift, `adopt --dry-run` 0 operations
- Residual risks: globally installed repo-harness 0.10.1 lacks the newly registered packaged helper (`recovery-view-cli.ts`) — global-CLI strict checks fail in this repo until the standard-profile global refresh lands post-merge (environmental, flagged by gatekeeper); two test implementations deliberately narrower than the contract prose with sound inline rationale (drift check via double regeneration; no-independent-authoring over the six retired-writer files), the stronger property independently verified by gatekeeper
- Reviewer action required: none further — gatekeeper acceptance review (fresh context, read-only) verdict PASS with base-revision spot-checks of every load-bearing inventory claim and an independent live Stop readback (12/12)
- Rollback: revert the single PR — restores the retired writers and removes the materializer + Stop swap; tracked `tasks/current.md` content untouched throughout

## Mode Evidence

- Selected route: planning (captured work-package plan, code-change profile; Phase A inventory-before-edit sequencing honored)
- P1/P2/P3 evidence: plan Captured Planning Output; frozen D8/D9 + row-10 D8 ratification; Phase A inventory with file:line citations recorded in the contract before Phase B edits
- Root cause or plan evidence: cutover package; the pre-existing bare-Stop `resumeAvailable()` gap and the two bash/TS divergences documented with base-revision evidence

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance review (fresh context, read-only) — verdict PASS; inventory claims verified against `git show e5fb55e1:`; independent repo-wide writer sweep confirmed the Phase A classification
- Commands run: see Human Review Card; executed in the contract worktree at `24bfd715`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json`; live Stop readback fixtures (worker + gatekeeper, cleaned after)
- Implementation notes reviewed: yes — fifth-writer retirement under D9 revision authority, standalone-CLI correction (distributed helpers never receive src/), manifest fail-closed registration, thin-invoker choices per view, bash/TS divergence fixes
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] Phase A inventory recorded with file:line evidence and reconciled verdicts before Phase B edits
  - Evidence: contract Phase A section enumerates every writer/reader/trigger for the four views with file:line citations; gatekeeper spot-checked the load-bearing claims at the base revision (fifth-writer bootstrap at `workflow-state.sh:122-123`; TS reimplementation with the `workflow_write_handoff v1` copy-paste marker; `resumeAvailable()` marker mismatch at `session-context.ts:577-584`) — all real; the one D9 revision (fifth-writer retirement) is recorded with rationale.
- [x] Live Stop dogfood: handoff/resume materialized from last checkpoint, evidence claims resolve to checkpoint, hand-edit overwritten
  - Evidence: worker dogfood plus gatekeeper independent scratch-fixture readback (12/12): real `runStopHandler` over a seeded ledger materialized handoff/resume with provenance; the Evidence section cites the checkpoint published in the same Stop; a bare Stop now writes the `resumeAvailable()`-required marker + `## Resume Prompt` (pre-existing gap closed); hand-edited views fully overwritten by the next Stop.
- [x] tasks/current.md untouched
  - Evidence: `git diff e5fb55e1..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:9f5180fce50fa3b8a6937d9172c06f0ae6a9d8817fd64fcd409d6b5ea4dff4cf
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e5fb55e11863fa51a6945f411327be3cb5bd4c50
> **Verification Evidence SHA256**: sha256:ba47b3820f528ee1b441ca234ab5c640da9f7d2fe76ed2bb27044073f89dcbfd
> **Issued At**: 2026-07-22T16:20:14.798Z

- Summary: EPC-07 accepted: recovery-view cutover — evidence-cited inventory incl. fifth-writer retirement, single materializer per surviving view single-hop from checkpoint, retired writers deleted with mirrors in lockstep, Stop semantics untouched, bare-Stop resume gap closed; gatekeeper PASS
- Findings: none

## Behavior Diff Notes

- Recovery views (handoff, resume, Codex task-handoff payload) are now rendered by one materializer from the last-published checkpoint plus minimal workflow context, single-hop, with D8 provenance; the bash assembly, independent resume/packet authoring, and the fifth-writer placeholder bootstrap are deleted; Stop external semantics unchanged (four-target batch, counts, readiness ordering); a bare Stop now produces a resume that `session-context.ts` actually accepts.

## Residual Risks / Follow-ups

- Post-merge: refresh the local global repo-harness install (standard profile) so global-CLI strict checks regain the packaged helper; until then use repo-local scripts (EPC-05 discipline already in force).
- Optional one-line contract amendment ratifying the two narrower test implementations (gatekeeper non-blocking observation).
- EPC-09 carry-forwards unchanged (guarded seeds, downstream availability, 0.10.1 legacy writer).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Row-11 acceptance satisfied; fifth writer found and retired |
| Product depth | 9/10 | Latent resumeAvailable gap closed by construction; divergences unified |
| Design quality | 9/10 | Single-hop checkpoint→view; thin invokers keep host entrypoints without dual authority |
| Code quality | 9/10 | 1813 green twice independently; mirrors byte-identical |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-recovery-materializer.test.ts`; `bun test tests/stop-handler.test.ts`
- Re-check: mirror `cmp` pairs; live bare-Stop resume marker

## Summary

- EPC-07 completes the recovery-view cutover per frozen D9: evidence-cited inventory (including an undeclared fifth writer, retired under D9's revision authority), one materializer per surviving view sourced single-hop from the EPC-06 checkpoint, retired writers deleted same-package with mirrors in lockstep, Stop external semantics untouched, and the pre-existing bare-Stop resume gap closed by construction. Gatekeeper verdict: PASS. Ready to ship as one PR.
