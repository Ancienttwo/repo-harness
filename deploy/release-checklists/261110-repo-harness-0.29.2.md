# repo-harness 0.29.2 publication record

## Scope and authority

- Base: `995620bc0` on `main`. Previous release: `v0.29.1`. Range:
  `v0.29.1..995620bc0` (8 commits). A PR merged after the base goes to the next release.
- Release date and record prefix: UTC 2026-11-10, from `date -u`.
- The core package, Operator web package, skill and template stamps, and README move to 0.29.2.
- Publish status: published. The publish candidate is merge commit `f305e0755`
  (PR #2117).

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

`bun run check:release` passed on publish candidate `f305e0755` before
publication. `check published 0.29.2` and `check tagged 0.29.2` passed after
publication. [Publication record](https://github.com/aimpact-inc/repo-harness/issues/2000#issuecomment-6759691596).

## Publication

Publish candidate merge SHA: `f305e0755` (PR #2117).

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.29.2` | `b19cafbda5d7abca747b17112109dcb29bc72845` | `sha512-XDRcxFca+/v6EDZ8RqDYIamK+l9e6NrRqdYDyk4ADC3woMshMxoRTOmZ5n3q1FgNhpgSMTcHgQ1hGtQGr+fnaQ==` | 129 |
| 2 | `repo-harness@0.29.2` | `bf364e3f9b91eb3ecd20e85f7f81bcf3541d024b` | `sha512-nm+HWbUcaJylIIyeolUF0F8bjacXOAuyP1fSPVhfBq5HXu9OOg9NeA+HC1NWsz/ffTUVZAsnaq6k/371PNwoiA==` | 721 |

The values are from the npm registry readback in the [publication record](https://github.com/aimpact-inc/repo-harness/issues/2000#issuecomment-6759691596).
Annotated tag `v0.29.2`: object `d2644d47d`, peeled `f305e0755`.
[GitHub Release](https://github.com/aimpact-inc/repo-harness/releases/tag/v0.29.2):
2026-11-10T05:17:43Z.

## Post-publish checks

- A clean install in a disposable HOME and BUN_INSTALL passed. `/healthz`
  reported version 0.29.2 and protocol 3; `GET /` returned 200.
  [Test record](https://github.com/aimpact-inc/repo-harness/issues/2000#issuecomment-6761452979).
- `bash scripts/check-release-published.sh 0.29.2 --before-tag` passed as
  step 4 inside `check published 0.29.2`.
- The owner machine runs 0.29.2 after the step 8 upgrade.
  [Upgrade record](https://github.com/aimpact-inc/repo-harness/issues/2000#issuecomment-6759692191).

## Rollback

Before publication, close the prep PR or revert its merge. After publication,
retain the published tag and use a new patch release for a correction.
