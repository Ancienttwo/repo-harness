# repo-harness 0.30.0 publication record

## Scope and authority

- Base: `e8c717a26` on `main`. Previous release: `v0.29.2`. Range:
  `v0.29.2..e8c717a26` (39 first-parent commits). A PR merged after the base
  goes to the next release.
- Release date and record prefix: UTC 2026-11-10, from `date -u`.
- The core package, Operator web package, skill and template stamps, and README
  move to 0.30.0. The range adds no runtime dependency and no `hc` pin, so
  `bun.lock` stays as it is at the base.
- Joint decision on #2207 (orchestrator + advisor), plan revision 1.
- Publish status: not published. The life cycle stops at the merged release
  PR. `npm publish`, the tag and the GitHub Release stay with the owner and
  `.github/workflows/release.yml`.

## Cause of the release

Installed 0.29.2 reads only the newest 50 comments and the newest 50 sub-issues
of a batch parent, so a long parent reports `hold_unknown` and refuses every
merge (#2157, #2123). It resets a seat from a caller in another repository
(#2196), and a provider token can reach a local git child process (#2102,
#2131). It also has no release workflow: publication is a manual command list
(#2194).

| PR | Commit | Section in 0.30.0 | Change |
|---|---|---|---|
| #2116 | `1fde9c34a` | Fixed | Install verbs and excerpt assertion priority |
| #2118 | `b1cd5d399` | Changed | Low fix above 50 lines gives Medium |
| #2124 | `17d7fa4a8` | Fixed | `gh` status formats and capped watcher errors |
| #2126 | `cac66e9b3` | Fixed | Late scheduled CI run counts as delivered |
| #2125 | `6b8531345` | Fixed | Package manager mismatch codes |
| #2128 | `acd87998b` | Documentation | Model-free writer claim stays valid |
| #2129 | `eb41a1166` | Added | `seats prefix` sets `panePrefix` |
| #2130 | `edf140e8e` | Fixed | Every sub-issue page of the parent |
| #2119 | `20823d705` | Documentation | Architecture projection refresh |
| #2139 | `c9af3b06c` | Documentation | Pane prefix from `seats prefix` |
| #2089 | `252443a16` | Added | Merge queue and `merge_group` CI |
| #2142 | `4677042b3` | Tests | Late-child cancellation on Linux |
| #2147 | `21c4ca473` | Documentation | 0.29.2 publication record |
| #2136 | `a4b75c5c9` | Fixed | Unreadable reviewed head gives no sync proof |
| #2138 | `b85906125` | Added | `review publish --owner-record` |
| #2144 | `d4876a8b6` | Fixed | Shared platform lanes for consumer scripts |
| #2103 | `f39523789` | Fixed | Token-free git child environment |
| #2141 | `c88c69242` | Documentation | Architecture projection refresh |
| #2158 | `0b6dba25c` | Fixed | Every comment page of the parent |
| #2159 | `67fefda51` | Changed | Board summaries route reads one parent |
| #2171 | `bb9faa555` | Documentation | Architecture projection refresh |
| #2170 | `826d40ff8` | Fixed | `modelFamily` in its own module |
| #2167 | `60bbde1a1` | Changed | One first-viewport rule |
| #2174 | `054bb6405` | Changed | Office room shows the seats first |
| #2182 | `d6c195857` | Added | Three launch skills |
| #2168 | `8c2dd3e0c` | Added | Archimap geometry findings |
| #2184 | `dc8d0cf76` | Changed | One GitHub read per fact |
| #2186 | `b9dee51ee` | Fixed | Map collector publishes per child |
| #2189 | `7b1d5ab78` | Added | `line_through_box` by the 8 px rule |
| #2188 | `2455e352c` | Documentation | `Code Ownership` in the global rules |
| #2169 | `85a014796` | Fixed | Token values replaced in git output |
| #2191 | `be6f14e5a` | Added | TLA+ model of the boss command send |
| #2192 | `9775893ba` | Changed | Topology routes on the dagre route |
| #2197 | `fe52a5370` | Documentation | Owner decision for hook changes |
| #2199 | `2418cd6fc` | Fixed | Seat reset from the same repository peer only |
| #2200 | `6b7e7af67` | Added | Module map domain routes and relations |
| #2203 | `71344d92b` | Changed | Layers on the shared scene |
| #2198 | `34d105877` | Added | One release workflow run |
| #2206 | `e8c717a26` | Tests | One CHANGELOG extraction drift check |

The `[Unreleased]` section held no entry at the base. The `[0.29.2]` and older
sections stay byte-identical to the base.

## Publication steps

The owner starts one workflow run after this PR merges with green CI. The run
publishes both packages, tags the release commit and creates the GitHub
Release; no seat publishes, tags or releases.

1. Owner setup, once, before the first run. npm Trusted Publishing for
   `repo-harness-operator-web` and for `repo-harness`: repository
   `aimpact-inc/repo-harness`, workflow `release.yml`, environment `release`.
   The GitHub environment `release`: the owner as the required reviewer and a
   deployment branch policy of `main` only.
2. After the merge, run `gh workflow run release.yml -f sha=<merged release
   commit>`. The owner approves the run in the `release` environment. That
   approval is the authorization for this deployment.
3. Read back the version in each job. The run refuses a commit that is not the
   release commit and stops at the first failed step. Record the shasum,
   integrity and file count of each package from `check published`.
4. After the run, read `bash scripts/release-owner-steps.sh check tagged
   0.30.0` for the tag and the GitHub Release.

`bash scripts/release-owner-steps.sh plan 0.30.0` stays a read-only preflight
and prints the manual command list. Use that list only as the partial-publish
recovery path in `release-deploy.md`, when a run stops after a publish.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.30.0 --no-cache && repo-harness update --version 0.30.0
```

Restart the Operator server and reload the page.

## Acceptance environment

Pending: `bun run check:type`, `bun run check:reference-configs`, the affected
test files and `git diff --check` on the prep head are recorded in the prep PR.
`bun run check:release` is pending the owner publication steps and CI.

## Publication

Publish candidate merge SHA: pending.

| Order | Name | Shasum | Integrity | File count |
|---|---|---|---|---|
| 1 | `repo-harness-operator-web@0.30.0` | pending | pending | pending |
| 2 | `repo-harness@0.30.0` | pending | pending | pending |

Record the registry readback for each field before publication is complete.
Tag and GitHub Release: pending.

## Post-publish checks

- In a disposable HOME and BUN_INSTALL, install 0.30.0, start
  `repo-harness operator serve` and verify that `/healthz` reports 0.30.0 and
  protocol 3, and that `GET /` returns 200. Result: pending.
- Run `bash scripts/check-release-published.sh 0.30.0`. Result: pending.
- On the owner machine, run the upgrade command and record the installed
  version. Result: pending.

## Rollback

Before publication, close the prep PR or revert its merge. After publication,
retain the published tag and use a new patch release for a correction. A
0.29.2 CLI has no `release.yml` and no `seats prefix`, and its board refuses a
batch parent that holds more than 50 comments or more than 50 sub-issues.
