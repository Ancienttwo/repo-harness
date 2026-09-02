# Task Review: brc4b-oracle-version-pin-gate-findings

> **Status**: Accepted
> **Plan**: plans/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md
> **Contract**: tasks/contracts/20260903-0438-brc4b-oracle-version-pin-gate-findings.contract.md
> **Notes File**: tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-03 04:38
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:25de14d35ad4f5ba82b73e441436a231b4a37256f624b68c7457f9fe369116df
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 9e922e47a7970d8aded7a3597912df8c02f7ca34

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: `src/cli/chatgpt-browser/{oracle-provider,engine,session-store,types}.ts`, `tests/cli/chatgpt-browser.test.ts`, `docs/repo-harness-chatgpt-browser-engine.md`
- Actual files changed: the six above plus the workflow artifacts (plan, contract, review, notes, `tasks/todos.md`) and the generated `docs/architecture/.projection-manifest.json`
- Commands passed: `bun test tests/cli/chatgpt-browser.test.ts --timeout 60000` (49 pass), `bun test tests/readme-dx.test.ts --timeout 60000` (8 pass), `bun run check:type`, `repo-harness run verify-contract --strict` (18/18), `repo-harness run check-task-workflow --strict`, `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh`, `bash scripts/check-architecture-sync.sh`, `repo-harness run verify-sprint --prepare-acceptance`, `repo-harness run verify-sprint`
- Residual risks: the pin stays an exact match, so the next Oracle release re-blocks `browser-doctor` until the constant is reviewed again; `native_profile` is a new transport value that older stored session metadata never carries
- Reviewer action required: inspect diff and card
- Rollback: revert the branch commits on top of `main@9e922e47`; the change is confined to `src/cli/chatgpt-browser` plus its tests and one doc sentence

## Mode Evidence

- Selected route: planning (captured work-package plan)
- P1/P2/P3 evidence: `plans/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md` Captured Planning Output (P1 map, P2 trace, P3 decision)
- Root cause or plan evidence: `src/cli/chatgpt-browser/oracle-provider.ts` pinned `0.14.1` against the installed Oracle `0.18.0`; pre-fix capture in `.ai/harness/evidence/brc4b-pre-fix.txt` (`PRE_FIX_EXIT=1`)

## Verification Evidence

- Waza `/check` run: replaced by one `codex exec -s read-only` semantic review round (VERDICT PASS, no findings)
- Commands run: see the Human Review Card `Commands passed` line
- Manual checks: `bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json` on the host Oracle 0.18.0 reports `status: "ready"`, `versionCompatible: true`, `missingCapabilities: []` and no `browserCookiePath` key; `browser-consult --provider oracle --dry-run` against the real profile binding still renders `--copy-profile` plus `--browser-chrome-profile "Profile 11"` and no `--browser-cookie-path`
- Supporting artifacts: `.ai/harness/checks/latest.json`, `.ai/harness/evidence/brc4b-pre-fix.txt`
- Implementation notes reviewed: `tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md`
- Run snapshot: `.ai/harness/runs/run-20260903T050827-60435-20260903-0438-brc4b-oracle-version-pin-gate-findings.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:25de14d35ad4f5ba82b73e441436a231b4a37256f624b68c7457f9fe369116df
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 9e922e47a7970d8aded7a3597912df8c02f7ca34
> **Verification Evidence SHA256**: sha256:c805013694914035b963d8742f556f9d5d81e98d89155ac216f17e70a1e61f11
> **Issued At**: 2026-09-02T21:13:40.508Z

- Summary: Codex read-only review of the branch diff: the oracle pin stays an exact match raised to 0.18.0, browserCookiePath is gone from the capability contract, probe, empty set, readiness and the doc map with no dangling references, the stale-session match only classifies under a non-zero exit, and session-store is the single metadata construction point so every provider path derives transport correctly. Regression guard verified to fail on the unfixed code. No scope creep.
- Findings: none

## Behavior Diff Notes

- `browser-doctor --provider oracle` reports `ready` against Oracle 0.18.0 where it was permanently `action_required`; Oracle 0.14.1 is now rejected instead.
- The doctor `capabilities` map no longer carries `browserCookiePath`, so readiness no longer depends on a flag the wrapper never sends.
- A clean Oracle exit whose log contains `A session with the same prompt is already running` now resolves from the answer file instead of being classified as `ORACLE_SESSION_ALREADY_RUNNING`.
- A native-provider session records `meta.browser.transport: native_profile` instead of `copy_profile`.

## Residual Risks / Follow-ups

- The exact pin is intentional fail-closed behavior, not drift: the next Oracle release re-blocks the doctor until `REQUIRED_ORACLE_VERSION` is reviewed and raised again.
- `native_profile` only appears on sessions written after this change; stored session metadata from earlier native runs still reads `copy_profile`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | The goal command reports `ready` on the host binary and all four gate findings are closed with CLI-level coverage |
| Product depth | 8/10 | Each stale surface was removed rather than tolerated; the exact-match pin keeps the failure loud |
| Design quality | 9/10 | Transport derivation moved to a single helper at the one metadata construction point; no fallback or compatibility shim |
| Code quality | 9/10 | Removals are complete with no dangling references; the classification move restores the documented authority ordering |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/cli/chatgpt-browser.test.ts --timeout 60000`, `bun test tests/readme-dx.test.ts --timeout 60000`, and `bun run check:type`
- Re-check: `bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json` for `status: "ready"` with `missingCapabilities: []`, and `browser-consult --provider oracle --dry-run --prompt "Reply exactly OK"` against a real profile binding

## Summary

- BRC4b raises the exact Oracle pin to `0.18.0` so the bound-profile transport landed by #290 can actually run on this host, and closes the same gate round's four MEDIUM findings: the unsent `browserCookiePath` capability is deleted, the stale-session log match only classifies under a non-zero exit, and `meta.browser.transport` is derived from the provider with a new `native_profile` value.
