# Task Review: epc-06-checkpoint-materialization

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-2156-epc-06-checkpoint-materialization.md
> **Contract**: tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md
> **Notes File**: tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 23:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new `src/core/evidence/checkpoint.ts` (pure projection + Markdown renderer) and `src/effects/evidence/checkpoint-store.ts` (transactional store + fail-closed reader); one additive wiring block in `src/cli/hook/stop-handler.ts`; new `tests/evidence-checkpoint.test.ts`; package plan/contract/review/notes; `tasks/todos.md` projection
- Actual files changed: exactly that set — 9 paths, single commit `b8059483` on base `321248e4`; recovery writers, EPC-05 surfaces, EPC-01 store/fold, `tasks/current.md` all untouched; stop-handler diff is one import + one silent try/catch, no existing line removed or reordered
- Commands passed: `bun test tests/evidence-checkpoint.test.ts` (20 pass, red-first), `bun test tests/stop-handler.test.ts` (10 pass, file unmodified), full `bun test` (1799 pass / 1 skip / 0 fail — worker + gatekeeper independent runs), `check:type` clean, `check-task-workflow --strict` OK, `contract-run preflight` preflight_pass, deploy-sql/task-sync/architecture-sync (advisory blocking=0) green, `inspect-project-state` no drift, `adopt --dry-run` 0 operations
- Residual risks: `source_checkpoint_id` is self-referential on checkpoints (contract-pinned, store-enforced) while D8's literal parenthetical could read as null — ratified as "consumers discriminate on schema, not nullness" in the Program doc alongside the row flip; whole-ledger snapshot carries `subject_hash`/`contract_id` null (gatekeeper-confirmed legitimate D8 not-applicable idiom, matching EPC-05 precedent)
- Reviewer action required: none further — gatekeeper acceptance review (fresh context, read-only) verdict PASS
- Rollback: revert the single PR; two new modules + tests + one additive wiring block; no existing writer retired or modified

## Mode Evidence

- Selected route: planning (captured work-package plan, code-change profile)
- P1/P2/P3 evidence: plan Captured Planning Output; design authority frozen D1/D5/D8; EPC-01 fold/store consumed read-only; D8 provenance idiom matches EPC-05
- Root cause or plan evidence: not a bugfix; checkpoint substrate package for EPC-07/08 materializers

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance review (fresh context, read-only) — verdict PASS, including an independent scratch-fixture live readback
- Commands run: see Human Review Card; executed in the contract worktree at `b8059483`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json`; scratch-fixture readbacks (worker + gatekeeper, both cleaned after)
- Implementation notes reviewed: yes — content-addressed checkpoint id rationale, whole-ledger null subject rationale, Stop wiring point + silent-skip semantics, re-validation on every publish/resolve
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] Published checkpoint provenance source_event_ids resolve to accepted ledger events; marker resolves to a complete checkpoint (live readback)
  - Evidence: worker dogfood (real `runStopHandler` over a seeded real ledger in this worktree, cleaned after): `resolveLastPublishedCheckpoint` returned checkpoint `chk-61984d67...` with `provenance.source_event_ids` exactly matching the two accepted events; gatekeeper independently repeated with a scratch fixture (genesis + 3 events, one superseded): accepted ids matched in append order, superseded excluded, human view re-derived byte-identically.
- [x] No code path reads the human Markdown view back (grep assertion green)
  - Evidence: only `checkpoint-store.ts` references the human-view filename under `src/` + `scripts/` (worker test + gatekeeper independent grep); structurally, every resolve/republish byte-compares the on-disk view against the machine-derived rendering, so a hand-edit is overwritten or fails resolution closed.
- [x] tasks/current.md untouched
  - Evidence: `git diff 321248e4..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

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

- Stop now additionally publishes one atomic checkpoint (machine projection + derived human view + last-published marker) when a ledger exists, with zero stdout/stderr and unchanged HRD Stop semantics (projection counts and state resolutions identical). Nothing consumes the checkpoint yet; EPC-07/08 materialize from it.

## Residual Risks / Follow-ups

- EPC-07 consumes the checkpoint machine schema; if its inventory needs more fields, extend in EPC-07 (append-only schema growth), not by re-deciding here.
- D1 archive-after-checkpoint execution remains worktree-finish lifecycle, not wired in this row.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Row-10 acceptance satisfied; atomicity + crash fixtures proven |
| Product depth | 9/10 | Re-validation on every publish/resolve makes Markdown authority leak structurally impossible |
| Design quality | 9/10 | Content-addressed id makes idempotent republish structural |
| Code quality | 9/10 | 1799 green twice independently; Stop suite untouched |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-checkpoint.test.ts`; `bun test tests/stop-handler.test.ts`
- Re-check: marker resolve on a scratch fixture; never-read-back grep

## Summary

- EPC-06 delivers the checkpoint materialization transaction per frozen D1/D5/D8: deterministic machine projection with content-addressed id, byte-derived human view that can never become writable authority, staged install with last-published marker, partial generation rejected, and additive Stop wiring that leaves HRD semantics untouched. Gatekeeper verdict: PASS. Ready to ship as one PR.
