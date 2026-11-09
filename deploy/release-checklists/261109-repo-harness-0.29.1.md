# repo-harness 0.29.1 publication record

## Scope and authority

- Base: `1304e7a54` on `main`. Previous release: `v0.29.0`. Range:
  `v0.29.0..1304e7a54` (13 first-parent commits). A PR merged after the base
  goes to the next release.
- Release date and record prefix: UTC 2026-11-09, from `date -u`.
- The core package, console package, skill and template stamps, README and
  Operator fixture move to 0.29.1. The range adds one runtime dependency,
  `mdast-util-from-markdown@2.1.0` (#2085), already in `bun.lock`. No other
  dependency or hc pin changes.
- Owner decision "合了再发" (#2000): the release PR starts after #2072,
  #2081, #2080, #2083 and #2053 merged. Joint decision J59.
- Publish status: not published. The life cycle stops at the merged release
  PR. `npm publish`, the tag and the GitHub Release need explicit owner
  authorization (#2008).

## Cause of the release

Installed 0.29.0 lacks the two-row High acceptance check, the Medium/High
lists of #2083 and the merge-only sync carry of #2081. `repo-harness update`
installs the Bash tripwire hook from #2069.

| PR | Commit | Section in 0.29.1 | Change | Original CHANGELOG reference |
|---|---|---|---|---|
| #2064 | `bde9afd63` | Changed | High acceptance needs two PASS rows | #2061 (Unreleased) |
| #2070 | `e6178a086` | Documentation | Architecture projection refresh | None |
| #2073 | `8826cfa1c` | Documentation | 0.29.0 publication record | #2065 (Unreleased) |
| #2049 | `5b9b1f225` | Added | `release-owner-steps.sh` | #2006 (Unreleased) |
| #2080 | `39010d7c9` | Added | `attention --watch --review` | #2078 (Unreleased) |
| #2072 | `7839f040d` | Fixed | Closeout finds Refs-only PR seats | #2071 (Unreleased) |
| #2069 | `4acd9d5d2` | Fixed | Bash tripwire forms | #2060 (Unreleased) |
| #2083 | `bcf86a02f` | Changed | Review tier follows the High list | #2079 (Unreleased) |
| #2088 | `c6f3ab4b7` | Documentation | J50 sizing and J51 review rules | None |
| #2081 | `c55a98ade` | Changed | Merge-only sync carries acceptance | #2074 (Unreleased) |
| #2075 | `36721ae85` | Documentation | Architecture projection refresh | None |
| #2053 | `cb7beb269` | Added | `board merge` | #2003 (Unreleased) |
| #2087 | `1304e7a54` | Fixed | Markdown-aware reference parser | None |

The `[Unreleased]` entries move into `[0.29.1]` and are sorted into Added,
Changed, Fixed and Documentation. New entries cover #2085 and #2086. The
projection refreshes add no entry. The `[0.29.0]` and older sections stay
byte-identical to the base.

## Publication steps

The owner runs these steps, or authorizes a seat to run them, after this PR
merges with green CI.

1. Run `bun run check:release` on the host after clearing
   `packages/operator-web/dist` and `node_modules/repo-harness-operator-web`.
2. Check out the merge SHA. Pack both packages and record their local values.
3. Publish `repo-harness-operator-web` first, then `repo-harness`, with
   `npm publish --auth-type=web` (owner 2FA).
4. Compare npm shasum, integrity and file counts with the local tarballs.
5. Tag `v0.29.1` on the merge SHA and create the GitHub Release from
   CHANGELOG `[0.29.1]`. Run `bash scripts/release-owner-steps.sh plan 0.29.1`
   for the command list and `bash scripts/check-release-published.sh 0.29.1`.

## Upgrade steps for users

```bash
bun add -g repo-harness@0.29.1 --no-cache && repo-harness update --version 0.29.1
```

Restart the Operator server and reload the page.

## Acceptance environment

Filled in by the prep PR verification and the publication record.

## Rollback

Before publication, close the prep PR or revert its merge. After
publication, retain the published tag and use a new patch release for a
correction. A 0.29.0 CLI has no `board merge`.
