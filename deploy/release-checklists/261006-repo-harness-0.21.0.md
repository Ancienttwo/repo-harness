# repo-harness 0.21.0 release

- Date: 2026-10-06.
- Status: preparation. Publication is not yet verified.
- Lane: stable npm and GitHub Release.
- Previous release: v0.20.0, commit 0482c621abbbd7d63fed7ab3d9eef1da5658f86f.
- Source integration includes main bcae3302 and A0 integration a2bbf442.
  The native fixture uses the authoritative remote correction f05c505d.
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
- Pending: final repaired release gate, registry publication and registry readback.

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
#583 remains draft until its final checks pass.
No npm publication or GitHub Release is yet claimed.
