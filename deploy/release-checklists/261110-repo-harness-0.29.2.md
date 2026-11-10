# repo-harness 0.29.2 publication record

## Scope and authority

- Base: `995620bc0` on `main`. Previous release: `v0.29.1`. Range:
  `v0.29.1..995620bc0` (8 commits). A PR merged after the base goes to the next release.
- Release date and record prefix: UTC 2026-11-10, from `date -u`.
- The core package, Operator web package, skill and template stamps, and README move to 0.29.2.
- Publish status: not published. The life cycle stops at the merged release PR.
  The owner retains npm publication, the tag and the GitHub Release (#2008).

## Cause of the release

Installed 0.29.1 lacks the Coordinator and Model claim lines, the newest-subject
sync carry rule, and attention watcher recovery after a provider 5xx.

| PR | Commit | Section in 0.29.2 | Change |
|---|---|---|---|
| #2099 | `883b9104d` | Documentation | Update transferred repository references |
| #2097 | `4a6c4aaf8` | Documentation | Worker owns push, PR and fix rounds |
| #2098 | `7653ee379` | Changed | Medium acceptance and reviewer family |
| #2104 | `c339b33fa` | Changed | Bind dispatch claims to coordinator |
| #2105 | `726146620` | Changed | Model-based writer family, plan holds and review `--pr` |
| #2110 | `a4b58a164` | Changed | Newest proven subject decides sync carry |
| #2111 | `e2e0f4f9f` | Fixed | Attention watcher survives provider 5xx |
| #2112 | `995620bc0` | Fixed | Classify install failures from failed-step evidence |

## Publication steps

The owner runs these steps, or authorizes a seat to run them, after this PR
merges with green CI.

1. Run `bun run check:release` on the host after clearing
   `packages/operator-web/dist` and `node_modules/repo-harness-operator-web`.
2. Before publication, run `bash scripts/release-owner-steps.sh plan 0.29.2`
   from the merge commit on `origin/main`. Follow its numbered owner steps.
3. After publication, run `bash scripts/release-owner-steps.sh check published
   0.29.2`. After the tag and GitHub Release, run `check tagged 0.29.2`.
   Record the shasum, integrity and file count of each package.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.29.2 --no-cache && repo-harness update --version 0.29.2
```

Restart the Operator server and reload the page.

## Acceptance environment

Pending: record the release gate and CI results at publication time.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.29.2` | pending | pending | pending |
| 2 | `repo-harness@0.29.2` | pending | pending | pending |

Record local tarball values and registry readback for each field before
marking publication complete. Tag and GitHub Release: pending.

## Post-publish checks

- In a disposable HOME and BUN_INSTALL, run `bun x repo-harness@0.29.2
  install --plugins operator`, start `repo-harness operator serve`, and verify
  that `/healthz` reports 0.29.2 and its protocol, and `GET /` returns 200.
  Result: pending.
- Run `bash scripts/check-release-published.sh 0.29.2`. Result: pending.
- On the owner machine, run the upgrade command and record the installed
  version. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. After publication,
retain the published tag and use a new patch release for a correction.
