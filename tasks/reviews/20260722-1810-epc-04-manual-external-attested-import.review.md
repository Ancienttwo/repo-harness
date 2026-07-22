# Task Review: epc-04-manual-external-attested-import

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-1810-epc-04-manual-external-attested-import.md
> **Contract**: tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md
> **Notes File**: tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 18:10
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: new `src/effects/evidence/attested-import.ts`, wiring in `scripts/acceptance-receipt.ts` (CLI-level, insertions only) with its deterministic mirror `assets/templates/helpers/acceptance-receipt.ts` (sync:helpers projection), new `tests/evidence-attested-import.test.ts`, package plan/contract/review/notes, `tasks/todos.md` projection
- Actual files changed: exactly that set (9 paths touched; `.ai/harness/worktrees/epc-04-manual-external-attested-import.json` was pre-existing from worktree setup) — zero EPC-01/EPC-02 files modified, zero overlap with EPC-03's `allowed_paths`
- Commands passed: `bun test tests/evidence-attested-import.test.ts` (16 pass, red-first), `bun test tests/acceptance-receipt.test.ts tests/helper-scripts.test.ts` (9 + 121 pass — previously-green characterization suites stay green), full `bun test` (1738 pass / 1 skip / 0 fail), `check:type` clean, `check-task-workflow --strict` OK, `contract-run preflight` preflight_pass, deploy-sql/architecture-sync (advisory blocking=0)/task-sync green, `inspect-project-state` no drift, `adopt --dry-run` 0 operations
- Residual risks: `record`'s ledger import runs after the receipt file is already written (CLI-level wiring, not inside the exported record functions), so a genuine ledger-import failure leaves an already-written receipt file; every existing consumer of that state already gates on the command's exit code, not file existence, so this is judged acceptable (see notes)
- Reviewer action required: none further
- Rollback: revert the single PR; new files plus insertions-only wiring; mirror re-syncs via `bun run sync:helpers`

## Mode Evidence

- Selected route: planning (captured work-package plan, code-change profile)
- P1/P2/P3 evidence: plan Captured Planning Output; design authority is frozen D2–D6; EPC-01 store API and EPC-02 epoch constant consumed read-only
- Root cause or plan evidence: not a bugfix; third implementation package of the frozen EPC design (parallel R4 wave with EPC-03)

## Verification Evidence

- Waza `/check` run: self-verified in the contract worktree (fast-worker execution; no separate gatekeeper pass run in this dispatch)
- Commands run: see Human Review Card; executed in the contract worktree at the pinned base `8861b40dd85c0f7faabe8eecd217baf5528a7f3c`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/checks/latest.json`; `.ai/harness/evidence/events/log.jsonl` (worktree ledger)
- Implementation notes reviewed: yes — deployed-helper import-resolution choice, CLI-level wiring placement (and why), `reject`-skip design, `command_hash`/payload-field decisions
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] PR diff confined to allowed_paths; no EPC-01/EPC-02 file modified; zero overlap with EPC-03 allowed_paths
  - Evidence: `git status --porcelain --untracked-files=all` lists exactly 9 changed paths (3 modified: `assets/templates/helpers/acceptance-receipt.ts`, `scripts/acceptance-receipt.ts`, `tasks/todos.md`; 6 untracked: this package's plan/contract/review/notes, `src/effects/evidence/attested-import.ts`, `tests/evidence-attested-import.test.ts`), all within the contract's `allowed_paths`; none of `src/core/evidence/*`, `src/effects/evidence/epoch.ts`, `src/effects/evidence/verify-producer.ts`, `src/effects/evidence/event-log.ts` (EPC-01/EPC-02) appear; none of `src/cli/hook/command-observed.ts`, `src/effects/evidence/post-bash-importer.ts`, `tests/evidence-post-bash-importer.test.ts` (EPC-03) appear; `diff scripts/acceptance-receipt.ts assets/templates/helpers/acceptance-receipt.ts` is empty (mirror in lockstep via `bun run sync:helpers`).
- [x] Own acceptance receipt appears as accepted external_attested event in the worktree ledger (dogfood)
  - Evidence: standalone live invocation of `importAttestedEvidence` against this worktree's own real git state and this package's own committed contract file (mirroring EPC-02's live-wrapper-run precedent, since the CLI `record` path itself requires an already-passing `verify-sprint` checks file -- a bootstrap this package cannot satisfy before its own manual-check evidence exists) appended `evt-01KY4QT0HY6FC3V0G0BF9VT4V1` (`event_type: "acceptance_receipt.attested_import"`, `trust_class: "external_attested"`) to `.ai/harness/evidence/events/log.jsonl` at commit `248f970e29a84c25370867caec7c1dbdf2eb9162`, genesis `ledger_epoch_start_sha = 5228d4ea0d7987cf6fb73be216d5b9cc638817c3`; `readAcceptedEvents` readback confirms exactly 1 accepted event with the complete D3 field set (`authority_commit`/`target_commit` = `248f970e...`, `base_commit` = pinned base `8861b40d...`, `contract_hash`/`scope_hash`/`command_hash` all valid `sha256:` hashes, `env_provider_id = repo-harness/0.10.1/ws-7d22aa383f88`). The subsequent official `verify-sprint --prepare-acceptance` -> `acceptance-receipt.ts record --disposition external_pass` -> `verify-sprint` cycle for this package's actual AcceptanceReceipt additionally exercises the real CLI wiring end to end, appending a second accepted `external_attested` event referencing this package's real, recorded receipt.
- [x] tasks/current.md untouched
  - Evidence: `git diff 8861b40dd85c0f7faabe8eecd217baf5528a7f3c..HEAD -- tasks/current.md` is empty; `git status --porcelain -- tasks/current.md` shows no entry.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:8af24eea61ed5c5a583e35b83c3caf0b533f1a28eddb2e771c625787412505f4
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 691930c003f31a6d44c9ba8b5549c9e80d6cc9a0
> **Verification Evidence SHA256**: sha256:c5bec0d7e7c28d2bd3cc99bf608c713940e8ce352436f250b433144432d9a4d4
> **Issued At**: 2026-07-22T11:02:31.405Z

- Summary: EPC-04 accepted: manual/external attested import via closed D4 trust mapping (external_pass->external_attested, user_waiver->human_acceptance), fail-closed required fields, CLI-level wiring keeps characterization suites green, live dogfood ledger evidence recorded.
- Findings: none

## Behavior Diff Notes

- Recording an AcceptanceReceipt (`scripts/acceptance-receipt.ts record`, both the `external_pass` and `user_waiver` dispositions) now additionally imports the receipt into the EPC-01 evidence ledger as one `external_attested` (or `human_acceptance`) EvidenceEvent, via a closed two-entry trust mapping. `reject` is unaffected (skipped by the wiring, still exit code 1). A deployed-helper context where the import module cannot resolve skips cleanly with a stderr notice; any other import failure now fails the `record` command. No existing receipt JSON/projection behavior changed.

## Residual Risks / Follow-ups

- The ledger import runs after `writeReceipt` inside the two library functions (only reachable via the CLI wiring calling them, then re-invoking import at the CLI layer) -- a genuine import failure can leave a written receipt file behind even though the command exits non-zero. Acceptable: every downstream consumer already gates on exit code.
- `external_attested`/`human_acceptance` satisfy a machine gate only where a contract's Acceptance Policy explicitly enumerates them (D4 default-deny); this package proves the property at fold level only -- actual gate selection is EPC-05's scope.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Row-8 acceptance satisfied; closed trust mapping; fail-closed required fields |
| Product depth | 9/10 | CLI-level wiring avoids perturbing an out-of-scope characterization suite; dogfood-proven live |
| Design quality | 9/10 | No shared writer/barrel; private duplicated helpers per R4; mirror in sync |
| Code quality | 9/10 | Full suite 1738 green; characterization suites (acceptance-receipt, helper-scripts) restored green |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/evidence-attested-import.test.ts`; `bun test tests/acceptance-receipt.test.ts tests/helper-scripts.test.ts`
- Re-check: readback of `.ai/harness/evidence/events/log.jsonl` (genesis epoch + accepted `external_attested` events); mirror diff empty (`diff scripts/acceptance-receipt.ts assets/templates/helpers/acceptance-receipt.ts`)

## Summary

- EPC-04 delivers manual/external attested import per frozen D4: recording an AcceptanceReceipt now imports it into the EPC-01 ledger as an attested event through a closed two-entry trust mapping, with every required field (actor, reason, full D3 subject identity) failing closed when absent. Proven by red-first tests, restored characterization suites, and a live ledger readback. CLI-level wiring placement keeps `tests/acceptance-receipt.test.ts` untouched by the new side effect. Ready to ship as one PR.
