# Release Process & Deployment Reference

> Externalized: full runbook lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/runbooks/runbook-agentic-release-deploy.md`

## Repo Role

This repo keeps deployment contract surfaces under `deploy/` and private runtime
state under ignored `_ops/`. Detailed release patterns, Cloudflare examples, and
rollback playbooks belong in the external runbook.

Tests whose cost is a real package install or a real external program are gated
behind `REPO_HARNESS_TEST_EXPENSIVE`. The PR lanes do not run them. The daily
`scripts/check-ci.sh functional` lane and the `release` lane export that
variable and run them. `bun run check:release` runs the `release` lane after
the npm unpublished-version preflight. That lane runs the expensive-gated files
and the tarball install smoke. It is not a second full suite and not the CI
gate; a release depends on green CI for the release SHA. `prepublishOnly`
stays a fast pre-publish check that never runs tests.
A bare `bash scripts/check-ci.sh` defaults to `affected`; it is not a release gate.

The core and operator web packages use the same version. `check:release`
requires both versions to be unpublished. Publish `repo-harness-operator-web`
first, then publish `repo-harness`: each prepublish gate checks its own package,
and the core gate requires the matching operator web version on npm. After both
publishes, `check:release-published` verifies both registry tarballs and latest
tags, the Git version tag, and the core runtime receipt.

## Owner Release GO

The life cycle stops at the merged release PR. One run of
`.github/workflows/release.yml` publishes, tags and releases the merged
release commit. The orchestrator seat starts it:
`gh workflow run release.yml -f sha=<merged release commit>`. The run name is
`Release <sha>`. The `publish` job waits in the `release` environment. The
owner step is one action: approve that run. The approval is the explicit
authorization for that production deployment.

No code from the input commit runs before the commit is proved a release
commit on `main`, and the job that holds `id-token: write` runs only after
that proof. The run has three jobs:

1. `validate` (`contents: read`, `main` only): git commands written in the
   workflow read the SHA as data. The job refuses a SHA that is not 40 hex
   characters or not a first-parent commit of a fresh `main`, a commit where
   either package version is not the target version or is already the target
   version in its first parent, and a commit with no CHANGELOG section.
2. `lane` (`contents: read`): `bun install` and `bun run check:release`.
3. `publish` (`release` environment, `contents: write` and `id-token: write`):
   - `bash scripts/release-owner-steps.sh workflow-guard <sha>` refuses a
     version that is on npm, an existing tag and a changed checkout.
   - `npm publish --provenance` for `repo-harness-operator-web`, then for
     `repo-harness`.
   - `check published <version>` reads both packages back.
   - The annotated tag `v<version>` at the SHA, created through the GitHub API.
   - `gh release create --verify-tag` with the CHANGELOG section.
   - `check tagged <version>`: the remote tag is at the release commit, and the
     GitHub Release is not a draft or a prerelease.

Each script step fetches `main` first, so a merge to `main` during the run
does not stop it. A failed step stops the run. A rerun of a published version
stops at the guard; nothing is published again.

### Owner setup (#2194)

- npm Trusted Publishing for each of `repo-harness-operator-web` and
  `repo-harness`: repository `aimpact-inc/repo-harness`, workflow
  `release.yml` and environment `release`. npm does not check the branch, so
  the environment field is what keeps a token from a job without the approved
  environment from publishing.
- The GitHub environment `release`: the owner as the required reviewer and a
  deployment branch policy of `main` only.

### Partial publish recovery

When `repo-harness-operator-web` is on npm and the `repo-harness` publish
failed, the owner completes the release by hand from the release commit:

1. `git fetch origin && git worktree add --detach /tmp/repo-harness-wt-release-<version> <sha> && cd /tmp/repo-harness-wt-release-<version> && bun install --frozen-lockfile`
2. `bash scripts/release-owner-steps.sh guard <version> <sha> && npm publish --auth-type=web`
3. `bash scripts/release-owner-steps.sh check published <version>`
4. `git tag -a v<version> <sha> -m "repo-harness <version>" && git push origin v<version>`
5. `bash scripts/release-owner-steps.sh notes <version> > /tmp/repo-harness-wt-release-<version>.notes.md && gh release create v<version> --verify-tag --title "repo-harness <version>" --notes-file /tmp/repo-harness-wt-release-<version>.notes.md`
6. `bash scripts/release-owner-steps.sh check tagged <version>`

When both packages are on npm and a later step failed, start at step 3. Stop
at the first failure and report it.

`bash scripts/release-owner-steps.sh plan <version>` stays a read-only
preflight: it runs the guard checks for a version and prints the release
commit, a manual command list and the post-release steps. After the run
passes, the orchestrator and the advisor decide together on those
post-release steps: `repo-harness update` on the owner host, the Upgrade
steps of the release notes, and the relaunch of both seats from
`repo-harness seats argv <seat> --repository-id <id>`.

## Webapp Release Shape

- For a SaaS webapp with public SEO/SSR plus authenticated workspace, prefer one
  TanStack Start + Vite Cloudflare Worker under `apps/web`.
- Route `/` as SSR/prerender-capable public landing; route `/app` as client-only
  with route-level `ssr: false` when it owns auth, WebGL, or browser-only state.
- Deploy Start/Workers apps with `wrangler deploy`, not `wrangler pages deploy`.
- Keep API, Agent, MCP, queue, and storage Workers separate only when they own
  distinct runtime authority; static `apps/marketing` Pages is legacy/rollback
  or content scope, not the default SEO/SSR webapp shape.

## Release Filings

Release filing documents live under `deploy/release-checklists/` and must use a
`YYMMDD-<package>-<version>.md` filename, for example
`260531-repo-harness-0.1.3.md`. The filing records the exact release scope,
source commit, verification, publish status, and any hold reason. Skill eval
evidence must record `full_test_count`, `dry_run_ratio`, `grader_pass_rate`, and
`effectiveness_authority`; full-test evidence is authoritative, dry-run-heavy
evidence is non-authoritative, and missing eval evidence must be called out as
unavailable. Readiness yellow flags from `repo-harness-check` must be recorded
with either the accepted reason or the concrete repair command, including Waza
staging drift, CodeGraph version drift, or non-authoritative
skill eval evidence. Do not rely only on npm or GitHub release metadata for this
local audit trail.

The filing also records the consumer architecture smoke. A new consumer with a
capability registry, no `.codegraph/`, no projection manifest and a branch
that adds an unowned path must show one architecture line at SessionStart or
Stop, not silence. The automated evidence is the `tests/hook-runtime.test.ts`
test "a registry consumer without code facts or a projection manifest gets
one architecture line (#850)".
