# repo-harness 0.20.0 release preparation

- Date: 2026-10-05.
- Status: PREP ONLY. No publication or production acceptance is claimed.
- Branch: `codex/release-0.20.0`.
- Source base: `e853649eee1d73582bac37f7eb39124c8035a9bc`.
- Previous public release: `v0.19.5` (`55bafc00`).
- Release range: `v0.19.5..e853649e`, 80 reachable commits.
- Version: package, skill, template, and all five README files stay `0.20.0`.
- Notes: [CHANGELOG](../../docs/CHANGELOG.md#0200---unreleased).
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

One full-suite run is approved. Every run uses a fresh HOME under `/tmp`.
Only failed files will be compared with a detached clean-main worktree under `/tmp`.
Record command results, source revision, counts, and tarball hash in
`/tmp/release-0200-report.md` and the PR body before completion.
No second full-suite run is authorized.
The final release gate, tag, registry publication, and GitHub Release stay separate.
Any failed or incomplete check is a release hold. Do not edit assertions to hide it.

Skill eval evidence is unavailable. `full_test_count`, `dry_run_ratio`,
`grader_pass_rate`, and `effectiveness_authority` are unavailable.
External brain runbooks are not read under the personal-folder ban.
Repo-local release references and scripts remain the available process evidence.

## File reason and rollback

This filing records the owner-approved preparation and its source range.
The requested report and command logs stay under `/tmp`.
A later approved Git revert of this PR restores the previous release notes.
A metadata revert does not undo product PRs or an npm publication.
