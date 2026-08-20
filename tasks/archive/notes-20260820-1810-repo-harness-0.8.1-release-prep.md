> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# repo-harness 0.8.1 Release Prep Notes

Prepare the npm/package release line `repo-harness@0.8.1` from current `main`.

## Decisions

| Decision | Rationale | Impact |
| --- | --- | --- |
| Use `0.8.1` | npm and GitHub latest are `0.8.0`, and current `main` contains post-`0.8.0` changes that need a new package line. | `package.json`, `assets/skill-version.json`, `.claude/.skill-version`, README/localized READMEs, changelog, and release filing move together to `0.8.1`. |
| Keep one package/template version line | The repo retired the old split compatibility line in `0.4.0`; no new compatibility split is introduced here. | Downstream generated stamps move together to `repo-harness@0.8.1+template@0.8.1`. |
| Hold tag and GitHub release until npm readback | A GitHub release without a published npm tarball would create a misleading public release state. | Publish, registry readback, tag, GitHub release, and clean-room install remain a single closeout slice. |
| Include late global-runtime update in the release | `main` advanced to `e2b0099577d5568bc7e849ab5ee919267554e30a` with `src/cli/commands/global-runtime.ts` and `tests/cli/global-runtime-init.test.ts` before publish completed. | The published tarball uses `gitHead=e2b0099577d5568bc7e849ab5ee919267554e30a`; the product file is present in the package, while tests remain outside the package by normal packaging rules. |

## Evidence

- `npm view repo-harness version versions --json --registry https://registry.npmjs.org/`
  returned latest `0.8.0`.
- `npm view repo-harness@0.8.1 version --json --registry https://registry.npmjs.org/`
  returned `E404`, so the target version is available.
- `gh release list --repo Ancienttwo/repo-harness --limit 20` showed latest
  GitHub release `v0.8.0`.
- `gh release view v0.8.1 --repo Ancienttwo/repo-harness` returned
  `release not found`, and no local or remote `v0.8.1` tag exists.
- `npm whoami --registry https://registry.npmjs.org/` returned `E401` for the
  default npm config in this shell.
- `main` and `origin/main` were aligned at `7629eb1` before release prep.
- Before publish, `main` and `origin/main` were aligned at
  `e2b0099577d5568bc7e849ab5ee919267554e30a`.

## Verification

- `bun src/cli/index.ts --version` returned `0.8.1`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.8.1`, `template=0.8.1`, and project stamp up to date.
- Focused release metadata checks passed:
  `bun test tests/skill-version.test.ts tests/readme-dx.test.ts tests/bootstrap-files.test.ts`
  returned `37 pass`, `0 fail`.
- Full release gate passed before the late global-runtime update:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `986 pass`, `1 skip`, `0 fail`, then completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed`.
- A second publish attempt was interrupted while `prepublishOnly` was still
  running so the late two-file `global-runtime` update could be included. The
  final publish used `npm publish --ignore-scripts` after the explicit user
  instruction to skip retesting.
- `npm pack --dry-run --json --registry https://registry.npmjs.org/` returned
  `repo-harness-0.8.1.tgz`, package size `7961676`, unpacked size `10702785`,
  `356` files, shasum `7ee740dd0d7781f6c6b503600b1a5760306592c0`, and
  integrity
  `sha512-pBoG7xph/8GyMYFPDYU+jGdeUCzgGbGgVShmo3wwJMFO69Qq7lm0v2ryH+CaAwdh0e9BJRpY4V3buJeUlZDhFQ==`.
- `npm publish --access public --registry https://registry.npmjs.org/
  --ignore-scripts` returned `+ repo-harness@0.8.1`.
- Registry readback returned version `0.8.1`, `latest: 0.8.1`,
  `gitHead=e2b0099577d5568bc7e849ab5ee919267554e30a`, tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.8.1.tgz`, shasum
  `7ee740dd0d7781f6c6b503600b1a5760306592c0`, and integrity
  `sha512-pBoG7xph/8GyMYFPDYU+jGdeUCzgGbGgVShmo3wwJMFO69Qq7lm0v2ryH+CaAwdh0e9BJRpY4V3buJeUlZDhFQ==`.
- Git tag `v0.8.1` was pushed and resolves to
  `e2b0099577d5568bc7e849ab5ee919267554e30a`.
- GitHub release is
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.8.1`.
- `bash scripts/check-release-published.sh 0.8.1` passed with registry,
  dist-tag, tarball, tag, and local version files aligned.
