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

The life cycle stops at the merged release PR. npm publish needs the owner's
npm 2FA, so publish, the tag and the GitHub Release stay with the owner.
After the release PR merges, run `git fetch origin` and then
`bash scripts/release-owner-steps.sh plan <version>`. The script only reads.
It finds the first-parent commit on `origin/main` that set both package
versions, and it fails when `origin/main` is stale, either version is on
npm, the tag exists or CHANGELOG has no section for the version. It prints
one command list bound to that commit:

1. A detached worktree of the release commit and `bun install --frozen-lockfile`.
2. `guard <version> <sha>`, then `npm publish --auth-type=web` for the console.
3. `guard <version> <sha>`, then `npm publish --auth-type=web` for the core
   package. `guard` refuses another directory, another HEAD, a changed tree
   or another package version.
4. `check published <version>`: `check:release-published --before-tag`
   reads back version, `latest` dist-tag, integrity and the runtime receipt.
5. The annotated tag at the release commit and its push.
6. `notes <version>` writes the CHANGELOG section to a file, then
   `gh release create --verify-tag` uses it as the notes.
7. `check tagged <version>`: the remote tag is at the release commit, and
   the GitHub Release is not a draft or a prerelease.

At the first failure the owner stops and reports. Nothing is retried or
published again. The owner gives one GO for the list:
`Release GO: repo-harness <version> at <sha>`, the first line of the plan.
After step 7 passes, the orchestrator and the advisor decide together on the
post-release steps that the plan prints: `repo-harness update` on the owner
host, the Upgrade steps of the release notes, and the relaunch of both seats
from `repo-harness seats argv <seat> --repository-id <id>`.

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
