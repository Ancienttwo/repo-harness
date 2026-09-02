# Task Review: brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport

> **Status**: Accepted
> **Plan**: plans/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
> **Contract**: tasks/contracts/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.contract.md
> **Notes File**: tasks/notes/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-02 23:48
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:49e8a8952541ea3241c8400e840a95a7877691c600a3a2091c673db9585006bf
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: b62e6a07dc23b773a643ed454797b475176f084f

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/chatgpt-browser/{oracle-provider,engine,session-store,types}.ts`, `tests/cli/chatgpt-browser.test.ts`, `docs/repo-harness-chatgpt-browser-engine.md`, `assets/skills/repo-harness-chatgpt/references/consult.md`
- Actual files changed: the seven above plus the workflow artifacts (plan, contract, review, notes, `tasks/todos.md`), the generated `docs/architecture/.projection-manifest.json`, and the coordinator-requested sprint row 4 checkbox in `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
- Commands passed: `bun test tests/cli/chatgpt-browser.test.ts --timeout 60000` (46 pass), `bun run check:type`, `repo-harness run verify-contract --strict` (8/8), `repo-harness run check-task-workflow --strict`, `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh`, `bash scripts/check-architecture-sync.sh`, `repo-harness run verify-sprint --prepare-acceptance`
- Residual risks: `browser-doctor` still requires the unsent `browserCookiePath` capability for `ready`; `browser.transport` is derived from the profile binding, so a deprecated native session with a binding records `copy_profile`; `REQUIRED_ORACLE_VERSION` stays pinned at 0.14.1, so this host's doctor remains `action_required` against Oracle 0.18.0
- Reviewer action required: inspect diff and card
- Rollback: revert the branch commits on top of `main@b62e6a07`; the change is confined to `src/cli/chatgpt-browser` plus its tests and docs

## Mode Evidence

- Selected route: planning (sprint contract execution)
- P1/P2/P3 evidence: `plans/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` Agentic Routing section
- Root cause or plan evidence: `docs/researches/20260902-gpt-pro-connector-readback-probe.md` runs 1-6 (cookie-path 1/3, copy-profile 2/2)

## Verification Evidence

- Waza `/check` run: replaced by three `codex exec -s read-only` semantic review rounds (round 1 REJECT with six findings, round 2 PASS with none, round 3 PASS with none on the rebased base `main@b62e6a07`)
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
> **Reviewed Subject SHA256**: sha256:49e8a8952541ea3241c8400e840a95a7877691c600a3a2091c673db9585006bf
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: b62e6a07dc23b773a643ed454797b475176f084f
> **Verification Evidence SHA256**: sha256:889034af76e3d3889e38bb9769b6c22c184713cc6ee0a956a0e50296a0663150
> **Issued At**: 2026-09-02T18:43:56.045Z

- Summary: Round 3 codex exec read-only review of the full branch diff against the rebased base main@b62e6a07: VERDICT PASS, no findings. A range-diff and per-file comparison confirmed the rebase changed no source, test, docs or skill-asset content relative to the round 2 PASS; only the regenerated projection manifest, the rebound plan digest, the contract base SHA and the main version of tasks/todos.md moved. PR 289's content is untouched by this branch. The bound-profile oracle transport remains --copy-profile plus --browser-chrome-profile only, with no cookie-path fallback, and the three known items stay documented residual risk.
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
