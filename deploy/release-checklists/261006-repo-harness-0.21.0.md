# repo-harness 0.21.0 release

- Date: 2026-10-06.
- Status: GitHub and npm publication verified. Local runtime refresh verified.
- Lane: stable npm and GitHub Release.
- Previous release: v0.20.0, commit 0482c621abbbd7d63fed7ab3d9eef1da5658f86f.
- Source release commit: ef695fb9f964f29342ee6c98ce150601006eb40f.
- Source parent: 49da69373e19fe5fe65a716c446b67a47e2812f4.
- Reviewed head: e08970f862edd8e4f97045b43900ba441d0d9b6f.
- Source and reviewed trees agree: ba451d431926cd99844566ff432edc40bc56e0ff.
- Authorization: the owner approved acceptance, main publication and release.
- The owner expanded this release to include #582 after its main merge.
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

- Source 03ac5887: typecheck, projections and governance passed.
- Hosted #578 head a2bbf442 and #583 head 03ac5887: required CI passed.
  Native macOS review acceptance and Windows protected helpers passed.
  Daily-only hosted lanes were skipped.
- Full run in the Projects checkout: 406 files, 5397 pass, 0 failed assertions,
  6 skipped tests and 66783 expectations. The command exited 1 after all eight
  session-state-authority tests passed. Temporary-directory cleanup raised
  ENOTEMPTY. This is not a passing release gate.
- Cause: that fixture starts a detached tooling advisory refresh. The child
  continues to write temporary HOME after the test process exits.
- Repair: disable only that optional refresh in the state-authority fixture.
  Keep every state, budget and telemetry assertion. Keep production defaults.
- Affected delta: typecheck passed; session-state-authority and session-context
  completed 69 tests and 271 expectations, with 0 failures.
- Earlier /tmp checkout failures: main reproduces 28 failures in three files.
  The same release candidate outside /tmp passes all 87 tests in those files.
  Those fixtures use repository ROOT as a non-temporary path.
- Tarball: 796 entries; required new runtime files and all three bundles exist.
  SHA256: c0199dbfb4ea9eda8e780e2e3d6018124667edcdb579818110c851f208ddbf03.
  A fresh install reports 0.21.0. Command entrypoints and hook state readback pass.
- Final repaired gate at e08970f8: bun run check:release returned 0.
  Full suite: 406 files, 5397 pass, 0 fail, 6 skip and 66783 expectations.
  Tarball installation, packaged Operator, CLI/hook state and installed MCP
  OAuth smoke all passed. The earlier failed runs remain historical evidence.
- Exact e08970f8 hosted required CI and Windows protected helper acceptance pass.
- The first npm publish attempt returned EOTP. The owner completed browser
  authentication and published the reviewed tarball. npm returned HTTP 202 and
  CLI exit 0. Registry readback still returned E404 at 2026-10-06 09:05 UTC.
  That observation is historical. A later readback resolves this hold.
- bun run check:release-published returned 0. Registry version and latest tag
  are 0.21.0. Downloaded registry tarball integrity matches the release bytes.
  Clean-room installed CLI and hook runtime evidence is valid:
  sha256:ace6597df65340d05020affde0979dc9477a4bc47dd734477af5d29721305994.
- Local refresh uses the canonical host transaction and verified GitHub tarball.
  It returned 0. The installed candidate receipt reports complete scope.
  CLI readback is 0.21.0. Managed dependencies and daemon compatibility pass.
  Codex hooks are 12/12. Claude hooks are 9/9. Both Herdr skills match herdr --skill.
  Setup check has 32 ok and 0 fail. One optional Skills CLI warning and existing
  unmanaged-hook notices remain. No permission bypass or daemon restart ran.
- GitHub Release: https://github.com/Ancienttwo/repo-harness/releases/tag/v0.21.0.
  It is public and stable. The tag points to the source release commit above.
- Annotated tag object: 3a0a879910a156ea91d4510cdf1bea6c982d38fa.
- The GitHub tarball was downloaded. Its SHA256 equals the locally verified
  c0199dbfb4ea9eda8e780e2e3d6018124667edcdb579818110c851f208ddbf03.
  This proves the GitHub asset bytes. It does not prove npm availability.

Skill eval evidence is unavailable. full_test_count, dry_run_ratio,
grader_pass_rate and effectiveness_authority are unavailable.

## Risk and rollback

Existing external MCP clients must use engineer_prepare before engineer_acquire.
Old arguments fail. A legacy receipt store without a cutover seal stays blocked.
D0 is a backend foundation. Live Bot and Mini acceptance are not claimed.
Hosts without release-matched Herdr cannot complete init --apply.
The old 8de74ebd release gate was stopped after this scope change.
It completed 140 file summaries and has no final full-suite result.
Revert each squash commit with git revert <squash-commit>.
A Git revert does not undo an npm publication or ledger data.

## Daily publication record

The owner approved these main publications and stable release.
GitHub confirms the following squash boundaries.

| PR | Merge SHA | Parent SHA | Rollback |
| --- | --- | --- | --- |
| #581 | b44bd386426f206405da194dd968f0fafa92d213 | 9d24be821d8bb67cb0fb756b722353c47899f5c6 | git revert b44bd386 |
| #582 | faa6fabd257c591dda2447db73e2a00e5a8b09d6 | b44bd386426f206405da194dd968f0fafa92d213 | git revert faa6fabd |
| #536 | bcae3302017ea69f12dde1ee2afe2868c1e28153 | faa6fabd257c591dda2447db73e2a00e5a8b09d6 | git revert bcae3302 |
| #578 | 49da69373e19fe5fe65a716c446b67a47e2812f4 | bcae3302017ea69f12dde1ee2afe2868c1e28153 | git revert 49da6937 |

#581 and #582 were merged by another actor during this session.
#583 merged as ef695fb9f964f29342ee6c98ce150601006eb40f.
Its parent is 49da69373e19fe5fe65a716c446b67a47e2812f4.
Rollback: git revert ef695fb9f964f29342ee6c98ce150601006eb40f.
GitHub, npm registry bytes, clean-room runtime and local refresh are verified.
