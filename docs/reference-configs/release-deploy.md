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

A job that holds `id-token: write` or `contents: write` runs only inline
workflow steps and SHA-pinned actions. It checks out no code to run and runs
no install, repository script or package script. The steps of a job share one
runner and user, so a token set on one step is not safe from dependency code
that an earlier step of the same job ran. The run has six jobs:

1. `validate` (`contents: read`, `main` only): git and jq commands written in
   the workflow read the SHA as data. The job refuses a SHA that is not 40 hex
   characters or not a first-parent commit of a fresh `main`, a commit where
   either package version is not the target version or is already the target
   version in its first parent, and a commit with no CHANGELOG section.
2. `lane` (`contents: read`): checks out the SHA, runs `bun install`,
   `bun run check:release` and
   `bash scripts/release-owner-steps.sh workflow-guard <sha>` (a version that
   is on npm, an existing tag or a changed checkout fails). `npm pack` packs
   both packages; it runs the `prepack` builds. The job uploads both tarballs.
3. `publish` (`release` environment, `contents: read` and `id-token: write`):
   no checkout. It downloads the tarballs. Inline steps check that each
   tarball holds the package name and version and that npm does not have the
   version. One step then loops over `repo-harness-operator-web` and
   `repo-harness`. For each package it runs the same
   `npm publish <tarball> --provenance --ignore-scripts`, and then the same
   wait: 30 polls of `npm view <name>@<version> version`, 10 s apart, so
   5 minutes. npm must show the web package before the core publish starts,
   and the core wait ends before the read-back. When npm does not show a
   package after 5 minutes, the step fails and `published` does not run. No
   package script runs.
4. `published` (`contents: read`): checks out the SHA, runs `bun install` and
   `check published <version>`.
5. `tag` (`contents: write`): no checkout. Inline git fetches the SHA and awk
   reads its CHANGELOG section. `gh api` creates the annotated tag
   `v<version>` at the SHA, and `gh release create --verify-tag` creates the
   GitHub Release with that section.
6. `tagged` (`contents: read`): checks out the SHA and runs
   `check tagged <version>` (the remote tag is at the release commit; the
   GitHub Release is not a draft or a prerelease).

Each script step fetches `main` first, so a merge to `main` during the run
does not stop it. A failed step stops the run. A rerun of a published version
stops at the guard in `lane`; nothing is published again.

npm provenance records the workflow run commit (`GITHUB_SHA`), which is the
`main` head at dispatch, not the input SHA. Dispatch right after the release
PR merges, so that the two commits are the same or close.

### Owner setup (#2194)

- npm Trusted Publishing for each of `repo-harness-operator-web` and
  `repo-harness`: repository `aimpact-inc/repo-harness`, workflow
  `release.yml` and environment `release`. npm does not check the branch, so
  the environment field is what keeps a token from a job without the approved
  environment from publishing.
- The GitHub environment `release`: the owner as the required reviewer and a
  deployment branch policy of `main` only.

### Partial publish recovery

When the run stops after a publish, a rerun refuses. A core npm lag over
5 minutes fails the `publish` job, so a rerun stops at `already on npm`.
The release uses this recovery. The owner completes the release by hand from
the release commit. Read the state of each step before the step, and do only
the steps that are not done. Stop at the first failure and report it.

1. Worktree: `git fetch origin && git worktree add --detach /tmp/repo-harness-wt-release-<version> <sha> && cd /tmp/repo-harness-wt-release-<version> && bun install --frozen-lockfile`
2. Console package: when `npm view repo-harness-operator-web@<version> version`
   prints the version, skip this step. Otherwise run, from the worktree root:
   `bash scripts/release-owner-steps.sh guard <version> <sha> && (cd packages/operator-web && npm publish --auth-type=web)`
3. Core package: when `npm view repo-harness@<version> version` prints the
   version, skip this step. Otherwise run, from the worktree root:
   `bash scripts/release-owner-steps.sh guard <version> <sha> && npm publish --auth-type=web`
4. `bash scripts/release-owner-steps.sh check published <version>`
5. Tag: run `git ls-remote --tags origin "refs/tags/v<version>" "refs/tags/v<version>^{}"`.
   No output: run `git tag -a v<version> <sha> -m "repo-harness <version>" && git push origin v<version>`.
   A `^{}` line that names `<sha>`: the tag is done; skip.
   Any other output: stop and report.
6. GitHub Release: run `gh release view v<version> --json tagName,isDraft,isPrerelease`.
   Not found: run `bash scripts/release-owner-steps.sh notes <version> > /tmp/repo-harness-wt-release-<version>.notes.md && gh release create v<version> --verify-tag --title "repo-harness <version>" --notes-file /tmp/repo-harness-wt-release-<version>.notes.md`.
   Found: skip; step 7 checks it.
7. `bash scripts/release-owner-steps.sh check tagged <version>`

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
