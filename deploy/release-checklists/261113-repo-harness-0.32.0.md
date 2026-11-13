# repo-harness 0.32.0 publication record

## Scope and authority

- Base: `844d59141` on `main` (#2693, the projection refresh on top of
  `c9f593502`). Previous release: `v0.31.0`. Range: `v0.31.0..844d59141`
  (42 first-parent commits). A PR merged after the base goes to the next
  release.
- Release date and record prefix: UTC 2026-11-13.
- The core package, Operator web package, skill and template stamps, and README
  move to 0.32.0. The range changes no dependency in `package.json`: `archctx`
  and `archctx-contracts` stay at 0.13.0, and the herdr-core floor stays at
  0.1.20.
- Parent #2624, issue #2695. Owner word "A"
  ([6847162597](https://github.com/aimpact-inc/repo-harness/issues/2624#issuecomment-6847162597))
  authorizes the release.
- Daily evidence: CI run 43336357336 (schedule) on `844d59141`, green.
- Publish status: not published. The life cycle stops at the merged release
  PR. `npm publish`, the tag and the GitHub Release stay with the owner and
  the host command list of `bash scripts/release-owner-steps.sh plan 0.32.0`
  (#2641; `.github/workflows/release.yml` is deleted).

## Cause of the release

The release holds the 0.32.0 section of `docs/CHANGELOG.md`: the stored Codex
credit mode (#2630), the Claude `hyper` mode and the model-change restart of a
seat reset (#2633), the two-tier seat reset (#2625), one release path (#2641),
changelog fragments (#2660) and the archctx update and Windows fixes. Each row
names one first-parent commit of the range, oldest first.

| PR | Commit | Merged PR title |
|---|---|---|
| [#2612](https://github.com/aimpact-inc/repo-harness/pull/2612) | `edc764364` | ci: a test path that does not exist fails the run; drop three deleted paths from the daily native list |
| [#2616](https://github.com/aimpact-inc/repo-harness/pull/2616) | `00b1184c7` | fix(locking): a Windows ticket read that gets EPERM for an unlinked ticket skips it (#2609) |
| [#2623](https://github.com/aimpact-inc/repo-harness/pull/2623) | `f3399acea` | fix(release): the README version pin joins the version drift check |
| [#2614](https://github.com/aimpact-inc/repo-harness/pull/2614) | `8cf0f8879` | ci(probe): a manual run of named test files on a chosen runner, with no probe PR (#2610) |
| [#2628](https://github.com/aimpact-inc/repo-harness/pull/2628) | `184c24926` | fix(effects): on Windows, a rename or read that races another process waits within one bound (#2615) |
| [#2619](https://github.com/aimpact-inc/repo-harness/pull/2619) | `fd4e2ed69` | chore(projection): refresh generated architecture outputs for main@00b1184c75bf |
| [#2634](https://github.com/aimpact-inc/repo-harness/pull/2634) | `ba591b104` | fix(ci): the probe JUnit read accepts the Windows file attribute (#2632) |
| [#2631](https://github.com/aimpact-inc/repo-harness/pull/2631) | `b33d57bb4` | feat(seats): the seat reset compacts below a 32 MiB transcript and clears above it (#2625) |
| [#2657](https://github.com/aimpact-inc/repo-harness/pull/2657) | `abe72b2b0` | ci(publication): remove the merge_group lane and the merge_queue policy key (#2462) |
| [#2640](https://github.com/aimpact-inc/repo-harness/pull/2640) | `bc5a057ae` | feat(quota): a stored Codex credit mode replaces --spend-credits (#2630) |
| [#2629](https://github.com/aimpact-inc/repo-harness/pull/2629) | `398106bef` | fix(hook): a checkpoint timeout of the architecture notice goes to diagnostics, not to a Stop block (#2491) |
| [#2638](https://github.com/aimpact-inc/repo-harness/pull/2638) | `999ab13bb` | ci(changelog): a PR that changes a released section fails (#2622) |
| [#2648](https://github.com/aimpact-inc/repo-harness/pull/2648) | `10c2f818c` | fix(update): a managed archctx link of another version moves to the new pin (#2642) |
| [#2649](https://github.com/aimpact-inc/repo-harness/pull/2649) | `0fe3f639b` | test(ci): the missing-path cases of check-ci prove the guard (#2645) |
| [#2652](https://github.com/aimpact-inc/repo-harness/pull/2652) | `0a4303a4e` | test(stop-handler): the reset path expectations use the product path builders (#2644) |
| [#2656](https://github.com/aimpact-inc/repo-harness/pull/2656) | `f47c28839` | test(isolation): PI_CODING_AGENT_DIR joins the tool roots of the test HOME isolation (#2655) |
| [#2659](https://github.com/aimpact-inc/repo-harness/pull/2659) | `02d98bc76` | ci(test): a BUN_TEST_FILES name that is not a file fails with that name (#2647) |
| [#2651](https://github.com/aimpact-inc/repo-harness/pull/2651) | `faa1a7532` | fix(seats): the seat reset counts a resume prompt that arrived as a queued command (#2637) |
| [#2654](https://github.com/aimpact-inc/repo-harness/pull/2654) | `f898aa4d6` | fix(runtime): on Windows, an absolute REPO_HARNESS_NODE_BIN is accepted without POSIX execute bits (#2653) |
| [#2635](https://github.com/aimpact-inc/repo-harness/pull/2635) | `6753de966` | chore(projection): refresh generated architecture outputs for main@faa1a7532db6 |
| [#2662](https://github.com/aimpact-inc/repo-harness/pull/2662) | `1eb4359a9` | fix(board): closeout does not keep a worktree for a finished terminal whose cwd is gone (#2658) |
| [#2667](https://github.com/aimpact-inc/repo-harness/pull/2667) | `f8787a347` | docs(setup): ci-scope.md drops the merge-queue sentence (#2664) |
| [#2670](https://github.com/aimpact-inc/repo-harness/pull/2670) | `517cecb4f` | test(archctx-provider): the node stubs run on Windows (#2661) |
| [#2673](https://github.com/aimpact-inc/repo-harness/pull/2673) | `188201a94` | fix(update): one package root names the managed archctx link (#2669) |
| [#2672](https://github.com/aimpact-inc/repo-harness/pull/2672) | `d56141f0a` | fix(report-ci): a provider request timeout is an outage, not a rollback defect (#2663) |
| [#2650](https://github.com/aimpact-inc/repo-harness/pull/2650) | `f8d9640fe` | feat(release): the release has one path, the host command list (#2641) |
| [#2665](https://github.com/aimpact-inc/repo-harness/pull/2665) | `c5ed6efba` | feat(seats): Claude hyper mode gives the advisor its config entry; a tier-2 reset restarts a seat on a model change (#2633) |
| [#2671](https://github.com/aimpact-inc/repo-harness/pull/2671) | `5467df49e` | chore(projection): refresh generated architecture outputs for main@d56141f0a2b4 |
| [#2677](https://github.com/aimpact-inc/repo-harness/pull/2677) | `b408c6733` | chore(projection): refresh generated architecture outputs for main@5467df49e10e |
| [#2676](https://github.com/aimpact-inc/repo-harness/pull/2676) | `7bd504e93` | docs(archimap): link every module document; refresh the map at d56141f0 (#2674) |
| [#2666](https://github.com/aimpact-inc/repo-harness/pull/2666) | `52d029dc4` | ci(release): the upgrade rehearsal runs on a disposable runner, through the probe workflow (#2626) |
| [#2680](https://github.com/aimpact-inc/repo-harness/pull/2680) | `b2c2d6559` | fix(board): closeout removes every finished seat terminal whose cwd is gone (#2675) |
| [#2681](https://github.com/aimpact-inc/repo-harness/pull/2681) | `2f4119d7c` | chore(projection): refresh generated architecture outputs for main@b2c2d6559de0 |
| [#2668](https://github.com/aimpact-inc/repo-harness/pull/2668) | `ab1547db2` | feat(changelog): one fragment file for each PR; the release prep assembles the section (#2660) |
| [#2683](https://github.com/aimpact-inc/repo-harness/pull/2683) | `322a55b5a` | feat(archimap): the behavior board links each declared state machine to its archctx diagram (#2179) |
| [#2682](https://github.com/aimpact-inc/repo-harness/pull/2682) | `05ec14c3d` | fix(seats): a reserved Claude account replaces only the Claude seats of an important route with worker-light (#2679) |
| [#2688](https://github.com/aimpact-inc/repo-harness/pull/2688) | `fad82274c` | ci(architecture): the daily architecture lane fails on a dead or missing archimap module link (#2685) |
| [#2689](https://github.com/aimpact-inc/repo-harness/pull/2689) | `01f02b925` | chore(projection): refresh generated architecture outputs for main@05ec14c3d857 |
| [#2687](https://github.com/aimpact-inc/repo-harness/pull/2687) | `48cae2d58` | fix(operator): docs github_remote_missing names the remote URLs it read and the GitHub repository it expected (#2684) |
| [#2690](https://github.com/aimpact-inc/repo-harness/pull/2690) | `01c93da6c` | chore(projection): refresh generated architecture outputs for main@48cae2d58a39 |
| [#2692](https://github.com/aimpact-inc/repo-harness/pull/2692) | `c9f593502` | fix(operator): the docs remote-missing detail passes the console decoder before the collector caches it (#2691) |
| [#2693](https://github.com/aimpact-inc/repo-harness/pull/2693) | `844d59141` | chore(projection): refresh generated architecture outputs for main@c9f593502d94 |

## Order of the owner steps

1. The release PR merges by rule 2 (acceptance PASS for the head, cross-model
   review PASS, `Required / CI` green).
2. On `main` after the merge, run `git fetch origin && bash
   scripts/release-owner-steps.sh plan 0.32.0`. It binds the command list to
   the first-parent commit that sets `package.json` to 0.32.0 and refuses when
   a package of 0.32.0 is on npm or the tag `v0.32.0` exists.
3. The owner runs steps 1 to 7 of that list in order: `check:release` in
   `/tmp/repo-harness-wt-release-0.32.0`, the guarded `npm publish
   --auth-type=web` of `repo-harness-operator-web` and then `repo-harness`,
   `wait` and `check published 0.32.0`, the tag, the GitHub Release from
   `notes 0.32.0`, and `check tagged 0.32.0`. On the owner's word, the
   orchestrator seat runs the list and the owner confirms the npm login.
4. Steps 8 to 10 (joint decision after step 7): the host update, the Upgrade
   lines of the 0.32.0 section and the restart of the orchestrator and advisor
   seats.

A continued run follows the rules at the top of the `plan` list
(`scripts/release-owner-steps.sh:188-191`). It first settles npm: it runs
`release-owner-steps.sh wait <package> 0.32.0` for each package whose publish
step has no mark. A package whose version is absent after this settle runs
its publish step. A marked step, or a step whose result shows it done (npm
shows the version, the tag is at the release commit, the GitHub Release
exists), is skipped. After a publish that exited 0, a failed wait runs the
same step again later and never publishes again.

## Upgrade steps for users

The Upgrade and Rollback subsections of the 0.32.0 CHANGELOG section are the
operator steps. In short: `repo-harness update` once before the first seat
launch (three new `seats.routing` keys); replace `--spend-credits` with
`codex_credit_mode`; start the orchestrator and advisor seats again.

```bash
bun add -g repo-harness@0.32.0 --no-cache && repo-harness update --version 0.32.0
```

## Acceptance environment

The release PR records the prep head and `bun run check:release`. The upgrade
rehearsal lane of #2626 ran on the prep head `b2850fe46`: Probe run
[43390461859](https://github.com/aimpact-inc/repo-harness/actions/runs/43390461859)
(ubuntu-latest, `release-rehearsal`), success. It installed the parent
`repo-harness@0.31.0` from npm, ran the parent's `update --version 0.32.0`
against the local candidate registry, and ended with `[rehearsal] OK: 0.31.0
-> 0.32.0` and `archctx link: 0.13.0 -> 0.13.0`. No macos-latest run.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.32.0` | pending | pending | pending |
| 2 | `repo-harness@0.32.0` | pending | pending | pending |

Open owner items:

- npm publish of both packages (steps 2 and 3): pending.
- Tag `v0.32.0`: pending.
- GitHub Release `v0.32.0`: pending.
- Host update to 0.32.0 and `repo-harness update` on the owner machine:
  pending.

## Post-publish checks

- `bash scripts/release-owner-steps.sh check published 0.32.0` and `check
  tagged 0.32.0` read both packages from the registry, compare each tarball
  with its registry metadata and check `v0.32.0`. Result: pending.
- On the owner machine, run the upgrade command and record the installed
  version. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. After publication,
retain the published tag and use a new patch release for a correction. A host
return to 0.31.0 needs the hand removal of `codex_credit_mode`,
`codex_credit_floor` and `claude_hyper_at_or_above_remaining` from
`seats.routing` in `~/.repo-harness/config.json` first (CHANGELOG Rollback).
