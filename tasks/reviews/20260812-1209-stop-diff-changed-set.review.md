# Task Review: stop-diff-changed-set

> **Status**: Accepted
> **Plan**: plans/plan-20260812-1209-stop-diff-changed-set.md
> **Contract**: tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md
> **Notes File**: tasks/notes/20260812-1209-stop-diff-changed-set.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-12 13:55
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:b2b04d6e42783092af1d143531ba1c2b1645dcd3c4d29f465d3f6b719f57b231
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: df24af4a7bbf3fffc34a34f7ed366cb12ed025c3

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: drift-cursor module + stop-handler/drain cutover + mutation-observed retirement + tests + one architecture module note (plan T1–T4)
- Actual files changed: 11 reviewed paths on the receipt — `src/cli/hook/architecture-drift.ts` (new), `src/cli/hook/stop-handler.ts`, `src/cli/hook/mutation-observed.ts`, `src/cli/commands/architecture-projection.ts`, `tests/architecture-drift.test.ts` (new), `tests/stop-handler.test.ts`, `tests/mutation-observed.test.ts`, `tests/architecture-projection-orchestration.test.ts`, `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts`, `tests/state/fixtures/loop-semantics/characterization.json`, `docs/architecture/modules/runtime-harness/hook-adapters.md` — all inside Allowed Paths, no unattributed changes
- Commands passed: `bun run check:type`; `bun test` (2362 pass / 0 fail at frozen HEAD c72d0487); exit-criteria suites 76 pass / 0 fail re-run independently by the acceptance gate; `verify-sprint --prepare-acceptance` 12/12
- Residual risks: unbounded per-path cascade fan-out at Stop in projection-disabled repos (~874 ms/path; ~170 dirty paths reach the host ~150 s Stop timeout) — in-design per plan, deferred with revisit trigger in `tasks/todos.md`
- Reviewer action required: none — gate findings resolved (F1 acceptance ledger completed via real sequence; F2 adjudicated accept-and-defer; F3 folded into the same deferred row)
- Rollback: revert branch `codex/stop-diff-changed-set` (fork `df24af4a`); `.ai/harness/state/architecture-drift-cursor.json` is disposable gitignored state

## Mode Evidence

- Selected route: work-package plan → contract → worktree (`repo-harness run capture-plan --execute`), single write-owner execution, read-only acceptance gate
- P1/P2/P3 evidence: plan sections P1/P2/P3; corrected diagnosis in plan Context (matcher-not-blind proven by exact daily telemetry correlation 62/62, 34/34, 148/148 across two repos; shell-only worktree writes 197 Bash / 0 apply_patch)
- Root cause or plan evidence: 148/148 codex PostToolUse/edit events with `metrics.event_writes=0`; `mutation-observed.ts:86` empty-path silent return; journal absent in all byok-sdk contract worktrees while Stop/SessionStart fire there

## Verification Evidence

- Waza `/check` run: not run — acceptance at this boundary was the gatekeeper review (one review per boundary; no stacking)
- Commands run: `bun run check:type`; `bun test tests/architecture-drift.test.ts tests/stop-handler.test.ts tests/mutation-observed.test.ts tests/architecture-projection-orchestration.test.ts`; `bash scripts/verify-sprint.sh --contract … --prepare-acceptance`; `bash scripts/check-task-sync.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-deploy-sql-order.sh`; `bun src/cli/index.ts run check-task-workflow --strict`
- Manual checks: single-authority grep sweep (`skipArchitectureCascade|dirty\.architecture|retainEventFiles` → zero code hits); deletion falsifier probed live (`architecture-queue record` on a deleted path classifies and exits 0); LSC-01 golden diff verified as exactly the 3 cursor-slot lines
- Supporting artifacts: AcceptanceReceipt (external_pass, issued 2026-08-12T05:51:23.847Z); `.ai/harness/checks/latest.json` (pass, subject-bound)
- Implementation notes reviewed: `tasks/notes/20260812-1209-stop-diff-changed-set.notes.md` (deletions-fed decision, `--untracked-files=all` rationale, `retainEventFiles` removal, constant source_key, HRD-09 fixture measurement)
- Run snapshot: `.ai/harness/runs/run-20260812T133252-93507-20260812-1209-stop-diff-changed-set.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:b2b04d6e42783092af1d143531ba1c2b1645dcd3c4d29f465d3f6b719f57b231
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: df24af4a7bbf3fffc34a34f7ed366cb12ed025c3
> **Verification Evidence SHA256**: sha256:2daba079970ca81b29e6b3f06183d9b8c46c6a8bbc0d01e03f2f37fe0730307d
> **Issued At**: 2026-08-12T05:51:23.847Z

- Summary: Gatekeeper review passed all six substantive gates (single-authority invariant, cursor ack semantics, changed-set completeness incl. -uall/deletions/renames, fixture-change non-masking, scope discipline, docs/notes fidelity); exit criteria 12/12 green incl. full bun test at frozen HEAD c72d0487; residual per-path cascade fan-out accepted as in-design and deferred in tasks/todos.md
- Findings: none

## Behavior Diff Notes

- Architecture changed-set authority moved from per-edit journal events to the Stop-time drift cursor (`diff --name-only --no-renames <cursor> HEAD` ∪ `status --porcelain --untracked-files=all`); shell/script writes and multi-file apply_patch are now observed on both hosts.
- Journal `dirty.architecture` and the `skipArchitectureCascade`/`eventIds`/`retainEventFiles` handshake are deleted, not gated; journal retains contract-verification / minimal-change / checkpoint.
- Cursor advances only on acknowledged drain outcomes; missing/unresolvable cursor re-anchors at HEAD fail-closed (working-tree entries only, no history replay).
- Cascade command invocations are byte-identical; only their input feed changed.

## Residual Risks / Follow-ups

- Per-path cascade fan-out cap + bounded N-path dirty-tree test: deferred in `tasks/todos.md` with revisit trigger (first observed Stop timeout, or next work-package touching the cascade loop).
- Codex parity for the remaining journal trigger bits and PreToolUse mutation-guard path extraction: named out-of-scope in the contract; not yet ledgered as separate work.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Reported symptom (shell-only worktree writes invisible) covered end-to-end by test at `tests/stop-handler.test.ts:196-262`; −1 for the deferred fan-out exposure |
| Product depth | 9/10 | Fixes the class (any non-Edit/Write mutation path, both hosts), not the instance; `-uall` insight maps exactly to the byok-sdk missed-package shape |
| Design quality | 9/10 | Single authority with deterministic receipt idempotency; datum split (changed set vs edit-time triggers) keeps one source of truth without a shim |
| Code quality | 9/10 | Zero retired-symbol residue on grep sweep; atomic single-slot state write; characterization + golden updated through documented paths |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/architecture-drift.test.ts tests/stop-handler.test.ts tests/mutation-observed.test.ts tests/architecture-projection-orchestration.test.ts`
- Re-check: `bash scripts/verify-sprint.sh --contract tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md` (finalizes from prepared evidence + receipt without rerunning)

## Summary

- Stop-time drift cursor shipped as the single architecture changed-set authority with the journal architecture bit retired in the same change; all exit criteria green at frozen HEAD, acceptance receipt recorded (external_pass), residual fan-out risk consciously deferred with a trigger.
