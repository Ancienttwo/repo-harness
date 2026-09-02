# Task Review: brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport

> **Status**: Accepted
> **Plan**: plans/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
> **Contract**: tasks/contracts/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.contract.md
> **Notes File**: tasks/notes/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-02 23:48
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:2882ceb46f5b59bf86e05d89e490de62257c20b320d23e831970856d4b12b162
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d8d62dea20c47d4f58638fbd4cfc93126f358144

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/chatgpt-browser/{oracle-provider,engine,session-store,types}.ts`, `tests/cli/chatgpt-browser.test.ts`, `docs/repo-harness-chatgpt-browser-engine.md`, `assets/skills/repo-harness-chatgpt/references/consult.md`
- Actual files changed: the seven above plus the workflow artifacts (plan, contract, review, notes, `tasks/todos.md`), the generated `docs/architecture/.projection-manifest.json`, and the coordinator-requested sprint row 4 checkbox in `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
- Commands passed: `bun test tests/cli/chatgpt-browser.test.ts --timeout 60000` (46 pass), `bun run check:type`, `repo-harness run verify-contract --strict` (8/8), `repo-harness run check-task-workflow --strict`, `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh`, `bash scripts/check-architecture-sync.sh`, `repo-harness run verify-sprint --prepare-acceptance`
- Residual risks: `browser-doctor` still requires the unsent `browserCookiePath` capability for `ready`; `browser.transport` is derived from the profile binding, so a deprecated native session with a binding records `copy_profile`; `REQUIRED_ORACLE_VERSION` stays pinned at 0.14.1, so this host's doctor remains `action_required` against Oracle 0.18.0
- Reviewer action required: inspect diff and card
- Rollback: revert the branch commits; the change is confined to `src/cli/chatgpt-browser` plus its tests and docs

## Mode Evidence

- Selected route: planning (sprint contract execution)
- P1/P2/P3 evidence: `plans/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` Agentic Routing section
- Root cause or plan evidence: `docs/researches/20260902-gpt-pro-connector-readback-probe.md` runs 1-6 (cookie-path 1/3, copy-profile 2/2)

## Verification Evidence

- Waza `/check` run: replaced by two `codex exec -s read-only` semantic review rounds (round 1 REJECT with six findings, round 2 PASS with none)
- Commands run: see the Human Review Card `Commands passed` line
- Manual checks: `oracle --help | grep -c copy-profile` = 1 and `oracle --debug-help | grep -c browser-chrome-profile` = 1 on the host 0.18.0 binary; `browser-doctor --provider oracle --json` reports both new capabilities true with `missingCapabilities: []`; `browser-consult --dry-run` against the real profile binding renders `--copy-profile <user-data-dir> --browser-chrome-profile "Profile 11"` with no `--browser-cookie-path` and session meta `transport: copy_profile`
- Supporting artifacts: `.ai/harness/checks/latest.json`
- Implementation notes reviewed: `tasks/notes/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.notes.md`
- Run snapshot: `.ai/harness/runs/run-20260903T014910-39220-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:2882ceb46f5b59bf86e05d89e490de62257c20b320d23e831970856d4b12b162
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d8d62dea20c47d4f58638fbd4cfc93126f358144
> **Verification Evidence SHA256**: sha256:2ff7fa44ef55a356185ec1ec5136a4cb0e27ca40fb40f13f44d519e47a9d9dca
> **Issued At**: 2026-09-02T17:51:55.207Z

- Summary: Round 2 codex exec read-only review of the full branch diff against main@d8d62dea: VERDICT PASS, no findings. The bound-profile oracle transport is --copy-profile plus --browser-chrome-profile only, with no cookie-path fallback; doctor capabilities, session meta transport, the same-prompt refusal mapping and the docs are in sync. Round 1 rejected with six findings; three were fixed (dry-run half transport, single-missing-flag coverage, no automatic --force) and three were kept as documented residual risk (browserCookiePath readiness entry, binding-derived transport for the deprecated native provider, the coordinator-requested sprint row 4 commit).
- Findings: none

## Behavior Diff Notes

- With a profile binding, the Oracle argv loses `--browser-cookie-path <cookie db>` and gains `--copy-profile <user-data-dir> --browser-chrome-profile <profile-directory>`.
- A bound consult now probes the resolved Oracle binary before running, so a binary without both transport flags is rejected where it previously ran.
- `ORACLE_PROFILE_COOKIE_NOT_FOUND` is replaced by `ORACLE_PROFILE_NOT_FOUND`, which also rejects a binding that names no Chrome profile directory.
- The oracle dry-run path now fails closed on an unusable binding instead of rendering a command.
- Every written session gains `meta.browser.transport`.

## Residual Risks / Follow-ups

- `REQUIRED_ORACLE_VERSION` is pinned at `0.14.1` while this transport was measured on Oracle 0.18.0; a real consult on this host stays blocked by the version gate until that pin is revisited in its own work-package.
- `browserCookiePath` remains in the doctor readiness set although the wrapper no longer sends the flag.
- `browser.transport` is binding-derived, so a deprecated native-provider session with a binding records `copy_profile`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Every acceptance clause is implemented and covered by CLI-level tests against a real fake-oracle argv |
| Product depth | 8/10 | Each unusable state has its own code and an actionable recovery string; the version pin still blocks a real consult on this host |
| Design quality | 8/10 | One transport, no fallback, one binding rule shared by the real and dry-run paths |
| Code quality | 9/10 | Same-package cutover with the retired path deleted; the probe is shared instead of duplicated |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/cli/chatgpt-browser.test.ts --timeout 60000` and `bun run check:type`
- Re-check: `repo-harness chatgpt browser-doctor --provider oracle --json` for the two new capabilities, and `repo-harness chatgpt browser-consult --provider oracle --dry-run --prompt "Reply exactly OK"` against a real profile binding

## Summary

- BRC4a cuts the bound-profile Oracle transport over to `--copy-profile` plus `--browser-chrome-profile`, deletes the cookie-database path in the same change, adds the two doctor capabilities to the readiness set, records `browser.transport` on every session, and maps Oracle's same-prompt refusal to `ORACLE_SESSION_ALREADY_RUNNING` without ever adding `--force`.
