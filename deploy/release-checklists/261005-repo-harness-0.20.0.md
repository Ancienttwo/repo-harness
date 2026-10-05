# repo-harness 0.20.0 release preparation

- Date: 2026-10-05.
- Status: PREP ONLY. No publication or production acceptance is claimed.
- Branch: `codex/release-0.20.0`.
- Source base: `ffe70133fcb51fcce072f21bc0c45bda08cb0d4f`.
- Previous public release: `v0.19.5` (`55bafc00`).
- Release range: `v0.19.5..ffe70133`, 82 reachable commits.
- Version: package, skill, template, and all five README files stay `0.20.0`.
- Notes: [CHANGELOG](../../docs/CHANGELOG.md#0200---2026-10-05).
- The earlier `281e6555` filing is a historical preparation record.
  It is not publication authority. No `v0.20.0` tag exists.
- The old `codex/release-prep` branch at `9660f1d7` is preserved.
  Its proposed `0.21.0` version is superseded.

## Scope and limits

The release includes persistent Herdr task agents, protected task-goal results,
trusted observations, generic OAR review, read-only Kanban and notify status,
notify install and fixes, the verified-leftover upgrade command, retirement work,
and phase 1 R1-R4 pipeline observations.
Campaign execution and old migrations, flags, hooks, and research tools are removed.
The CHANGELOG preserves the required migration and ownership limits.
No new product code, dependency, test assertion, or abstraction is added here.

## P1/P2/P3

- P1 map: `package.json` owns the version and release routes.
  `assets/skill-version.json` and five READMEs already agree with `0.20.0`.
  `docs/CHANGELOG.md` owns release history. This file owns the current filing.
- P2 trace: `test:files` and `test:full` use `scripts/lib/ci-run-tests.sh`.
  The runner creates temporary HOME and tool roots before Bun starts.
  `prepack` builds the hook, OAR host, and operator web files.
  The tarball is installed into a temporary npm prefix and checked there.
- P3 decision: consolidate Unreleased work into the existing `0.20.0` candidate.
  Keep every version value unchanged. Keep the public `0.19.5` history intact.
  Keep the old preparation branch and filing. Do not add a second version line.

## Verification and hold

#524 and #525 landed before this rebase. #524 fixes the two fixture failures
listed below. #525 deduplicates historical upgrade fixtures and preserves their
bytes, modes, paths, and provenance. The old full result remains historical.
The following full run and tarball were produced before these test-only merges.
Targeted post-rebase results are recorded in the appended release report.
Post-rebase typecheck passed. Version tests: 14 pass. Release-route test: 1 pass.
Herdr transport and run identity: 13 pass, 0 fail, including runner cleanup.
Each test used a fresh `/tmp` HOME and the `test:files` entrypoint.
Commands and outputs are in `/tmp/release-0200-rebase-evidence/`.
No new full-suite or tarball claim is made for this revision.

One approved full-suite run completed at `d9a368c36b1a70c4e80792f970f987ca37408642`.
Command: `REPO_HARNESS_TEST_EXPENSIVE=1 bun run test:full --timeout 60000`.
Outer HOME: `/tmp/rh-home.wWUxsS`. TMPDIR: `/tmp`.
The runner created fresh HOME and tool roots for each test process.
Result: exit 1; 4,975 pass, 1 fail, 6 skip;
404 files completed; 60,917 assertions; 568.982 seconds.
Two files exited 1:

- `tests/herdr-transport.test.ts`: one test failed with a fixture startup timeout.
  The same failure reproduced on clean main `e853649e`, exit 1.
- `tests/run-identity.test.ts`: all 12 tests passed, then the runner failed to
  remove its temporary HOME with `ENOTEMPTY`. The same post-test cleanup failure
  reproduced on clean main `e853649e`, exit 1. It is not an assertion failure.

Clean-main comparison used detached `/tmp/rh-main.OVi88X/source`.
Only those two files ran. Each run had a fresh HOME and used `test:files`.
No test or product source changed. No second full suite ran.

Typecheck, 14 version tests, one release-route test, version consistency,
and the fast prepublish check passed.
Tarball pack and install passed. Installed CLI output: `0.20.0`.
Tarball SHA256: `b415f1da29aba5ca681cc6d3698e04ef0ed3db8dc5a9f6bcaefe39329fed92fb`.
Install prefix: `/tmp/rh-npm-prefix.FeaWn8`. HOME: `/tmp/rh-home.s2K46f`.
The read-only setup check returned exit 1, status `blocked`.
The fresh environment lacks host configuration, CodeGraph index, and runtime setup.
No suggested setup action, credential, or permission change was applied.

Full output and source-bound results are in `/tmp/release-0200-evidence/`.
The report and PR record exact commands and the failed clean-main comparisons.
Publication stays on hold. The new source has no full-suite result, and the
isolated setup result remains blocked. The merged fixes do not waive the old failure.
Tag, registry publication, and GitHub Release remain separate owner decisions.

Skill eval evidence is unavailable. `full_test_count`, `dry_run_ratio`,
`grader_pass_rate`, and `effectiveness_authority` are unavailable.
External brain runbooks are not read under the personal-folder ban.
Repo-local release references and scripts remain the available process evidence.

## File reason and rollback

This filing records the owner-approved preparation and its source range.
The requested report and command logs stay under `/tmp`.
A later approved Git revert of this PR restores the previous release notes.
A metadata revert does not undo product PRs or an npm publication.
