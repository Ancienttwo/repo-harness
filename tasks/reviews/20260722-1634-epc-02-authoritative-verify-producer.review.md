# Task Review: epc-02-authoritative-verify-producer

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md
> **Contract**: tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md
> **Notes File**: tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 18:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new `src/effects/evidence/epoch.ts` + `verify-producer.ts`, new `scripts/emit-verify-evidence.ts`, wiring in `scripts/verify-sprint.sh` (insertions only) with its deterministic mirror `assets/templates/helpers/verify-sprint.sh` (sync:helpers projection), new `tests/evidence-verify-producer.test.ts`, package plan/contract/review/notes, `tasks/todos.md` projection
- Actual files changed: exactly that set — 11 paths, single commit `7d4ad84e` on base `a8cae4d7`; zero EPC-01 files modified; `verify-contract.sh`, `acceptance-receipt.ts`, `command-observed.ts`, `tasks/current.md` untouched; verify-sprint.sh diff is insertions-only
- Commands passed: `bun test tests/evidence-verify-producer.test.ts` (11 pass, red-first), `bun test tests/helper-scripts.test.ts tests/capability-resolver.test.ts` (127 pass — previously-red characterization suites), full `bun test` (1722 pass / 1 skip / 0 fail — worker + gatekeeper re-run), `check:type` clean, `check-task-workflow --strict` OK, `contract-run preflight` preflight_pass, deploy-sql/architecture-sync (advisory blocking=0)/task-sync green, `inspect-project-state` no drift, `adopt --dry-run` 0 operations
- Residual risks: emission fires only on already-successful verify runs, and exit-3 skip (cannot-bind) changes nothing a gate reads (no ledger consumer until EPC-05); wrapper resolution in deployed-helper contexts uses the existing `REPO_HARNESS_SOURCE_ROOT` fallback — an adopted repo without that source root skips with exit 3 rather than failing (documented in notes)
- Reviewer action required: none further — gatekeeper FAIL on missing live-ledger evidence remediated by a live wrapper run + readback (see Manual Check Evidence); all code/scope/test gates were already clean in the gatekeeper pass
- Rollback: revert the single PR; new files plus insertions-only wiring; mirror re-syncs via `bun run sync:helpers`

## Mode Evidence

- Selected route: planning (captured work-package plan, code-change profile)
- P1/P2/P3 evidence: plan Captured Planning Output; design authority is frozen D2–D6; EPC-01 store API consumed read-only
- Root cause or plan evidence: not a bugfix; second implementation package of the frozen EPC design (first producer)

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance review (fresh context, read-only) — initial FAIL solely on absent live-ledger dogfood evidence; remediated same-day with a live emission + readback; all other gates verified clean by gatekeeper
- Commands run: see Human Review Card; executed in the contract worktree at `7d4ad84e`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json`; `.ai/harness/evidence/events/log.jsonl` (worktree ledger)
- Implementation notes reviewed: yes — helper-source resolution choice, cannot-bind exit-code contract (orchestrator ruling), `set -e` capture idiom bug, redaction-driven `run_snapshot_id` payload shape
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] PR diff confined to allowed_paths; no EPC-01 file modified
  - Evidence: `git diff --name-only a8cae4d7..HEAD` lists exactly the 11 paths in the contract's `allowed_paths`; gatekeeper verified `src/effects/evidence/epoch.ts` and `verify-producer.ts` are additions and zero EPC-01 files changed; `diff scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh` is empty (mirror in lockstep).
- [x] Package's own acceptance run appended one accepted authoritative_machine event with genesis epoch constant
  - Evidence: live wrapper run in this worktree at committed-clean `7d4ad84e` appended `evt-01KY4MQST9B3EKGM05MZX9AAFQ`; readback of `.ai/harness/evidence/events/log.jsonl` shows the genesis record with `ledger_epoch_start_sha = 5228d4ea0d7987cf6fb73be216d5b9cc638817c3` followed by the accepted `authoritative_machine` `verify_sprint.result` event; the `verify-sprint --prepare-acceptance` freeze run for this acceptance exercises the same wiring live.
- [x] tasks/current.md untouched
  - Evidence: `git diff a8cae4d7..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:76d38600a04e40d9fe09ddc20f0816c1ae17a0dd60cd226ec6a6fdb6a02a2158
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a8cae4d78f1a4451f3a5335b9fc345740c3c61db
> **Verification Evidence SHA256**: sha256:fe973d76838891ed8a05a957f6fdd59e7feff811628ee747583419dd4e127cee
> **Issued At**: 2026-07-22T10:09:15.808Z

- Summary: EPC-02 accepted: authoritative verify producer with construction-bound D3 subject identity, epoch constant single-sourced, cannot-bind skip semantics, mismatch fail-closed; live ledger readback evidence; gatekeeper gates clean after remediation
- Findings: none

## Behavior Diff Notes

- The verify runner now emits a subject-bound `authoritative_machine` EvidenceEvent after successful verification (prepare and finalize paths). Cannot-bind conditions (no active contract; dirty/untracked contract; unresolvable TS entry in deployed-helper contexts) skip emission with exit 3 and one stderr notice — refusal-to-fabricate, not a fallback; subject mismatch and store/genesis errors fail the run. `checks/latest` authoring is unchanged (EPC-05 owns that cutover).

## Residual Risks / Follow-ups

- Adopted repos without `REPO_HARNESS_SOURCE_ROOT` skip emission (exit 3); acceptable while no gate reads the ledger — revisit at EPC-05 selection cutover.
- EPC-03/04 import `LEDGER_EPOCH_START_SHA` from this package; wave qualification for their parallel execution is now evaluable.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Row-6 acceptance satisfied; construction-invariant subject binding |
| Product depth | 9/10 | Exit-code contract distinguishes refusal classes; dogfood-proven live |
| Design quality | 9/10 | Epoch constant single-sourced; insertions-only wiring; mirror in sync |
| Code quality | 9/10 | Full suite 1722 green; characterization suites restored |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-verify-producer.test.ts`; `bun test tests/helper-scripts.test.ts`
- Re-check: readback of `.ai/harness/evidence/events/log.jsonl` (genesis epoch + accepted authoritative_machine event); mirror diff empty

## Summary

- EPC-02 delivers the authoritative verify producer per frozen D2–D6: the verify runner emits subject-bound `authoritative_machine` events with the full D3 identity computed by construction, the Program epoch constant is single-sourced, cannot-bind refusals skip without fabricating, and subject mismatch fails closed — proven by red-first tests, restored characterization suites, and a live ledger readback. Gatekeeper's sole blocking finding (missing live evidence) is remediated with the recorded readback. Ready to ship as one PR.
