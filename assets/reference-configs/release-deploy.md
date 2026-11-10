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
`gh workflow run release.yml -f sha=<merged release commit>`. The run waits
in the `release` environment. The owner step is one action: approve that run.
The approval is the explicit authorization for that production deployment.

The run uses the `GITHUB_TOKEN` with `contents: write` and `id-token: write`
only. npm Trusted Publishing (OIDC) authenticates both publishes; no npm token
exists. The job runs only from `main`. In order, it:

1. Runs `bash scripts/release-owner-steps.sh workflow-guard <sha>`. The guard
   reads the version from `package.json` at the SHA. It refuses a SHA that is
   not the first-parent commit on `main` that set both package versions, a
   version with no CHANGELOG section, a version that is on npm, an existing
   tag, and a checkout that is not that commit unchanged.
2. Runs `bun run check:release`, the release lane, then the guard again.
3. `npm publish --provenance` for `repo-harness-operator-web`, then for
   `repo-harness`.
4. `check published <version>` reads both packages back.
5. Creates the annotated tag `v<version>` at the SHA through the GitHub API.
6. `gh release create --verify-tag` with the CHANGELOG section of the version.
7. `check tagged <version>`: the remote tag is at the release commit, and the
   GitHub Release is not a draft or a prerelease.

A failed step stops the run. A rerun of a published version stops at the
guard; nothing is published again. The owner sets npm Trusted Publishing for
both packages and the `release` environment with the owner as the required
reviewer and `main` as the only deployment branch (#2194).

`bash scripts/release-owner-steps.sh plan <version>` stays a read-only
preflight: it runs the same checks as the guard for a version and prints the
release commit, a manual command list and the post-release steps. After
step 7 passes, the orchestrator and the advisor decide together on those
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
