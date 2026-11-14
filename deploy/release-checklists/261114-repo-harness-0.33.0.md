# repo-harness 0.33.0 publication record

## Scope and authority

- Base: `c6939b613` on `main`. Previous release: `v0.32.0`. Range: `v0.32.0..c6939b613` (40 first-parent commits). A later PR goes to the next release unless a joint decision adds it.
- Release date: UTC 2026-11-14. Parent #2742; release issue #2771. The owner authorized 0.33.0 with archctx 0.15.0 (word “放”, 2026-11-14, https://github.com/aimpact-inc/repo-harness/issues/2771#issuecomment-6881307091).
- The core package, Operator web package, skill and template stamps, and README move to 0.33.0 in PR 2. PR 1 prepares these release notes.
- Publish status: pending. npm publication, the tag and the GitHub Release need the owner's word for this release.

## Cause of the release

The release changes the command to `rh`, raises the Pi floor to 1.5.2, and updates the protected-name gate, review collection and merge readiness. The CHANGELOG records the user-facing changes. Each row names one first-parent commit, oldest first.

| PR | Commit | Merged PR title |
|---|---|---|
| [#2699](https://github.com/aimpact-inc/repo-harness/pull/2699) | `53d911777` | chore(projection): refresh generated architecture outputs for main@9b63d4383231 |
| [#2705](https://github.com/aimpact-inc/repo-harness/pull/2705) | `4c6cd8d34` | fix(state-boundaries): name bun install when node_modules is missing |
| [#2706](https://github.com/aimpact-inc/repo-harness/pull/2706) | `48ed1c1b1` | chore(projection): refresh generated architecture outputs for main@4c6cd8d34195 |
| [#2704](https://github.com/aimpact-inc/repo-harness/pull/2704) | `4c734ad88` | refactor(operator): one GitHub owner/name grammar (#2702) |
| [#2709](https://github.com/aimpact-inc/repo-harness/pull/2709) | `d9f518cb5` | chore(deps): archctx and archctx-contracts 0.14.1 with the manifest v4 re-baseline (#2686) |
| [#2712](https://github.com/aimpact-inc/repo-harness/pull/2712) | `12e3a6431` | ci: run the projection provider test on windows-latest (#2711) |
| [#2713](https://github.com/aimpact-inc/repo-harness/pull/2713) | `57968f6fb` | ci: pin Bun 1.4.4 in all workflows (#2134) |
| [#2714](https://github.com/aimpact-inc/repo-harness/pull/2714) | `eb4aca1ac` | fix(ci): start the daily architecture lag clock at the render change (#2375) |
| [#2718](https://github.com/aimpact-inc/repo-harness/pull/2718) | `de8e457a9` | ci: attribute a surviving worktree after the pool ends (#2717) |
| [#2720](https://github.com/aimpact-inc/repo-harness/pull/2720) | `4952016e0` | ci: fire the surviving-worktree guard on win32 (#2719) |
| [#2722](https://github.com/aimpact-inc/repo-harness/pull/2722) | `a1e43189b` | fix(ci): replace ':' in the JUnit report name (#2721) |
| [#2710](https://github.com/aimpact-inc/repo-harness/pull/2710) | `e7e6c68df` | chore(projection): refresh generated architecture outputs for main@4952016e02e3 |
| [#2701](https://github.com/aimpact-inc/repo-harness/pull/2701) | `65ae37da7` | feat(cli)!: the command is rh (#2700) |
| [#2715](https://github.com/aimpact-inc/repo-harness/pull/2715) | `631f5b601` | fix(capabilities): the projection manifest owns module page paths under the registry (#2707) |
| [#2727](https://github.com/aimpact-inc/repo-harness/pull/2727) | `fcbf2d612` | docs(architecture): overview names the rh command |
| [#2730](https://github.com/aimpact-inc/repo-harness/pull/2730) | `03e7278e1` | fix(board): a parent with two children or fewer and no plan merges in blocked-by order (#2725) |
| [#2729](https://github.com/aimpact-inc/repo-harness/pull/2729) | `dfdbae093` | deps(herdr-core): pin 0.1.21 (#2724) |
| [#2733](https://github.com/aimpact-inc/repo-harness/pull/2733) | `a2cb251bf` | deps: move oar, kumo, plugin-react and vite to their latest versions |
| [#2736](https://github.com/aimpact-inc/repo-harness/pull/2736) | `4eb562ebe` | refactor(board): one helper for the plan skip reason (#2735) |
| [#2716](https://github.com/aimpact-inc/repo-harness/pull/2716) | `51d0628aa` | feat(upgrade): record the released managed values from the release tags (#2708) |
| [#2738](https://github.com/aimpact-inc/repo-harness/pull/2738) | `1cfc048a6` | feat(review): rh review collect publishes a Pi seat receipt from its session record (#2737) |
| [#2743](https://github.com/aimpact-inc/repo-harness/pull/2743) | `617d56318` | fix(scripts): no early-exit reader under pipefail in ship-worktrees (#2740) |
| [#2745](https://github.com/aimpact-inc/repo-harness/pull/2745) | `f8167dde1` | test(ci): attribute worktree paths in nested gate runs (#2741) |
| [#2747](https://github.com/aimpact-inc/repo-harness/pull/2747) | `335a1fca8` | fix(scripts): contract-worktree start bases on the fetched origin base (#2746) |
| [#2752](https://github.com/aimpact-inc/repo-harness/pull/2752) | `a0b7d6430` | fix(scripts): drain early-exit first-match readers, share the ship journal first-conflict read (#2744) |
| [#2751](https://github.com/aimpact-inc/repo-harness/pull/2751) | `ace28bcd9` | refactor(scaffold): rh init is the only writer of the managed parts; delete the bash copy (#2734) |
| [#2754](https://github.com/aimpact-inc/repo-harness/pull/2754) | `021fd4046` | refactor(scaffold): rh init is the only writer of the seed files; delete the bash context-block discovery (#2753) |
| [#2731](https://github.com/aimpact-inc/repo-harness/pull/2731) | `476f379b0` | fix(hook): the Bash guard decides protected-directory writes by one protected-name gate (#2369) |
| [#2750](https://github.com/aimpact-inc/repo-harness/pull/2750) | `4e9f971fa` | fix(publication): failed job outside a passing check's needs is not failure evidence (#2749) |
| [#2755](https://github.com/aimpact-inc/repo-harness/pull/2755) | `22627909b` | fix(hook): git read subcommands take only listed options under the protected-name trigger (#2748) |
| [#2758](https://github.com/aimpact-inc/repo-harness/pull/2758) | `c9dd4b948` | docs(rules): rule 1 sends a new security P1 to the owner as a notice (#2756) |
| [#2761](https://github.com/aimpact-inc/repo-harness/pull/2761) | `b75324d6c` | fix(hook): an expanded git -C directory is denied under the protected-name trigger (#2757) |
| [#2763](https://github.com/aimpact-inc/repo-harness/pull/2763) | `739fdc444` | test(operator-web): unmount the first root before a second mount (#2762) |
| [#2760](https://github.com/aimpact-inc/repo-harness/pull/2760) | `7cf008b04` | fix(publication): a required check that did not succeed in every attempt never reads ready with no evidence (#2759) |
| [#2766](https://github.com/aimpact-inc/repo-harness/pull/2766) | `182d58d8b` | docs(rules): clarify fail-closed finding count rule (#2765) |
| [#2739](https://github.com/aimpact-inc/repo-harness/pull/2739) | `71c28c440` | fix(review): pi 1.5.2 reviews record the actual model; the sandbox opens only pi's auth.json lock directory (#2732) |
| [#2779](https://github.com/aimpact-inc/repo-harness/pull/2779) | `0f2a62745` | fix(scripts): the harness benchmark links the rh launcher (#2777) |
| [#2775](https://github.com/aimpact-inc/repo-harness/pull/2775) | `819834dd0` | docs(release): prepare 0.33.0 changelog and publication record (#2771) |
| [#2780](https://github.com/aimpact-inc/repo-harness/pull/2780) | `1e53b3853` | test(review): the deadline fixtures wait for real signals, not wall-clock margins (#2773) |
| [#2772](https://github.com/aimpact-inc/repo-harness/pull/2772) | `c6939b613` | chore(deps): archctx and archctx-contracts 0.15.0 (#2770) |

## Order of the owner steps

The plan command was run before the version commit. It failed because no first-parent commit on origin/main sets package.json to 0.33.0. The steps below follow the 0.32.0 record with the new version. Generate the authoritative list after PR 2 merges.

1. Merge PR 1 and PR 2 by the applicable rule, with green `Required / CI` and the recorded verification.
2. On main, run `git fetch origin && bash scripts/release-owner-steps.sh plan 0.33.0`. The plan binds the list to the commit that sets the version.
3. On the owner's word for this release, run steps 1 to 7 of the plan in order: release checks, publish `repo-harness-operator-web` and then `repo-harness`, wait for and check both packages, create the tag, create the GitHub Release from the release notes, and check the tag. The owner confirms the npm login.
4. After step 7, the host update and seat restarts are a joint decision. Follow the plan and the Upgrade section of the CHANGELOG. Resume a partial run by the rules printed by the plan; settle npm before a repeat publish.

## Upgrade steps for users

From 0.32.0, run `bun add -g repo-harness@0.33.0 --no-cache`. Immediately after the install, run `npm i -g @earendil-works/pi-coding-agent@1.5.2`, then run `repo-harness update --version 0.33.0`. In `~/.claude/settings.json`, change `Bash(repo-harness run *)` to `Bash(rh run *)`. Follow the remaining Upgrade and Rollback entries in the CHANGELOG.

## Acceptance environment

PR 1 verification and PR 2 release checks: pending. Release upgrade rehearsal: not recorded.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.33.0` | pending | pending | pending |
| 2 | `repo-harness@0.33.0` | pending | pending | pending |

Open owner items:

- Publish both packages, create tag `v0.33.0` and create the GitHub Release: pending.
- Update the host to 0.33.0 and install global Pi 1.5.2 immediately after the install: pending.
- Change the settings permission to `Bash(rh run *)`: pending.

## Post-publish checks

- Run `bash scripts/release-owner-steps.sh check published 0.33.0` and `bash scripts/release-owner-steps.sh check tagged 0.33.0`: pending.
- Record the host version after the upgrade: pending.

## Rollback

Before publication, close the prep PRs or revert their squash commits. After publication, retain the tag and use a patch release for a correction. For a host return to 0.32.0, follow the CHANGELOG Rollback section.
