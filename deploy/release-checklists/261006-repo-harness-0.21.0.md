# repo-harness 0.21.0 release

- Date: 2026-10-06.
- Status: preparation. Publication is not yet verified.
- Lane: stable npm and GitHub Release.
- Previous release: v0.20.0, commit 0482c621abbbd7d63fed7ab3d9eef1da5658f86f.
- Source integration: c47a5cdd. This combines current main b44bd386 with
  #536, #578 and the native fixture path correction 66f623d2.
- Authorization: the owner approved acceptance, main publication and release.
- Excluded: #582 required Herdr skill. It remains a separate install change.
- Notes: [CHANGELOG](../../docs/CHANGELOG.md#0210---2026-10-06).

## P1/P2/P3

- P1 map: package.json owns the version and release commands.
  assets/skill-version.json owns the generated workflow version.
  Five README files display the same release line.
- P2 trace: check:release runs projection checks, governance, full tests and
  tarball installation. prepack builds the hook, OAR host and operator web.
  check:release-published verifies registry bytes and the installed runtime.
- P3 decision: use 0.21.0 for the approved MCP contract change.
  Keep the prepare-then-acquire flow and protocol 2 seal requirement.
  Keep read-only observations separate from writer repair.

## Verification

Pending: final release gate, package contents, tarball installation,
exact-head CI, registry publication and registry readback.
Skill eval evidence is unavailable. full_test_count, dry_run_ratio,
grader_pass_rate and effectiveness_authority are unavailable.

## Risk and rollback

Existing external MCP clients must use engineer_prepare before engineer_acquire.
Old arguments fail. A legacy receipt store without a cutover seal stays blocked.
D0 is a backend foundation. Live Bot and Mini acceptance are not claimed.
Revert each squash commit with git revert <squash-commit>.
A Git revert does not undo an npm publication or ledger data.
