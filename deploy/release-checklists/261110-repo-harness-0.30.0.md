# repo-harness 0.30.0 publication record

## Scope and authority

- Cutoff: `c621d35ab` on `main`. Previous release: `v0.29.2`. Range:
  `v0.29.2..c621d35ab` (46 first-parent commits). A PR merged after the cutoff
  goes to the next release.
- Release date and record prefix: UTC 2026-11-10.
- The core package, Operator web package, skill and template stamps, and README
  move to 0.30.0. The range changes no package dependency, `hc` pin or
  `bun.lock`.
- Parent #2207, plan revision 8. Round-3 scope and cutoff decisions:
  [source rule](https://github.com/aimpact-inc/repo-harness/issues/2208#issuecomment-6769699557)
  and [cutoff](https://github.com/aimpact-inc/repo-harness/issues/2208#issuecomment-6769851448).
- Publish status: not published. The life cycle stops at the merged release
  PR. `npm publish`, the tag and the GitHub Release stay with the owner and
  `.github/workflows/release.yml`.

## Cause of the release

The release includes the board pagination fixes, managed Code Ownership rules,
release workflow and repository seats observer. Each row names one merged PR
in the cutoff range. The two launch skills and the handoff skill are in #2182.

| PR | Commit | Section in 0.30.0 | Merged PR title |
|---|---|---|---|
| [#2116](https://github.com/aimpact-inc/repo-harness/pull/2116) | `1fde9c34a` | Fixed | fix(evidence): recognize install verbs and prioritize excerpt assertions (#2114) |
| [#2118](https://github.com/aimpact-inc/repo-harness/pull/2118) | `b1cd5d399` | Changed | fix(board): Low labels give Medium to a fix above 50 changed lines or of unknown size (#2113) |
| [#2124](https://github.com/aimpact-inc/repo-harness/pull/2124) | `17d7fa4a8` | Fixed | fix(board): read gh status and cap watcher errors (#2120) |
| [#2126](https://github.com/aimpact-inc/repo-harness/pull/2126) | `cac66e9b3` | Fixed | fix(ci): count late scheduled runs as delivered (#2121) |
| [#2125](https://github.com/aimpact-inc/repo-harness/pull/2125) | `6b8531345` | Fixed | fix(evidence): classify package manager mismatch codes (#2122) |
| [#2128](https://github.com/aimpact-inc/repo-harness/pull/2128) | `acd87998b` | Documentation | docs(issue-flow): clarify model-free writer claims (#2127) |
| [#2129](https://github.com/aimpact-inc/repo-harness/pull/2129) | `eb41a1166` | Added | feat(seats): seats prefix sets panePrefix in the registry (#2058) |
| [#2130](https://github.com/aimpact-inc/repo-harness/pull/2130) | `edf140e8e` | Fixed | fix(board): read every sub-issue page of the batch parent (#2123) |
| [#2119](https://github.com/aimpact-inc/repo-harness/pull/2119) | `20823d705` | Documentation | chore(projection): refresh generated architecture outputs for main@edf140e8e63f |
| [#2139](https://github.com/aimpact-inc/repo-harness/pull/2139) | `c9af3b06c` | Documentation | docs(herdr-notify): set pane prefix with seats command (#2137) |
| [#2089](https://github.com/aimpact-inc/repo-harness/pull/2089) | `252443a16` | Added | feat(publication): enqueue through a required merge queue; CI runs on merge_group (#2076) |
| [#2142](https://github.com/aimpact-inc/repo-harness/pull/2142) | `4677042b3` | Tests | test(herdr-task): synchronize late child before leader exit (#2140) |
| [#2147](https://github.com/aimpact-inc/repo-harness/pull/2147) | `21c4ca473` | Documentation | docs(release): record 0.29.2 publication (#2143) |
| [#2136](https://github.com/aimpact-inc/repo-harness/pull/2136) | `a4b75c5c9` | Fixed | fix(board): an unreadable reviewed head gives no merge-only sync proof (#2091) |
| [#2138](https://github.com/aimpact-inc/repo-harness/pull/2138) | `b85906125` | Added | feat(review): publish a round above 5 only with an owner-record URL |
| [#2144](https://github.com/aimpact-inc/repo-harness/pull/2144) | `d4876a8b6` | Fixed | fix(ci): select shared platform lanes for consumer scripts (#2132) |
| [#2103](https://github.com/aimpact-inc/repo-harness/pull/2103) | `f39523789` | Fixed | fix(git): keep provider tokens away from local git child processes (#2102) |
| [#2141](https://github.com/aimpact-inc/repo-harness/pull/2141) | `c88c69242` | Documentation | chore(projection): refresh generated architecture outputs for main@f39523789188 |
| [#2158](https://github.com/aimpact-inc/repo-harness/pull/2158) | `0b6dba25c` | Fixed | fix(board): read every comment page of the batch parent (#2157) |
| [#2159](https://github.com/aimpact-inc/repo-harness/pull/2159) | `67fefda51` | Changed | feat(operator): the board summaries route reads one parent and starts no board CLI run |
| [#2171](https://github.com/aimpact-inc/repo-harness/pull/2171) | `bb9faa555` | Documentation | chore(projection): refresh generated architecture outputs for main@67fefda5110f |
| [#2170](https://github.com/aimpact-inc/repo-harness/pull/2170) | `826d40ff8` | Fixed | fix(review): move modelFamily to its own module so the browser graph imports no Node built-in (#2146) |
| [#2167](https://github.com/aimpact-inc/repo-harness/pull/2167) | `60bbde1a1` | Changed | feat(operator-web): one first-viewport rule for the architecture maps (#2151) |
| [#2174](https://github.com/aimpact-inc/repo-harness/pull/2174) | `054bb6405` | Changed | feat(operator-web): the Office room shows the seats before the board read ends (#2149) |
| [#2182](https://github.com/aimpact-inc/repo-harness/pull/2182) | `d6c195857` | Added | feat(seats): explicit orchestrator, advisor and seat-handoff skills (#2175) |
| [#2168](https://github.com/aimpact-inc/repo-harness/pull/2168) | `8c2dd3e0c` | Added | feat(archimap): measure.ts reports geometry findings of the boards that hold nodes |
| [#2184](https://github.com/aimpact-inc/repo-harness/pull/2184) | `dc8d0cf76` | Changed | perf(board): one board read asks GitHub once for the repository identity and each base-commit fact (#2150) |
| [#2186](https://github.com/aimpact-inc/repo-harness/pull/2186) | `b9dee51ee` | Fixed | fix(operator): the architecture map collector publishes a repository when its child returns |
| [#2189](https://github.com/aimpact-inc/repo-harness/pull/2189) | `7b1d5ab78` | Added | feat(archimap): measure.ts reports line_through_box by the 8 px inset rule (#2185) |
| [#2188](https://github.com/aimpact-inc/repo-harness/pull/2188) | `2455e352c` | Documentation | docs(rules): code ownership default in the global working rules (#2187) |
| [#2169](https://github.com/aimpact-inc/repo-harness/pull/2169) | `85a014796` | Fixed | fix(git): replace provider-token values in git output and errors (#2131) |
| [#2191](https://github.com/aimpact-inc/repo-harness/pull/2191) | `be6f14e5a` | Added | feat(specs): check the boss command send with TLC (#2180) |
| [#2192](https://github.com/aimpact-inc/repo-harness/pull/2192) | `9775893ba` | Changed | feat(operator-web): topology routes follow the dagre route on screen and in the SVG file (#2152) |
| [#2197](https://github.com/aimpact-inc/repo-harness/pull/2197) | `fe52a5370` | Documentation | docs(rules): clarify owner decisions for hooks (#2195) |
| [#2199](https://github.com/aimpact-inc/repo-harness/pull/2199) | `2418cd6fc` | Fixed | fix(seats): restrict resets to the same repository peer (#2196) |
| [#2200](https://github.com/aimpact-inc/repo-harness/pull/2200) | `6b7e7af67` | Added | feat(operator-web): the module map draws directed domain routes and lists a selected card's relations (#2153) |
| [#2203](https://github.com/aimpact-inc/repo-harness/pull/2203) | `71344d92b` | Changed | feat(operator-web): Layers draws its lanes on the placed scene and the shared shell (#2160) |
| [#2198](https://github.com/aimpact-inc/repo-harness/pull/2198) | `34d105877` | Added | feat(release): one workflow run publishes, tags and releases a merged release commit (#2194) |
| [#2206](https://github.com/aimpact-inc/repo-harness/pull/2206) | `e8c717a26` | Tests | test(release): one drift check binds the two CHANGELOG section extractions (#2204) |
| [#2183](https://github.com/aimpact-inc/repo-harness/pull/2183) | `c2bfe28bf` | Documentation | chore(projection): refresh generated architecture outputs for main@e8c717a26ae6 |
| [#2210](https://github.com/aimpact-inc/repo-harness/pull/2210) | `b4046b31d` | Documentation | skills: verify-boss-command names src/effects/operator/server.ts in its change list (#2209) |
| [#2205](https://github.com/aimpact-inc/repo-harness/pull/2205) | `765b45827` | Changed | feat(operator-web): Sequence returns a placed scene, and message labels fit their columns (#2161) |
| [#2201](https://github.com/aimpact-inc/repo-harness/pull/2201) | `176afd079` | Added | feat(operator): observe repository seats from hc events (#2163) |
| [#2217](https://github.com/aimpact-inc/repo-harness/pull/2217) | `e02018d5a` | Documentation | chore(projection): refresh generated architecture outputs for main@176afd079d9a |
| [#2224](https://github.com/aimpact-inc/repo-harness/pull/2224) | `ee5aa36ba` | Documentation | docs(rules): the publish gate is the owner's release environment approval |
| [#2226](https://github.com/aimpact-inc/repo-harness/pull/2226) | `c621d35ab` | Changed | refactor(review): remove the unused v1 diff fingerprint (#2211) |

The `[Unreleased]` section held no entry at the base. The `[0.29.2]` and older
sections are byte-identical to the base.

## Publication steps

The owner starts one workflow run after this PR merges with green CI. The run
publishes both packages, tags the release commit and creates the GitHub
Release; no seat publishes, tags or releases.

1. Before dispatch, the owner creates and verifies npm Trusted Publishing for
   `repo-harness-operator-web` and `repo-harness`: repository
   `aimpact-inc/repo-harness`, workflow `release.yml`, environment `release`.
   The GitHub `release` environment must require the owner as reviewer, allow
   deployments from `main` only and disable admin bypass.
2. Before the owner's run, read the environment without changing it:

   ```bash
   gh api repos/aimpact-inc/repo-harness/environments/release -q '{can_admins_bypass, rules: [.protection_rules[].type]}'
   ```

   Expected: `can_admins_bypass: false`, with rules `required_reviewers` and
   `branch_policy`. Check that the reviewer is the owner and the branch policy
   allows only `main`. Stop if the setup differs. This read does not verify
   the npm Trusted Publishing settings; the owner verifies those in npm.
3. After the merge, the owner runs
   `gh workflow run release.yml -f sha=<merged release commit>` and approves
   that run in the `release` environment. The approval authorizes that deployment.
4. Read each job of the run. `validate` checks the release commit and versions.
   `lane` runs `bun run check:release` and `workflow-guard`, then packs both
   tarballs. `publish` publishes the console tarball, waits until npm shows it,
   then publishes the core tarball. `published` runs `check published 0.30.0`.
   `tag` creates the annotated tag and the GitHub Release. `tagged` runs
   `check tagged 0.30.0`. A failed job blocks its dependent jobs.
5. Record the results in the Publication table below. `check published` reads
   each package with `npm view` and `npm pack` and compares shasum and integrity.
   Read the registry fields with `npm view repo-harness@0.30.0 dist --json` and
   `npm view repo-harness-operator-web@0.30.0 dist --json`.

`bash scripts/release-owner-steps.sh plan 0.30.0` is a pre-publication preflight.
It requires both versions to be unpublished and `v0.30.0` to be absent. It fails
after the first publish and cannot provide a partial-publish recovery plan.

### Recovery after a partial publish

Recovery is an owner step. Read the completed package, tag and GitHub Release
state first. Follow the "Partial publish recovery" section of
`docs/reference-configs/release-deploy.md` from the exact release commit and
complete only the missing steps. Stop at the first failure.

The shipped `scripts/release-owner-steps.sh` supports `guard <version> <sha>`
before a remaining manual publish from `/tmp/repo-harness-wt-release-<version>`.
It checks the worktree path, clean checkout, HEAD and both package versions;
it does not require the versions to be unpublished. `check published <version>`
reads both packages back. `notes <version>` extracts the CHANGELOG section.
`check tagged <version>` verifies the remote tag and GitHub Release. The script
has no command that resumes a partial publish. A rerun of `release.yml` stops
at the unpublished-version checks in `lane` after either package is published.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.30.0 --no-cache && repo-harness update --version 0.30.0
```

Restart the Operator server and reload the page.

## Acceptance environment

PR #2215 records the prep head, environment, commands and results for
`bun run check:type`, `bun run check:helpers`, `bun run check:reference-configs`,
the affected test files and `git diff --check`. `bun run check:release` is not
run here: it needs the registry and npm and remains with CI and the owner
publication steps.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.30.0` | pending | pending | pending |
| 2 | `repo-harness@0.30.0` | pending | pending | pending |

Read each field from the registry readback in step 5 before publication is
complete. Tag and GitHub Release: pending.

## Post-publish checks

- In a disposable HOME and BUN_INSTALL, install 0.30.0, start
  `repo-harness operator serve` and verify that `/healthz` reports 0.30.0 and
  protocol 3, and that `GET /` returns 200. Result: pending.
- `bash scripts/check-release-published.sh 0.30.0` reads both packages from the
  registry, compares each tarball with its registry metadata, runs the runtime
  receipt and checks `v0.30.0`. Result: pending.
- On the owner machine, run the upgrade command and record the installed
  version. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. After publication,
retain the published tag and use a new patch release for a correction. A
0.29.2 CLI has no `release.yml`, no `seats prefix` and no `review publish
--owner-record`, and its board reads 50 comments and 50 sub-issues of a batch
parent.
