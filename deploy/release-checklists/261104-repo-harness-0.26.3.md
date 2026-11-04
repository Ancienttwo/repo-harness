# repo-harness 0.26.3 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `8b127cbcbe730450b4f6e0cdc65545022e79c2c4` (#1767). The branch
  `chore/release-0.26.3` starts on this fixed base and merges no later main.
- Source commit: the head of the release-prep PR for #1796. The publish
  candidate is its merge commit on `origin/main`; the owner records it below.
- Previous release: 0.26.2, release-prep merge
  `4572d8acdd37575213d7c8b6227ea657621eb5ab` (#1744), tag `v0.26.2`.
  Publication and machine upgrade values are in
  `261104-repo-harness-0.26.2.md` (#1747, #1749).
- Merged range: `v0.26.2..8b127cbcbe730450b4f6e0cdc65545022e79c2c4`.
  `git rev-list --count` gives 28 commits, also 28 with `--first-parent`.
  All are squash merges, in this order: #1738, #1743, #1746, #1747, #1749,
  #1728, #1717, #1737, #1753, #1751, #1759, #1762, #1761, #1764, #1763,
  #1760, #1766, #1765, #1769, #1775, #1776, #1772, #1774, #1779, #1782,
  #1791, #1792, #1767.
- The four version surfaces move from 0.26.2 to 0.26.3: `package.json`,
  `assets/skill-version.json` (version and template version), README
  ("Release & license") and `src/operator-web/fixtures/bots.ts`.
- Other edits: `docs/CHANGELOG.md` and this record. No product behavior,
  dependency, lockfile, hook or install logic changes in the prep diff.
  The base already pins archctx and archctx-contracts to exact 0.11.3.
- Release date and record prefix: UTC `2026-11-04`, from `date -u +%F`.
- Publish status: published 2026-11-04 (see Publication).
- Hold reason: none.

### Owner decision

Issue #1796 records M77: prepare 0.26.3 after W1 #1767, W2 #1772, W3 #1774
and W4 #1776 merge. The owner runs publication. Advisor t11 runs the
pre-publish smoke on the release-prep merge commit. The coordinator commits
the worker diff and opens the PR (M65). This record grants no tag, npm
publish, dist-tag or GitHub Release action to the worker.

## Cause of the release

- Authorized cleanup plans, execution and agent investigation (#1738,
  #1767), with plan-time archive eligibility (#1751, #1764).
- The advisor seat send and transcript routes (#1765); repository-scoped
  seats and a shared advisor wake cap (#1782, #1792).
- Board agent identity and parent list protocol 2 (#1776, #1791).
- Whole-file MCP redaction before range selection (#1772).
- Office, Modules, Layers, Topology and quota views (#1762, #1743, #1753,
  #1763, #1766), plus hc component repair messages (#1774, #1779).
- Every merged PR appears under one change section in
  `docs/CHANGELOG.md` `[0.26.3]`. The base has no `[Unreleased]` section.
  `[0.26.2]` and all older sections must stay byte-identical to the base.

## Upgrade notes and source checks

### Board readers

- `board parents --json` is protocol 2 (#1791), with repository-wide
  `seats`. An older web bundle refuses it as `parents_invalid`.
- The board snapshot stays protocol 1. #1776 adds required
  `terminals[].agent` to the typed shape: the hc string, or null. The core
  decoder checks the protocol and kind; it does not pin terminal keys.
- Reader search in tracked `src`, `scripts` and `assets` found the Operator
  CLI bridge in `src/effects/operator/board-read.ts`. It invokes both JSON
  commands through the package-local `src/cli/index.ts`, not a global CLI.
  `server.ts` applies `decodeBoard` and `decodeBoardParents` before replies.
  Browser readers in `src/operator-web/board-view.ts` apply the same core
  decoders to the two HTTP responses. `fixtures/index.ts` also uses them.
- No other production JSON command reader was found in those roots. Board
  attention reads the collector directly. Tests use the core decoders and
  recorded fixtures. Custom readers outside this repository were not
  inspected. Upgrade them for the new shapes; no translator is shipped.
- The CLI, server and web ship in one package. Restart the Operator server
  from 0.26.3 and reload the page so its web bundle matches the server.

### Write audit

Both new POST routes register as `OperatorWriteRoute` entries in
`src/effects/operator/server.ts` and use the existing write channel:

| Route | Operation | Audit and lock target |
|---|---|---|
| `/api/v1/seats/advisor/messages` (#1765, #1782) | `advisor_seat_message` | `advisor_seat:<repository_id>` |
| `/api/v1/worktrees/cleanup/investigation` (#1767) | `worktrees_cleanup_investigation` | `worktree_cleanup_session:<session_id>` |

The advisor send binds the text by hash without storing it in the audit.
Unknown delivery is `reconcile_required`; do not send a second request to
guess whether the first arrived. Investigation advice clears every approval
box. It never authorizes removal. The transcript and investigation status
GET routes are read-only.

### Hook and install check

- `git diff --name-only v0.26.2..8b127cbcb` shows no hook runtime, install
  state, installer or candidate reconciliation change. The hook-adapters
  module doc change removes stale citations only (#1775).
- `src/cli/commands/global-runtime.ts` changes only hc client messages
  (#1774). `src/cli/index.ts` injects the review runner for investigation
  (#1767); the install/update command path is unchanged.
- Install state and candidate reconciliation stay protocol 3. The hc pin
  stays at 0.1.17. Existing `update` effects remain: it can install/update hc
  and add a missing managed Claude status line. No new migration is needed.
- Open a new cleanup plan. The required `private_only` and `no_destination`
  fields make old saved plans unreadable (#1751, #1764).
- MCP `read_text` refuses files above 512 KiB, even for a small range. For
  admitted files it redacts the whole file before the cut; source line
  numbers stay aligned (#1772).

## Publication steps for the owner

1. The coordinator commits only the six allowed paths, pushes and opens the
   release-prep PR. Complete local acceptance on the host and require green
   `Required / CI` on that PR head before merge.
2. Record the merge SHA below. Advisor t11 runs the pre-publish smoke on
   that exact merge commit. It must contain 0.26.3 on the four version
   surfaces and the `[0.26.3]` CHANGELOG section. Record the smoke command,
   result and environment. A local prep check is not this smoke.
3. Publish from a clean checkout of that merge commit. Check `npm whoami`,
   run `bash scripts/check-npm-release.sh --prepublish`, then `npm pack`.
   The owner runs `npm publish ./repo-harness-0.26.3.tgz --auth-type=web`
   in a TTY and approves the printed authentication link.
4. Read npm 0.26.3 back with `npm view --prefer-online`. Compare its shasum
   and integrity with the local tarball and check the `latest` dist-tag.
   Do not tag a different artifact or commit.
5. Tag `v0.26.3` on the publish candidate, create its GitHub Release from
   the `[0.26.3]` CHANGELOG section, then run
   `bash scripts/check-release-published.sh 0.26.3`. Record every value below.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.26.3 --no-cache
repo-harness update --version 0.26.3
```

The explicit version avoids selecting a different `latest`. From 0.25.4 or
earlier, follow the `[0.26.0]` Upgrade steps with 0.26.3 in place of 0.26.0.
Restart the Operator server and reload its page. Re-create cleanup plans.
No installed runtime was changed by this release-prep task.

### Post-upgrade probe

Advisor t11 records the owner machine upgrade and probe after publication.
Check the installed version, install state protocol 3, plugin versions and
drift with `repo-harness install --state`. Use the installed hook with a
disposable HOME and scratch repository for the established probe:
`PreToolUse --route edit` on an `_ops/` target exits 2; `Stop --route default`
and `SessionStart --route default` exit 0. Check that the restarted Operator
serves the matching web bundle and the protocol 2 parent list. The owner
machine results are in Publication below (#1804).

## Hosted CI

- Base CI run 41894674219 on
  `8b127cbcbe730450b4f6e0cdc65545022e79c2c4`: completed, success, read with
  `gh run list --commit <base> --limit 5 --json
  databaseId,name,status,conclusion,headSha` on 2026-11-04 UTC.
- Release-prep PR #1797 (#1796) `Required / CI`: success on prep head
  `4f8c4e869` (run in the PR checks; source #1801).

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0; restricted Codex sandbox.
  Worktree `/tmp/repo-harness-wt-1796-release-0263`, branch
  `chore/release-0.26.3`, base/HEAD `8b127cbcb` plus the uncommitted prep diff.
- Dependency setup: `HOME=$PWD/node_modules/.cache/rh-home bun install
  --frozen-lockfile` attempted once because `node_modules` was absent.
  Exit 1: `bun is unable to write files to tempdir: EPERM`. The scratch
  HOME is in the worktree. Dependency installation is incomplete.
- `HOME=$PWD/node_modules/.cache/rh-home bun run check:type`: exit 1 before
  type analysis. TypeScript cannot resolve
  `@typescript/typescript-darwin-arm64` from the incomplete install.
- `HOME=$PWD/node_modules/.cache/rh-home
  TMPDIR=$PWD/node_modules/.cache/rh-tmp bun run test:files
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: exit 1, 0 pass, 1 fail, 1 error. Module loading
  cannot find `archctx-contracts`; no test assertion ran. The test runner
  uses a disposable HOME. No `/bin/ps` denial occurred in these two runs.
- CHANGELOG tail check: exit 0, no output. Exact command:

  ```bash
  diff <(git show 8b127cbcb:docs/CHANGELOG.md | sed -n '/^## \[0.26.2\]/,$p') <(sed -n '/^## \[0.26.2\]/,$p' docs/CHANGELOG.md)
  ```

- `git diff --check`: exit 0. The six paths are the closed write scope.
  Test budget against the base plus working diff: 0 added test lines,
  1 added product line (`src scripts`, the bot fixture version), no new test
  file. The coordinator records the commit-bound counts after commit.
- Not run: full CI lane, release gate, prepublish gate, real model run,
  installed runtime upgrade or publication. Advisor owns the merge-commit
  pre-publish smoke. The coordinator must complete acceptance on the host.

### Yellow flags

- Mixed server/web versions fail closed at the protocol 2 parent list.
- Investigation denies all outbound IPv6 TCP. It cannot reach a model API
  on an IPv6-only network (#1767). The source PR also records a plan-save
  race window, readable archive copies outside the target deny roots and
  incomplete host-disposal proof. The other review callers' local network
  boundary is outside this release prep (#1770).
- Cleanup commit patches above 512 KiB can still fail staging and keep the
  worktree. Secret matching on adversarial input can be slow (#1764,
  #1772; tracked by #1771).
- The advisor daily cap has no atomic reservation across concurrent
  watchers (#1792).
- npm web authentication needs a TTY and owner presence. The 0.26.2
  non-TTY attempt stopped with `EOTP` (#1747).

## Release readiness items

- Host typecheck and the bot fixture test must pass before handoff is
  accepted. Record the exact subject and environment; no assertions change.
- Advisor pre-publish smoke and owner post-upgrade proof: PASS (see
  Publication). This prep makes no skill-effectiveness or
  production acceptance claim.

## Publication

- Publish candidate: release-prep merge
  `b6db3da37398f86793ef914046d41e29c8d1fe5e`, PR #1797 (#1796).
  Publication values below come from advisor t11's report in #1801.
- Advisor pre-publish smoke: PASS on b6db3da37: version 0.26.3;
  0 install-profile sections in the hook bundle; pack list 902 files with
  dist/hook-entry.js, dist/oar-review-host.js and dist/operator-ui/index.html;
  hooks PreToolUse/edit 2, Stop 0, SessionStart 0, no catalog error.
  The issue does not give the smoke command.
- npm version: `repo-harness@0.26.3`, dist-tag `latest`, published
  2026-11-04 (GitHub Release 19:43:53Z).
- Tarball shasum: `8b7a71b52be93858f0dc55b7a0906c755d42e97c`, integrity
  `sha512-sD5MXunTSqO1fj9TbzdbI3lNfIb9YnkXYlKQlYi9rM66JTBoKVSdik6s3Ul8NHpvB/uHNYYCUTWr0axbNP8E6Q==`;
  registry read-back matched (19:38:19Z to 19:43:48Z).
- Git tag: `v0.26.3`, annotated, tag object
  `21986cebe1d114a18fd2cee50b333de3d49640a3`, target b6db3da37;
  GitHub Release https://github.com/Ancienttwo/repo-harness/releases/tag/v0.26.3.
- `check-release-published.sh 0.26.3`: OK; runtime-evidence-receipt valid
  (published_tarball, clean_install, installed_hook_readback).
- Owner machine upgrade and post-upgrade probe: advisor t11's report in
  #1804, 2026-11-04 UTC (owner M82 item 4).
  - 20:10:12Z: `bun add -g repo-harness@0.26.3 --no-cache` installed global
    0.26.3.
  - 20:10:22Z: `repo-harness update --version 0.26.3`, run from `/tmp`:
    runtime reconcile ok, receipt
    `sha256:e0745637a223ac7644838d82719f767efc251c2864ec8a3caca307817325c7df`.
    Global working rules unchanged; hc 0.1.17 unchanged; 22 leftovers,
    0 removable.
  - `repo-harness install --state`: protocol 3, core 0.26.3, all 7 plugins
    0.26.3, selection all, applied 2026-11-04T20:10:29.641Z, drift consistent
    (no missing owners, no surface drift).
  - Hook probe with the installed hook, disposable HOME and scratch
    repository: PreToolUse edit on `_ops` exit 2, Stop default 0,
    SessionStart default 0, no catalog error; 0 install-profile sections.
    `dist/oar-review-host.js` and `dist/operator-ui/index.html` are present.
  - Operator on port 4318 restarted on 0.26.3 at 20:10:39Z (pid 43744,
    own session). `GET /` returned 200 with the same assets as the packaged
    `dist/operator-ui/index.html`: `index-D7rPKSwt.js`, `index-BNoMxGvm.css`,
    `rolldown-runtime-hePW80VL.js`. `/api/v1/quota` returned 200,
    `repo-harness.quota.v1`.
    `/api/v1/repositories/repo_d6a7c6d6950c10aa/board/parents` returned 200,
    protocol 2 (1 parent, 5 repository seats).
  - Pages opened before 20:10:39Z need a reload before a write because the
    write token belongs to the server process (#1795).

## Rollback

Before publication, close the prep PR or revert its merge commit. After
publication, ship a fix as 0.26.4. Do not delete the published tag.
