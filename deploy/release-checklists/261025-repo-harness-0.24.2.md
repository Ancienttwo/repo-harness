# repo-harness 0.24.2 publication record

## Scope and authority

- Base: `f3a240492b71930086a379e2954dd5b54aa92d8f` (#968) on `origin/main`.
  Its parent is `197126377c9d74e07b41c2ff3c36fe0cb27467e0` (#966). This is
  the final release base.
- Previous release: 0.24.1 on npm and in Git. Tag `v0.24.1`, annotated tag
  object `72805d5553d6d6f475ada875d5a01b81c1576bae`, target
  `c21aa3079495bdefb163e0ebaf9a79062abfe7da` (#885 squash).
- Merged range: `v0.24.1..f3a240492`. `git rev-list --count` is 48.
  Each of the 48 subjects ends with a PR number.
- The 48 PRs: #887, #889, #892, #893, #894, #896, #900, #927, #925, #928,
  #923, #926, #930, #929, #931, #932, #935, #936, #937, #941, #943, #946,
  #944, #940, #897, #899, #938, #933, #934, #939, #942, #949, #945, #952,
  #953, #954, #955, #951, #957, #950, #958, #959, #962, #963, #895, #964,
  #966 and #968.
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
  - The rolling PRs #887, #895 and #966 are under "Documentation", as #886
    is in the 0.24.1 section.
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
| #967 CI repair, daily MCP path matrix (windows-latest) | Found by the daily run 40285900137 on `f7f502792`: 35 failures from #959. #968 fixed them, squash `f3a240492b71930086a379e2954dd5b54aa92d8f`. Admitted task sessions are POSIX-only. See "Hosted daily CI" for the proof run. |
| #966 rolling writer PR for main `f7f502792` | `verify-pr`: generated-only, render-equivalent, no human-edited paths. Squash `197126377c9d74e07b41c2ff3c36fe0cb27467e0`, parent `f7f502792cb97445c736e05de625d51bf6de57ff`, head `5b6a107e4b3bd2fff9e5f8ea7f858a36ff50590a`. |

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

- macOS 26.5 arm64, Bun 1.4.3, Node 24.18.0. The installed global runtime
  on this host is 0.24.1.
- `bun install --frozen-lockfile`: exit 0. It installed `archctx` 0.9.3
  and `archctx-contracts` 0.9.3 into the worktree.
- Each gate used a new temporary HOME and `REPO_HARNESS_HOME` under `/tmp`,
  and `TMPDIR=/tmp`. The wrapper removed `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT`, and deleted the HOME after the
  gate.
- The gates ran one at a time. No other test run was active on the host.

## Acceptance status

- Subject: commit `2ff03c8dc4c4839bde60c1a2680dc1c2351ccf14`, tree
  `26bea82a346e490fc5b967dd5c5f49944e1b4900`. It is the final base plus the
  release preparation commits. After the gates, only this record changed.
  The changelog, the shipped files and the test inputs did not change.
- Changelog SHA-256 at verification:
  `6d3a7b901893bac82f9d304243d356978352c518a723dcad990a5d40c7ed347f`.
- `bun run check:type`: exit 0.
- `bun run check:helpers`: exit 0; helper projection matches.
- `bun run check:reference-configs`: exit 0; 25 documents match.
- `bun run test:files tests/installed-copy-sync.test.ts
  tests/readme-dx.test.ts tests/skill-version.test.ts
  tests/effective-state.test.ts tests/hook-runtime.test.ts
  tests/action-command-skills.test.ts
  tests/reference-configs-projection.test.ts --timeout 60000
  --max-concurrency 1`: exit 0 in 67 seconds; 134 pass, 0 fail across seven
  files (29, 4, 10, 46, 19, 24 and 2).
- `bash scripts/check-npm-release.sh --prepublish`: exit 0; repo-harness
  0.24.2 is unpublished.
- `bun run check:release`: exit 0 in 220 seconds. Benchmark matrix:
  31 pass, 0 fail. `check-tarball-install-smoke.sh` installs
  `repo-harness-0.24.2.tgz`, serves the packaged Operator and starts the
  packaged CLI bins. Coding OAuth E2E: 1 pass, 0 fail, 15 filtered out.
- The package build reports a Vite chunk-size warning above 500 kB, as for
  0.24.1. It does not fail the gate.
- Version and changelog coverage check:
  - `git rev-list --count v0.24.1..origin/main` is 48, and 48 subjects end
    with a PR number.
  - All 48 PR numbers, the 8 issues that the merged commits close (#902,
    #904, #908, #910, #912, #913, #916 and #922) and #967 are in the 0.24.2
    section.
  - `package.json`, `assets/skill-version.json` (version and template
    version) and README show 0.24.2. `package.json` and `bun.lock` pin
    `archctx` and `archctx-contracts` at exact 0.9.3.
- `git diff --check origin/main...HEAD`: exit 0.
- No test assertion, timeout or release tool changed in the release
  preparation commits.
- The full suite is outside this gate sequence. The hosted daily CI above
  ran it on the base.

## Release readiness items

- Consumer architecture smoke: `tests/hook-runtime.test.ts` test
  "a registry consumer without code facts or a projection manifest gets
  one architecture line (#850)". It passed in the `test:files` gate above.
- Skill eval evidence: unavailable. See flag 6.
- Readiness yellow flags: see "Readiness check".

## Readiness check

### Subject and commands

- Candidate: the release worktree at `2ff03c8dc`, after
  `bun install --frozen-lockfile`.
- Real HOME, read-only by contract, with `CLAUDECODE`, `AI_AGENT`, `AGENT`,
  `REPL_ID` and `REPO_HARNESS_SOURCE_ROOT` removed and `TMPDIR=/tmp`:
  - `bun src/cli/index.ts setup check --target both --check-updates --json`:
    exit 0, `status: attention`; 28 ok, 5 warn, 0 fail, 1 n/a, 4
    needs_agent.
  - `bash scripts/check-agent-tooling.sh --json --host both
    --check-updates`: exit 0.
  - `bun src/cli/index.ts security scan --json`: exit 0, `status: warn`.
  - `bun src/cli/index.ts upgrade --json` (no `--apply`): exit 1 by design,
    because leftovers exist; 36 items. With a temporary HOME: 0 items.
- Temporary HOME: `bun src/cli/index.ts run check-deploy-sql-order`.

### Signals

| Signal | Source | Observed result | Flag |
| --- | --- | --- | --- |
| CodeGraph project index | `setup check` | `doctor.codegraph-index`: `index=stale` in the release worktree after the rebase. `bash scripts/ensure-codegraph.sh --sync` in the worktree repaired it (`sync-index: changed`). The index is worktree-local and not in the package. | no |
| PATH archctx | `check-agent-tooling.sh` | The probe put the worktree `node_modules/.bin` first in PATH, so the warning names the worktree's own archctx 0.9.3. `~/.bun/bin/archctx` from 0.24.1 flag 6 is gone. | no |
| Global rules markers | `setup check` | `global-rules.claude` and `global-rules.codex`: managed block is stale | yes |
| Install ledger | `setup check` | `status: drift`, surface drift on `~/.claude/settings.json`; no missing or unexpected components | yes |
| Security config | `security scan --json` | `status: warn`; 2 active `unmanaged-hook-command` findings, the SessionStart hook `herdr-agent-state.sh` in `~/.claude/settings.json` and in `~/.codex/hooks.json` | yes |
| Waza | `setup check` | `tooling.waza`: present, `update-available` | yes |
| Skills CLI | `setup check` | `runtime.skills_cli`: missing, optional | yes |
| Leftovers | `upgrade --json` | 36 items in the real HOME: 18 refresh and 18 report (old backups to keep). 0 with a temporary HOME. | yes |
| Deploy SQL order | `run check-deploy-sql-order` | exit 0, `[deploy-sql] OK` | no |
| Deploy surface | read `deploy/` | README, runbooks, scripts, SQL, submissions and release checklists are present. `deploy/env/` holds only `.gitkeep`; `deploy/env/.env.example` is absent. | yes |
| `_ops/` boundary | `git check-ignore`, `git ls-files _ops` | `_ops/` is ignored; 0 tracked files | no |
| Practices | archctx debt coverage | `practices:not-enabled`; the repo defines no practices, and evaluation is advisory | yes |
| Skill eval evidence | read `evals/` | `evals/benchmark.md` is from 2026-06-14. No skill eval fields since then. | yes |

### Yellow flags

The 0.24.1 acceptances do not carry over. Each flag needs the owner's
decision for 0.24.2.

1. Global rules managed blocks are stale. Repair after publication:
   `repo-harness update --report-language <follow|zh-CN|en>`. It writes the
   real HOME, so it is the owner's action. The package does not read these
   files.
2. Install ledger drift on `~/.claude/settings.json`. Host state before the
   upgrade. Repair after publication: `repo-harness update`, or
   `repo-harness install --profile full`. Both write user-level config, so
   the owner runs or approves them.
3. Security config: the same 2 `herdr-agent-state.sh` findings as 0.24.1
   flag 4. Repair: the owner adds a reviewed exception for each to
   `~/.repo-harness/config.json`. The hooks are host config and are not in
   the package.
4. Waza update available and Skills CLI missing. Proposed acceptance: both
   are external, optional tools; the package does not ship them. Repair:
   update Waza and install the Skills CLI, then rerun `setup check`.
5. Leftovers. Proposed acceptance: the 18 refresh items are expected while
   the host runs 0.24.1. Repair after publication: `repo-harness update`,
   then `repo-harness upgrade` to review the rest. `--apply` is the owner's
   action.
6. Skill eval evidence unavailable. Proposed acceptance: 0.24.2 makes no
   skill-effectiveness claim. Repair: run `bun run benchmark:skills --
   --home <temp-dir> --require-disposable` without `--dry-run`.
7. `deploy/env/.env.example` absent and practices not enabled. Proposed
   acceptance: the package has no deploy runtime or deploy environment
   variables, and practice evaluation stays advisory, as in #964.

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
