# repo-harness 0.13.2 Release Filing

- Date: 2026-08-07
- Package: `repo-harness@0.13.2`
- Base release: `v0.13.1`
- Source range: `v0.13.1..candidate`
- Release scope: security hardening — collapse every authored `.repo-harness/`
  gitignore projection (adoption managed block, shell scaffold heredoc, this
  repo's own `.gitignore`) to a single directory-level rule so MCP credentials
  written under `<repo>/.repo-harness/` (notably `mcp.oauth-tokens.json`) can
  never sit NOT-IGNORED in a downstream working tree. Zero behavior change
  elsewhere; repo-scope retirement is deferred to a separate slice.
- Publish status: **published**. `repo-harness@0.13.2` is live on npm
  (shasum `6872fbf338ba12057e58197207565a272f40d6f9`), tagged `v0.13.2` on
  release commit `fb5c7507`, with the stable GitHub Release created and
  `check-release-published.sh 0.13.2` reporting registry, dist-tag, tarball,
  tag, and local version files in agreement.

## Candidate Evidence

- `0c8247a2` (PR #164, squash of `8d4de56b` + acceptance `daa344a2`) lands the
  directory-level rule in `src/core/adoption/gitignore-plan.ts`,
  `scripts/lib/project-init-lib.sh`, and this repo's `.gitignore`, with
  `tests/unit/gitignore-plan.test.ts` asserting exact-line presence plus an
  empty residual per-file set, and three existing scaffold/contract tests
  updated with `not.toContain` guards. `assets/templates/gitignore.template`
  carries no `.repo-harness` entries and was verified unchanged.
- Acceptance: verify-sprint `total=10 failed=0 status=Fulfilled`
  (run `run-20260807T140032-32208`), AcceptanceReceipt `external_pass` bound to
  `subject_sha256 f8ebd00e` against `467a6d26`; PR CI 4/4 green on `daa344a2`.
- Non-injury evidence: `git ls-files .repo-harness/` empty, no negation rules
  depend on the directory, `.repo-harness-owner.json` is not matched by the
  new rule, and all three `git check-ignore` probes resolve to the single
  `.gitignore:74` rule.

## Required Release Sequence

- [x] Merge the candidate work-package to `main` (PR #164 squash `0c8247a2`)
      with its AcceptanceReceipt recorded on the branch.
- [x] Bump `package.json`, `assets/skill-version.json`, `.claude/.skill-version`,
      and the five README `Current Release` blocks to `0.13.2`.
- [x] Run `bash scripts/check-npm-release.sh --prepublish` on the exact release
      commit and publish to npm.
- [x] Create the annotated tag `v0.13.2` on the published commit.
- [x] Create the stable GitHub Release `repo-harness 0.13.2` from `v0.13.2`
      with no attached asset, matching the established release convention.
- [x] Run `bash scripts/check-release-published.sh 0.13.2`.

## Rollback

- Before npm publication: revert or abandon the release-prep commit.
- After npm publication: never move or reuse `v0.13.2`; correct forward with a
  new patch release.
