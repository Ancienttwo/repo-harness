# repo-harness 0.25.4 publication record

## Scope and authority

- Release-prep base: `origin/main`
  `f77f3d0486741e075c68124d2361b3c94789ca59` (#1639, the #1628 typed
  architecture read module). The coordinator decision on #1642 fixes this
  base and holds every other merge to main until the release-prep PR
  merges. The release-prep branch starts on this base and merges no later
  main.
- Source commit: the head of the release-prep PR. The publish candidate is
  the merge commit of that PR on `origin/main`. The owner records it below
  before publish.
- Previous release: 0.25.3, from the release-prep merge
  `77abe62d5b96f81d210fc3db4b0d60957aadea62` (#1576). The owner published it
  to npm on 2026-11-03 (record `261103-repo-harness-0.25.3.md`).
  - Tag `v0.25.3`: annotated. Tag object:
    `8881a80d2ba97375a9a42a891daaeeb3690fd705`. Target:
    `77abe62d5b96f81d210fc3db4b0d60957aadea62`.
- Merged range: `77abe62d5..f77f3d048`: 36 first-parent commits and
  36 commits in total (`git rev-list --count`). Every PR in the range is a
  squash merge.
- The npm package goes from 0.25.3 to 0.25.4. `package.json`,
  `assets/skill-version.json` (version and template version), README and the
  operator bot fixture show 0.25.4.
- `archctx` and `archctx-contracts` are at the locked exact 0.11.2 (#1613,
  PR #1616). The release-prep PR changes no dependency version.
- Publish status: pending owner publish.
- Hold reason: none.

### Owner decision

Milestone 0.25.4 is complete. Its parent #1503 (board v2) is closed with all
children. #1640 (CI constraint, High), #1641 (recovery generation, High) and
the archimap refresh are not in this release; they go to the next release
(coordinator decision on #1642, reversible by the owner). The owner runs
the publish; the agent does not tag, publish or create a GitHub release.

## Cause of the patch

- Install (#1601): install-state protocol 3, core plus plugins, replaces the
  `minimal|full` install profiles. `install --plugins <ids>` and
  `--no-plugins` select the plugins. `update` migrates protocol 2 to
  protocol 3 once and removes the retired `~/.claude/agents/orchestrator.md`
  (#1625).
- Seats and fleet: the orchestrator is a seat, not a fleet role (#1585). The
  orchestrator seat may call the read-only sub-agents `gatekeeper`,
  `explorer` and `deep-reasoner`; the writers and `root-cause-prover` run in
  Herdr seats (M37, M39, M40: #1630, #1636). The claim field `Seat:` is now
  `Role:` (#1598).
- Board v2 (#1503): plan data on GitHub native fields and
  `board migrate-dependencies` (#1519); acceptance on a head only with no
  `FAIL` on it (#1578); the resident attention watcher (#1580, #1589); the
  hazard list asset and rule R3 (#1621); the capability-boundary rule R5
  (#1629). The old fleet board stack is removed (#1590, #1606).
- Operator: one registry repository list, and the Fleet snapshot is removed
  (#1541); the Task drawer stage source (#1579) and task inbox (#1604);
  inbox reader fixes (#1612, #1618, #1620).
- Architecture ownership (#1624, #1287): operator reads go through owned
  modules for the session records (#1605, #1617), the notify files (#1638)
  and the architecture views (#1639); model ownership for the hc client,
  the notify secret keys and the global configuration (#1633).
- Fixes and CI: ship closeout claim election on Ubuntu 26.04 (#1637);
  `circuit_breakers` removed (#1599); docs-only PRs skip build and test jobs
  (#1603); archctx 0.11.2 (#1616).
- Tests: #1581, #1589.
- Documentation: review rounds and CI evidence (#1608, #1614);
  `hc run --no-parent` in the herdr skill context (#1632); release records
  for 0.25.2 and 0.25.3 (#1584, #1591).
- #1588 and #1602 (projection refreshes) carry no user-visible change.
- The full list is in `docs/CHANGELOG.md`, section `[0.25.4]`. The
  release-prep PR changes the entries that named issues to name the PRs:
  #1533 → #1541, #1507 → #1590, #1510 → #1585, #1601 → #1625, #1473 → #1521.
  `[0.25.3]` and all older sections are byte-identical to `f77f3d048`.

## Upgrade steps for users

These steps apply to every 0.25.x start point (0.25.0, 0.25.1, 0.25.2 or
0.25.3). Each of these releases writes install-state protocol 2, and none of
them can read protocol 3. The owner's machine starts from the 0.25.1 global
CLI with a protocol 2 state, so this upgrade is the first real run of the
protocol 2 → 3 one-shot and of the M29 `orchestrator.md` retirement.

1. Install the new CLI directly. A `repo-harness update` from an older CLI
   cannot run the cutover, because it cannot read protocol 3 after the
   candidate returns:

   ```bash
   bun add -g repo-harness@0.25.4 --no-cache
   repo-harness update
   ```

   `update` runs the one-shot migration under the install transaction (owner
   decision M35). `repo-harness update --check` prints the mapping first and
   writes nothing. A `full` state becomes the selection `"all"`. A `minimal`
   state becomes an explicit list. A `minimal` state that records a Pi
   package needs `pi` on `PATH`, or the migration refuses before any write
   with `install_plugin_unavailable`. The migration deletes
   `~/.claude/agents/orchestrator.md` only when the install state owns it and
   its hash did not change; it keeps and reports a changed file.
2. If `repo-harness update` cannot resolve `@latest` from the home
   directory, run `repo-harness update --version 0.25.4`.
3. After that update, the managed Global Working Rules block in
   `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` and the installed skills
   carry #1622 (PR #1630, M37), #1635 (PR #1636, M40) and PR #1632
   (`hc run --no-parent`). Restart
   a seat orchestrator only after this update.
4. Seats page: set the orchestrator fleet to `gatekeeper`, `explorer` and
   `deep-reasoner` (owner decision M40). A save with `root-cause-prover`
   fails with `seat_fleet_not_allowed`. Then restart the orchestrator seat
   from `repo-harness seats argv orchestrator`.
5. In each repository, run `repo-harness init --dry-run`, review the plan,
   then run `repo-harness init`. The adoption apply
   (`runAdoptionApply` → `planStandardAdoption`,
   `src/effects/adoption/standard-plan.ts:620,664-672`) removes these
   0.25.4 policy entries from `.ai/harness/policy.json` and reports them in
   the `retired-policy-keys` warning:
   - `orchestrator` from `external_tooling.agent_fleet.managed_agents`
     (#1585);
   - the `circuit_breakers` block (#1599).

   The plan also lists every other change that the adoption apply makes;
   review it before the apply. `repo-harness upgrade` does not change the
   repository policy: its cleanup path does not call the adoption plan.
6. Rollback after a committed migration:
   `bun add -g repo-harness@0.25.3 --no-cache`, delete
   `~/.repo-harness/install-state.json`, then
   `repo-harness install --profile full` or `--profile minimal` (0.25.3
   flags). A source `git revert` does not restore a ledger.

### Post-update check

Run after step 1 (or step 2). Each command and flag is in the 0.25.4 source:
`install --state` (`src/cli/index.ts:721`), `update --version`
(`src/cli/index.ts:872`), the managed block markers
(`src/cli/installer/global-context.ts:17`), the orchestrator file path
(`src/cli/installer/install-state-migration.ts:86`) and the herdr skill
roots (`src/effects/host-skill-roots.ts:13`).

```bash
# Protocol 3 and the expected selection ("all" for a former full state).
# Exit 1 with no state; a protocol 2 state fails with
# install_state_migration_required (update did not migrate it).
repo-harness install --state | grep -E '"protocol"|"selection"|"status"'

# M29: the retired orchestrator file is gone (or the update reported it as changed and kept it).
test ! -e ~/.claude/agents/orchestrator.md && echo "orchestrator.md: removed"

# M37/M40 orchestrator text in the managed block.
grep -F 'It may call the read-only roles `gatekeeper`, `explorer` and `deep-reasoner` as sub-agents.' \
  ~/.claude/CLAUDE.md ~/.codex/AGENTS.md

# M40 in the installed issue-flow skill.
grep -F 'Writers, `root-cause-prover` included' \
  ~/.claude/skills/repo-harness-issue-flow/SKILL.md

# #1632 in the installed herdr skill context.
grep -F 'hc run --bg --no-parent' \
  ~/.claude/skills/herdr/SKILL.md ~/.codex/skills/herdr/SKILL.md

repo-harness doctor
```

## Hosted CI

- Push CI on main: every run from `3816c3059` (#1519, the first PR after
  0.25.3) to `f77f3d048` passed. The run on the base is 41682710721
  (`f77f3d048`, success).
- Daily run: the last scheduled run is 41560045649 on `eeb43d27b`
  (2026-11-03T01:29Z, before 0.25.3): failure in "Daily architecture
  freshness", which #1575 fixed in 0.25.3. No Daily run ran on the 0.25.4
  range when this record was written.
- The release-prep PR needs green `Required / CI` on its head before merge.

## Acceptance environment

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0.
- `bun install --frozen-lockfile` (540 packages) in the release worktree on
  `release/0.25.4`.
- Guard: `hc`, `herdr-app` and `herdr` shims that log the call and exit 97
  are first on PATH for every test, release and readiness run. PATH holds
  only explicit directories (guard, `node_modules/.bin`, a directory with
  links to `bun`, `node`, `npm` and `npx` only, `/opt/homebrew/bin`,
  `/usr/bin`, `/bin`, `/usr/sbin`, `/sbin`), not `~/.local/bin` and not
  `~/.bun/bin`. `HC_*`, `HERDR_ENV`, `CLAUDECODE` and
  `REPO_HARNESS_SOURCE_ROOT` are removed. No run called the owner's `hc`.
- Subject: commit `aae1ff9a7` (base `f77f3d048` plus the version and
  changelog edits). The filing commit changes only this file.
- `bun run check:release`: exit 0 in 108 s. `[helpers] projection OK`;
  expensive release lane `tests/harness-benchmark-matrix.test.ts` 31 pass,
  0 fail; `[tarball-smoke] OK: repo-harness-0.25.4.tgz installs, serves the
  packaged Operator, and packaged CLI bins start`; `[release] OK: npm
  package gate passed.` Guard calls: 1 (`hc server status --json`, from the
  packaged Operator execution-state read). The gate does not need a real
  `hc`.
- `bun run check:type`: exit 0.
- Version-surface tests: `bun run test:files tests/skill-version.test.ts
  tests/installed-copy-sync.test.ts
  tests/operator-web/operator-architecture.test.tsx
  tests/operator-web/operator-bots-page.test.tsx --timeout 60000
  --max-concurrency 1`: 10, 30, 32 and 14 pass, 0 fail. Guard calls: 0.
- `grep -rln "0\.25\.3" tests` finds 1 file:
  `tests/install-profiles.test.ts`. Each hit names 0.25.3 as the protocol 2
  start point or the rollback target of the one-shot migration. No test pins
  the old package version.
- `bash scripts/check-ci.sh architecture`: exit 1, `human-action-required`,
  reason `unresolved-major-change`, `renderEquivalent: null`. 9 module pages
  differ (board, action-commands, global-runtime-reconciliation,
  hook-adapters, operator, task-agent-host, acceptance-review,
  contract-assets, execution-primitives). The projection render after #1625
  to #1639 is pending at the base. It is out of scope for this PR (the
  rolling writer and the archimap refresh own it); see yellow flag 1.
  Guard calls: 0.

## Readiness check

### Subject and commands

- Candidate: the release worktree at `aae1ff9a7`, with the guard first on
  PATH.
- Real HOME, read-only by contract, `TMPDIR=/tmp`:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    exit 1, `status: blocked`; 24 ok, 5 warn, 5 fail, 4 na, 7 needs_agent.
    Each of the 5 fails (`doctor.skill-projection`,
    `doctor.codegraph-readiness`, `doctor.codex-codegraph-mcp`,
    `doctor.claude-codegraph-mcp`, `doctor.codegraph-index`) is the same
    cause: the host install state is protocol 2 (the 0.25.1 global CLI), and
    the 0.25.4 strict reader refuses it with "run: repo-harness update". That
    is the designed behavior before the one-shot runs.
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`,
    2 findings: `unmanaged-hook-command` in `~/.claude/settings.json` and in
    `~/.codex/hooks.json`.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1, 0 items,
    the same protocol 2 refusal. With a temporary HOME: exit 0, 0 items.
  - Guard calls: 3 (`hc --version` twice, `hc ls --json --label
    repo-harness.service=attention --all` once).
- Temporary HOME: `bun src/cli/index.ts run check-deploy-sql-order`:
  exit 0, `[deploy-sql] OK`.
- Consumer architecture smoke: `bun run test:files tests/hook-runtime.test.ts
  -t "#850" --timeout 60000 --max-concurrency 1`: 2 pass, 0 fail. Guard
  calls: 0.
- `git check-ignore -v _ops/`: `.gitignore:46:_ops/`. `git ls-files _ops`:
  0 tracked files.

### Yellow flags

The owner accepts or repairs each flag before publish.

1. Architecture projection render pending at the base (`check-ci.sh
   architecture` exit 1, 9 pages). Push CI on `f77f3d048` passed; the PR
   architecture freshness job is advisory, and the Daily freshness job will
   report it. Repair: the rolling writer render and the archimap refresh,
   in the next release window.
2. Install state protocol 2 on the acceptance host (5 `setup check` fails,
   the `upgrade` refusal). Repair, an owner step: the upgrade steps above,
   then the post-update check.
3. `runtime.herdr_core` and `tooling.herdr_skill` are `needs_agent`
   (unavailable), and `doctor.board-attention-watcher` is `warn
   hc_unavailable`. The guard `hc` answers every call with exit 97, so these
   rows do not describe the owner's `hc`. Repair: run `setup check` with the
   real `hc` after `repo-harness update`.
4. Global rules managed blocks are stale (`global-rules.claude`,
   `global-rules.codex`). Repair after publication: `repo-harness update`.
5. `repo-harness` and `repo-harness-hook` are not on PATH
   (`doctor.cli-on-path`). The guard PATH leaves out the global install by
   design. Repair: none for the release.
6. Security config: 2 warn findings `unmanaged-hook-command`. Repair: a
   reviewed exception for each in `~/.repo-harness/config.json`.
7. Skills CLI missing (`runtime.skills_cli`, optional). Repair: none for the
   release.
8. Skill eval evidence unavailable for 0.25.4 (see below).

## Release readiness items

- Skill eval evidence: unavailable for 0.25.4. The only report,
  `evals/benchmark.md`, is from 2026-06-14 (0.5.1) and does not cover this
  release. 0.25.4 makes no skill-effectiveness claim.
- Readiness yellow flags: see "Readiness check".
- Known open follow-ups, not in 0.25.4:
  - #1640: CI constraint (High).
  - #1641: recovery generation (High).
  - #1607: delete the protocol 2 → 3 one-shot in 0.26.0.
  - The archimap refresh after #1628.

## Publication

- Merge the release-prep PR only after green `Required / CI` on its head.
- Owner command: publish from the merge commit after the PR merges. The
  `prepublishOnly` gate (`bash scripts/check-npm-release.sh --prepublish`)
  runs first.
- The owner records the publish candidate, the npm version, the Git tag and
  the published tarball digest here, then runs
  `bun run check:release-published`.

  - Publish candidate: `7a85940dd768459086d2cbbab84f0eb7863fccd3` (main after #1646).
    The prepublish gate (`bash scripts/check-npm-release.sh --prepublish`)
    ran at 2026-11-03T17:56:18Z. Then `npm publish --ignore-scripts` ran
    with npm web authentication.
  - npm version: `repo-harness@0.25.4`, dist-tag `latest`. Upload at
    2026-11-03T17:57:49Z. `npm view` showed the version at
    2026-11-03T18:01:58Z.
  - Git tag: annotated `v0.25.4`, tag object
    `6e144f5e1a9da0b786bed369f42e551c11f4c5f2`, on `7a85940dd`; GitHub Release
    https://github.com/Ancienttwo/repo-harness/releases/tag/v0.25.4, created
    2026-11-03T18:03:27Z, published 2026-11-03T18:03:40Z.
  - Published tarball digest: shasum `c995c8e4e85dd2fbecc202ee550714d39a9a0f84`,
    integrity `sha512-wBm9zXOqktj6NyFJQY6Dd8Mq3q+BqSgZxOkGY1f25JHFift/3iuDHVv44opbVajjtlLEH2u1TZYK+hOIGzElqg==`.
  - `bun run check:release-published`: OK, including the runtime-evidence
    receipt.

- Yellow flag for the next release: the npm registry read-back took about
  4 minutes after the upload. A 3-minute read-back wait is too short.
