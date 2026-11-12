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

The life cycle stops at the merged release PR. One path releases it: the host
command list of `bash scripts/release-owner-steps.sh plan <version>`. It runs
from the release worktree `/tmp/repo-harness-wt-release-<version>`. On the
owner's explicit word for one release, the orchestrator seat runs the whole
list. That word is the explicit authorization for that production deployment.
The owner confirms the npm login in the browser, because each publish uses
`npm publish --auth-type=web`. No npm token exists.

Keep the printed list and mark a step when its command exits 0. A marked step
is done and never runs again. An unmarked step is unknown in a continued run.
`plan` refuses once a package is on npm or the tag exists, so a continued run
uses the list that the first `plan` printed. The list serves a first run and a
continued run. Stop at the first failure and report it. A host publish has no
npm provenance statement.

Settle npm first. A continued run first runs
`bash scripts/release-owner-steps.sh wait <package> <version>` for each package
whose publish step has no mark, and only then reads the states of steps 1, 2
and 3. In this settle, a wait that ends without the version means the package
is not published: its publish step runs, and this is not the stop at the first
failure.

1. Worktree: `git fetch origin && git worktree add --detach /tmp/repo-harness-wt-release-<version> <sha> && cd /tmp/repo-harness-wt-release-<version> && bun install --frozen-lockfile && bun run check:release`.
   `bun run check:release` passes before the first publish. Done state: a
   package of this version is on npm. Step 1 passed on `<sha>` before the
   first publish, so a continued run skips it and runs only
   `cd /tmp/repo-harness-wt-release-<version>`. When step 1 is not done and
   the worktree exists at `<sha>`, skip the `git worktree add`.
2. Console package: when `npm view repo-harness-operator-web@<version> version`
   prints the version, skip this step. Otherwise run, from the worktree root:
   `bash scripts/release-owner-steps.sh guard <version> <sha> && (cd packages/operator-web && npm publish --auth-type=web)`
3. Core package: the `prepublishOnly` gate of the core package needs npm to
   show the web version. When `npm view repo-harness@<version> version`
   prints the version, skip this step. Otherwise run, from the worktree root:
   `bash scripts/release-owner-steps.sh wait repo-harness-operator-web <version> && bash scripts/release-owner-steps.sh guard <version> <sha> && npm publish --auth-type=web`
4. `bash scripts/release-owner-steps.sh wait repo-harness <version> && bash scripts/release-owner-steps.sh check published <version>`
5. Tag: run `git ls-remote --tags origin "refs/tags/v<version>" "refs/tags/v<version>^{}"`.
   No output: run `git tag -a v<version> <sha> -m "repo-harness <version>" && git push origin v<version>`.
   A `^{}` line that names `<sha>`: the tag is done; skip.
   Any other output: stop and report.
6. GitHub Release: run `gh release view v<version> --json tagName,isDraft,isPrerelease`.
   Not found: run `bash scripts/release-owner-steps.sh notes <version> > /tmp/repo-harness-wt-release-<version>.notes.md && gh release create v<version> --verify-tag --title "repo-harness <version>" --notes-file /tmp/repo-harness-wt-release-<version>.notes.md`.
   Found: skip; step 7 checks it.
7. `bash scripts/release-owner-steps.sh check tagged <version>`

`wait` polls `npm view <name>@<version> version` every 10 s for 15 minutes. A
wait that ends without the version fails with the package name. Inside steps 3
and 4, the wait follows a publish that exited 0: run the same step again
later; do not publish again. The settle above is the other case.

`bash scripts/release-owner-steps.sh plan <version>` is a read-only preflight:
it runs the guard checks for a version and prints the release commit, this
command list and the post-release steps. After step 7 passes, the orchestrator
and the advisor decide together on those post-release steps:
`repo-harness update` on the owner host, the Upgrade steps of the release
notes, and the relaunch of both seats from
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

The "Acceptance environment" section of the filing records the result of
`scripts/check-release-upgrade-rehearsal.sh` (run by the `release` lane of
`scripts/check-ci.sh`): the parent version from npm, the candidate version, and
the two candidate tarballs that its registry log names. Do not record a
hand-made rehearsal.

The filing also records the consumer architecture smoke. A new consumer with a
capability registry, no `.codegraph/`, no projection manifest and a branch
that adds an unowned path must show one architecture line at SessionStart or
Stop, not silence. The automated evidence is the `tests/hook-runtime.test.ts`
test "a registry consumer without code facts or a projection manifest gets
one architecture line (#850)".
