# Task Review: fleet-authority-cleanup

> **Status**: Complete
> **Plan**: plans/plan-20260801-1625-fleet-authority-cleanup.md
> **Contract**: tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md
> **Notes File**: tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-01 19:10
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass (two gate rounds — round 1 passed the code surface and failed the `tasks/todos.md` ledger; `a6392e4c` corrected it and round 2 returned PASS with zero blocking findings)
- Change type: code-change
- Intended files changed: `agents/fleet/gatekeeper.md` respec, `scripts/install-agent-fleet.sh` + its `assets/templates/helpers/` mirror, regenerated `.codex/agents/gatekeeper.toml`, deletion of the seven tracked `.claude/agents/*.md`, `### Readiness` prose in `assets/reference-configs/external-tooling.md` + its `docs/reference-configs/` projection, roster/model assertions in `tests/bootstrap-files.test.ts` and `tests/install-agent-fleet.test.ts`, three `tasks/todos.md` rows, the committed #148 review artifact, and this contract's plan/contract/notes set
- Actual files changed: exactly that set (21 paths), verified against `git show 048ced89 --stat`; the only addition beyond the plan is `tests/check-agent-tooling.test.ts`, which is the roster/model assertion alignment the contract's scope allows under `tests/`
- Commands passed: `bun test`; `bun scripts/sync-helper-sources.ts --check`; `bun scripts/sync-reference-configs.ts --check`; `bash scripts/check-task-sync.sh`; `bash scripts/check-architecture-sync.sh`; `bun test tests/install-agent-fleet.test.ts tests/bootstrap-files.test.ts`; PR #149 CI green; post-merge main CI green
- Residual risks: the `--check-updates` receipt tests inherited from #148 still reached the live network at merge time; that defect was ledgered in this contract's own `tasks/todos.md` rows and then fixed by #150 (`27c42d77`), CI green
- Reviewer action required: none
- Rollback: revert `048ced89` — `.claude/agents/` returns as a tracked duplicate, `gatekeeper` returns to the `fable`/`xhigh` spec with its golden regenerated back, and the `### Readiness` prose returns to its pre-#148 description; no data migration or external state involved

## Mode Evidence

- Selected route: plan -> contract -> worktree execution on `codex/receipt-awareness-closeout`, fast-worker implementation with a read-only gatekeeper review, two rounds.
- P1/P2/P3 evidence: `plans/plan-20260801-1625-fleet-authority-cleanup.md`; the pressure point was dual authority — `agents/fleet/*.md` is the authored source, but a tracked `.claude/agents/` copy had drifted (`fast-worker.md` still declared `model: sonnet` / `effort: max` against the authored `opus` / `medium`), while `.codex/agents/` is not a duplicate but the installer byte-identity golden (`tests/install-agent-fleet.test.ts:10`).
- Root cause or plan evidence: two authority defects left open by #148 — stale `### Readiness` prose describing a drift check that no longer exists, and the drifted tracked agent-fleet duplicate with `gatekeeper` pinned to the retired `fable` family.

## Verification Evidence

- Waza `/check` run: gatekeeper read-only review, round 1 (code surface PASS, `tasks/todos.md` ledger FAIL — deferred-entry facts misattributed) and round 2 after `a6392e4c` (PASS).
- Commands run: see Human Review Card.
- Manual checks: the falsifier held — `bun src/cli/index.ts init --repo . --dry-run` and the install-profile / create-project-dirs suites were unaffected by deleting `.claude/agents/`, confirming it was a tracked duplicate and not a product surface; `expect(installedCodex).toBe(golden)` byte-identity in `tests/install-agent-fleet.test.ts` was never weakened.
- Supporting artifacts: PR #149 (squash `048ced89`), follow-up PR #150 (`27c42d77`), ledger correction `a6392e4c`.
- Implementation notes reviewed: yes — `tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md`.
- Run snapshot: `.ai/harness/runs/`

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

- `agents/fleet/*.md` is now the single authored authority for the fleet: `gatekeeper` is `model: opus` / `effort: high` with a matching `gpt-5.6-terra` / `xhigh` Codex projection, and the tracked `.claude/agents/` duplicate is gone.
- `.codex/agents/gatekeeper.toml` was regenerated so the installer golden stays byte-identical; the other six goldens are untouched.
- `### Readiness` prose now describes the receipt-aware drift behavior actually shipped in #148 instead of a check that no longer exists.

## Residual Risks / Follow-ups

- Round 1's FAIL was a ledger-honesty failure, not a code failure: three deferred-goal rows misattributed their own facts. Corrected in `a6392e4c` before merge.
- The network-dependent `--check-updates` tests this contract ledgered were closed by #150 (`27c42d77`).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- none (round 1's `tasks/todos.md` ledger finding was closed by `a6392e4c` and re-reviewed PASS in round 2)

## Retest Steps

- Re-run: `bun test tests/install-agent-fleet.test.ts tests/bootstrap-files.test.ts`
- Re-check: `bun scripts/sync-helper-sources.ts --check` and `bun scripts/sync-reference-configs.ts --check`

## Summary

Fleet authority collapsed to one authored source with the installer golden left byte-identical, and the two documentation/ledger defects #148 left open were closed. Merged as `048ced89` (PR #149) after two gate rounds; the network-isolation defect it ledgered was fixed by #150. Archived here with a reproducible gate-produced pass state.
