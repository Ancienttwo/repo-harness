# repo-harness 0.24.2 publication record

## Scope and authority

- Base: `f7f502792cb97445c736e05de625d51bf6de57ff` (#964) on `origin/main`.
  Its parent is `90c9e7ec0e7f888aaf44acc68e9b6af117e70691` (#895). This is
  the final release base.
- Previous release: 0.24.1 on npm and in Git. Tag `v0.24.1`, annotated tag
  object `72805d5553d6d6f475ada875d5a01b81c1576bae`, target
  `c21aa3079495bdefb163e0ebaf9a79062abfe7da` (#885 squash).
- Merged range: `v0.24.1..f7f502792`. `git rev-list --count` is 46.
  Each of the 46 subjects ends with a PR number.
- The 46 PRs: #887, #889, #892, #893, #894, #896, #900, #927, #925, #928,
  #923, #926, #930, #929, #931, #932, #935, #936, #937, #941, #943, #946,
  #944, #940, #897, #899, #938, #933, #934, #939, #942, #949, #945, #952,
  #953, #954, #955, #951, #957, #950, #958, #959, #962, #963, #895 and #964.
- The npm package goes from 0.24.1 to 0.24.2. `package.json`,
  `assets/skill-version.json` (version and template version) and README show
  0.24.2. `bun.lock` records no root package version, so it does not change.
  The CLI reads its version from `package.json`; the hook bundle gets the
  same value at build time.
- `archctx` and `archctx-contracts` stay at exact 0.9.3 in `package.json` and
  `bun.lock`. #951 moved them from 0.9.1.
- Changelog rules for this release:
  - The release preparation commits have no PR number. The version bump, the
    changelog and this record have no changelog entry, as for 0.24.1.
  - The rolling PRs #887 and #895 are under "Documentation", as #886 is in
    the 0.24.1 section.
  - The release records #889, #954 and #958 are under "Documentation", as
    #828 is in the 0.24.0 section.
  - Breaking removals are under "Breaking", as in 0.23.1. User steps are
    under "Upgrade", as in 0.24.0.
  - #964 (anchor citations and dead archctx manifest keys) is under
    "Documentation".

### Owner decisions (2026-10-26)

Owner's words:

> 把余下PR都合了，issue清理完，发新版本

> 尽量干净重构

> I accept the observed major architecture change from #959. Run the
> projection writer with --accept-observed-major-change, then merge #895 when
> its checks pass.

Result:

- GO for the merge of the remaining PRs, the issue cleanup and a new
  release.
- The owner accepts the observed major architecture change from #959. The
  rolling writer published #895 with `--accept-observed-major-change`, and
  #895 merged after its checks passed.
- The 0.24.1 yellow flag acceptances do not carry over. The 0.24.2 readiness
  flags need the owner's decision. See "Readiness check".

### Hold dispositions

The 2026-10-25 HOLD draft named these holds. Each is resolved.

| Hold | Disposition |
| --- | --- |
| #903 review key and receipt identity | Closed as completed at 2026-10-26T06:45:24Z by #959, squash `b12e1631464e003eaa91ef1e2a718ad0ffc31e58`, merged 2026-10-26T06:44:27Z. #927 had merged the Stop recovery half. |
| #917 retired store readers | Closed as completed at 2026-10-26T06:45:28Z by #959, squash `b12e1631464e003eaa91ef1e2a718ad0ffc31e58`. #936 had removed the cutover marker and the lease liveness readers. |
| #895 rolling writer PR | The writer published with the accepted major change. `verify-pr`: generated-only, render-equivalent. Merged 2026-10-26T07:08:48Z, squash `90c9e7ec0e7f888aaf44acc68e9b6af117e70691`, parent `bbf18043e43ee9c2d073eb54ddb5e41f71e957ae` (#963), head `28ac5cb05fe68f3f295ccf247ba83bb26f1fdc8d`. |
| #898 CI repair, daily architecture freshness | Closed as completed at 2026-10-26T07:09:05Z, after the #895 merge. |
| 17 projection major actions (measured at #957 head `24633552040b45739e7dccec79017ac7ed1ed435`) | Resolved by the owner's acceptance of the observed major change and the #895 publication. |
| 10 anchor findings and partial practices coverage | #964, squash `f7f502792cb97445c736e05de625d51bf6de57ff`, fixed all 11 current anchor findings (anchors: 1,100 citations, 0 findings) and deleted the unread `content.practices` and `review.failOn` manifest keys (archctx `validate`: no warnings). The repo defines no practices, so practice evaluation stays advisory and debt coverage reports `practices:not-enabled`; see the readiness flags. |

## Upgrade steps for users

- From 0.23.1: do every 0.24.0 and 0.24.1 step first. See those sections of
  `docs/CHANGELOG.md` and `261023-repo-harness-0.24.1.md`.
- From 0.24.1:
  - Run `repo-harness update`. `repo-harness init` no longer installs the
    Herdr skill or writes the account architecture defaults. (#930)
  - When `update` reports "Daemon readiness pending; verified packages
    retained.", authorize the archctx `daemon upgrade`. (#951)
  - Record each acceptance again. A receipt from an older release has no
    stored copy. Product and waived-module dependencies on it report
    `authority_unavailable` until then. There is no migration. (#959)
  - Run `repo-harness external-source refresh` once. Until then the agent
    board slice is empty. (#959)
  - Change review and task callers to the approved admission inputs:
    `review round|status|close|cancel` drop `--contract`; `review admit
    --request` and `review revoke --request` are new; `fleet`,
    `publication readiness`, `state board`, `integration` and
    `external-source bind` change their inputs. The `repo-harness run`
    helpers `verification-plan` and `change-assessment` drop `--contract`
    and take `--repository-id`, `--issue-id`, `--campaign-id`,
    `--grant-sha256`, `--policy-sha256` and `--actor`. A Completed
    `archive-workflow` run now takes the same six flags. See "Breaking" in
    the changelog. (#959)
  - Check `information_lifecycle.retention.archive_days` in
    `.ai/harness/policy.json` before `repo-harness retention --apply`.
    Retention now deletes archived entries older than that value (default
    90). (#941)
  - Replace `repo-harness run run-bounded-verifier-command` with
    `repo-harness run verification-plan execute --repo . --repository-id
    <id> --issue-id <id> --campaign-id <id> --grant-sha256 <hash>
    --policy-sha256 <hash> --actor <id>`. (#933, #959)
  - Read the new workflow rules with
    `repo-harness docs show agentic-development-flow`. (#962)

## Hosted daily CI

PENDING. The orchestrator records the daily CI run on the release base.

## Acceptance environment

PENDING.

## Acceptance status

PENDING. The orchestrator records the subject commit and tree, the changelog
SHA-256, each gate command with its exit code and counts, the version and
changelog coverage check, and `git diff --check`.

## Release readiness items

- Consumer architecture smoke: `tests/hook-runtime.test.ts` test
  "a registry consumer without code facts or a projection manifest gets
  one architecture line (#850)". Result: PENDING.
- Skill eval evidence: PENDING.
  - `full_test_count`: PENDING
  - `dry_run_ratio`: PENDING
  - `grader_pass_rate`: PENDING
  - `effectiveness_authority`: PENDING
- Readiness yellow flags: PENDING. See "Readiness check".

## Readiness check

### Subject and commands

PENDING.

### Signals

PENDING.

### Yellow flags

PENDING. Each flag needs the owner's decision for 0.24.2.

## Publication checklist

- Merge the release PR only after green hosted CI on its head.
- Create tag `v0.24.2` on the release squash commit, then the GitHub
  Release.
- For 0.24.1, the owner ran `npm publish` with web authentication in the
  foreground. A background web-auth publish for 0.23.1 waited until the
  link expired, and npm failed with `E404`.
- After publication, run `npm view repo-harness dist-tags`. Expect
  `latest: '0.24.2'`. Before publication the registry shows
  `latest: '0.24.1'`.
- Then run `bun run check:release-published 0.24.2` with a temporary HOME.

## Rollback evidence

- Before publication, revert the release preparation commits.
- After the squash merge: `git revert <squash-commit>`.
- A Git revert does not undo an npm publication.

## Publication status

- Status on 2026-10-26: not published. No `v0.24.2` tag, no GitHub Release
  and no npm publication.
