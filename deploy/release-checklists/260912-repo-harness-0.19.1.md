# repo-harness 0.19.1 Release Filing

- Updated: 2026-09-13.
- Package: `repo-harness@0.19.1`; base published release: `v0.19.0`.
- Integration base: `7f6fcd1f143e77fd007f43d39e9fe5a7029583fb`.
- Published source: `66441481771bac742fcbca35fefa03d44ac25f8a` (PR #431).
- Source tree: `1f0db8cca1436cfb7e994640d009978492447ee1`, identical to the
  accepted PR head `4aa16400e6ec0e7255564c015851d6d9bd1257a3`.
- Existing remote annotated tag object: `58098c2292b5ac104ea1e4ce7e72d0a5d3475cdf`,
  previously targeting `d94ec3c7517230b361f1354805ab3d4a364a045a`.
- Owner authorization: publish current main as 0.19.1, including moving that
  old tag with an exact lease. npm reported 0.19.1 absent before preparation.
- Scope: update this filing and the 0.19.1 changelog, and repair all
  owner-approved release-gate blockers. Versions and deferred work remain unchanged.
- Status: published. npm `latest`, tarball integrity, clean installation,
  installed CLI/hook readback, GitHub Release and the leased tag all agree.

## Release Content

### Explicit operator exits for unbounded state

- `repo-harness fleet prune` previews confirmed-absent repository registrations;
  `--apply` removes those registry rows under the registry mutation lock and
  requires `--expected-revision <digest>` taken from the preview, so a registry
  that moved between preview and apply is refused. `--repo-id <id...>` narrows
  both inspection and removal. Registry rows only, no backup.
- `repo-harness run evidence-gc` applies the existing evidence-checkpoint and
  run-summary retention policies on demand and reports reclaimable bytes with
  `--dry-run`. Checkpoint retention has shipped since 0.19.0 but only ran inside
  a successful publish, so a repository whose ledger was reset kept its whole
  backlog: 9.7 GB in one repository measured at authoring time.
- Stop run summaries are bounded to the newest `RUN_SUMMARY_RETENTION_COUNT`
  entries, selected by Stop's own record shape (`run_id` plus `checks_file`,
  `handoff_file`, `policy_file`, `context_map_file`). Immutable
  `verification-<executionId>.json` records, acceptance snapshots, and any future
  writer's shape are left to their owners. `workflow_write_run_summary` in
  `assets/hooks/lib/workflow-state.sh` now emits all 11 fields in its jq-less
  branch; the previous 5-field branch would have made every jq-less host's
  summaries permanently unreclaimable under shape-based retention.

### Configuration authority

- Architecture projection is configured once per user in
  `~/.repo-harness/config.json#architecture`, not per repository. The retired
  `.ai/harness/policy.json#architecture.projection_*` keys (including
  `projection_version`) are stripped by adoption rather than copied into the
  host configuration. Operator path: `repo-harness update` once for the account,
  then `repo-harness init --repo .` per repository; `init` reports an
  `architecture projection readiness` step naming the exact repair when the
  global document is missing.
- `repo-harness refactor recommendations` reads measured refactor opportunities
  for an agent to raise with the user and never executes one; `--json` prints the
  recommendations with readiness. The user decision remains the gate.

### Operator board and skills

- The operator board is scoped to the selected repository, and the operator
  browser payload moves to protocol 5, versioned separately from
  `FLEET_BOARD_PROTOCOL`. The tarball smoke imports
  `OPERATOR_FLEET_PAYLOAD_PROTOCOL` from the installed package instead of
  restating the literal.
- The board shows a fenced read-only task worktree diff with explicit target and
  head identity, tracked patch, and untracked filenames. Git reads are bounded
  and cancellable; external filters and hidden index changes are refused, lazy
  fetch and fsmonitor are disabled, and physical directory identities are
  compared across Windows short and long aliases.
- The `auto-campaign` bundled skill facade authorizes one bounded conversational
  campaign turn over the existing `repo-harness campaign` commands. No daemon,
  cron, hook-triggered execution, automatic next turn, or automatic merge.

### Install and campaign correctness

- Install honors ownership receipts on upgrade: unchanged manifest-recorded files
  upgrade, user-modified content stays protected, whole bundled skill trees sync
  with rollback on copy failure, and `deep-worker` is included in transaction
  capture and fleet completeness checks. The Herdr policy pin is seeded during
  TypeScript adoption, and a missing or malformed
  `external_tooling.herdr.min_version` reports `configuration-error` instead of
  runtime `unavailable`.
- Campaign `prepareChild` retries preparation when the prior attempt provably
  produced no runtime effect: worker role only, identical identity, and the
  original deadline neither replaced nor extended.
  `assertCampaignPreparationRetryable` is the exclusive fence before the
  container create request; an existing container journal for the version probe
  or the workload identity means reconciliation, not retry, is the only exit.

### Current-main additions

- `repo-harness-test` is a full-profile source-checkout testing router. Its
  references cover fixture ownership, original-path template restoration,
  proven CLI completion semantics, evidence selection and CI lanes. Downstream
  projects are directed to their own tooling.
- CI uses docs/full/draft coverage selection and a four-worker isolated file
  pool. Shared fixture templates and in-process chatgpt CLI tests reduce setup
  work while preserving existing assertion semantics.
- Real install and Herdr tests are opt-in in ordinary runs and mandatory in the
  explicit `check:release` all lane. A green hosted functional lane does not
  establish that evidence.
- `init` now seeds global architecture/refactor defaults after successful
  adoption, under the shared host transaction lock. Existing global values are
  preserved. Issue observation and external-source refresh forward injected
  clocks to GitHub fetchers.

### Same-release corrections (PR #410)

PR #410 merged into `main` at `2bea52c1` and is part of the candidate. It corrects work that is itself shipping for the first time in
this release, so it carries no changelog entry of its own:

- The `docs/reference-configs/hook-operations.md` evidence-retention table gained
  a third writer row while the prose below it still said "two"; both are fixed in
  the `assets/reference-configs/` authoring source and its projection, so the
  table that ships is the corrected one.
- The accepted contract record for the evidence-gc work still stated the earlier
  `reason: "session-stop"` discriminator that the merged code deliberately
  overturned, and its `allowed_paths` had not been widened to the paths the work
  actually touched. Left as-is, the record would have re-introduced the bug that
  round fixed.
- A PATH shim temporary directory in `tests/workflow-state-lib.test.ts` leaked
  one directory per run.

## Semantic Version Decision

`0.19.1` is the owner's selection, recorded here with its counter-argument
rather than presented as the neutral reading.

The range does add public CLI surface: `repo-harness fleet prune`,
`repo-harness run evidence-gc`, `repo-harness refactor recommendations`, and the
`auto-campaign` bundled skill facade. It also moves the architecture projection
settings from repository policy to a per-user configuration document, which
retires the `.ai/harness/policy.json#architecture.projection_*` keys as an
authority even though adoption performs that migration without a manual step.

This repository's own precedent takes a minor for new public surfaces. The
0.19.0 filing explicitly rejected `0.18.1` on that ground, citing new command
groups; 0.17.1 -> 0.18.0 took a minor for a protocol bump alone, and this range
carries an operator payload protocol bump (4 -> 5) as well.

The owner selected `0.19.1` on 2026-09-12 and explicitly reaffirmed that
version for current main on 2026-09-13. Under 0.x
cadence the patch position is not itself a compatibility claim, and no downstream
repository must take an action to keep working. That is the argument the choice
rests on; the precedent above points the other way and is not resolved by it.

## Breaking Changes

Architecture projection retires its per-repository authority and ships no
per-repository replacement.

`readArchitectureProjectionPolicy` (`src/core/architecture/projection.ts:214`)
now has exactly one call site, `src/effects/architecture/projection-config.ts:27`,
and that call site reads the global document. No per-repository read path
survives, so `.ai/harness/policy.json#architecture.projection_*` is no longer
read anywhere.

This is a deletion, not a migration. Standard adoption unconditionally deletes
all five keys from `policy.architecture`
(`src/core/adoption/standard-plan.ts:800`) and pushes no `AdoptionWarning`, so
the operator gets no notice that a value they authored was discarded.
`src/cli/commands/architecture-configuration.ts:9` writes
`~/.repo-harness/config.json#architecture` only when `!current.initialized`, and
never reads the repository's prior values; nothing carries a repository setting
into the host document.

The host defaults are `projection_provider: 'archctx'`,
`projection_apply: 'automatic'`, `projection_failure_gate: 'advisory'`, and
`projection_timeout_ms: 120_000`
(`src/effects/architecture/projection-config.ts:4-9`). The old per-repository
defaults were `provider: 'disabled'` and `apply: 'disabled'`
(`src/core/architecture/projection.ts:217-218`). Four concrete losses follow, in
ascending blast radius:

| Change | Downstream action |
| --- | --- |
| A repository that set `projection_apply: "disabled"` starts projecting under the host default `automatic` | Set `projection_apply` in `~/.repo-harness/config.json#architecture` before running `init` |
| `projection_failure_gate: "strict"` weakens to the host default `advisory`; a gate downgrade, not a default change | Set `projection_failure_gate: "strict"` in the same global block before running `init`; a repository that failed closed otherwise stops doing so |
| A tuned `projection_timeout_ms` reverts to `120000` | Re-author the timeout in the same global block before running `init` |
| Every adopted repository that simply never opted in flips from off to on once the account runs `update`; the widest blast radius, because it needs no prior repository setting to be hit | Assert the whole intended `architecture` block in `~/.repo-harness/config.json` before the first `init`, then inspect the first projection run |

The assertion must happen **before** `init`. Adoption deletes the repository
keys silently and warns nobody, so after the fact there is no record of what the
repository asked for, and the setting is not representable at repository scope
any more: a per-repository projection policy cannot be re-authored at all once
the upgrade lands. The breaking property is that a deliberately-set value is
discarded without warning, not that an upgrade step is required.

The remaining range items retain their existing authority boundaries:

- The operator payload protocol 4 -> 5 is internal to the board and its smoke;
  the payload version is read from the installed package, not restated by
  consumers.
- No backlog schema, host readiness prerequisite, or tracked workflow file
  changes.

`assets/skill-version.json#breakingChanges` carries no `0.19.1` entry. That
array and the `0.19.1` version position are the owner's to set; this filing
records the retired authority and its operator consequence rather than making
that call here.

## Authority Boundary

npm `latest`, tag `v0.19.1`, tarball metadata, source commit, the two version
files (`package.json#version`, `assets/skill-version.json#version` and
`#templateVersion`), and the installed runtime must all resolve to one immutable
release. The user authorized publication of current main, including replacement of the
previous old tag target. Publication remains conditional on current candidate
evidence and an npm absence check. The published package is never overwritten.

## Verification

The release contract declares one full `bun run check:release` execution with
`BUN_TEST_ISOLATE_FILES=1`, `BUN_TEST_JOBS=4` and
`BUN_TEST_MAX_CONCURRENCY=1`. Its all lane unskips
`REPO_HARNESS_TEST_EXPENSIVE`, runs required repository checks, packs the
package, and exercises a clean tarball installation. The version consistency
check is a separate preflight. Canonical results are bound to the contract's
frozen subject; neither the old 0.19.1 candidate nor hosted functional CI
substitutes for this release gate.

The prior candidate's local gate failed in process-tree timeout fixtures; this
new release preparation retains that history as a reason to require a fresh
full release result. A skipped or failed case is not a pass.

The current run exposed cold-start timing assumptions in existing fixtures.
Tooling, MCP and global runtime shell fixtures share a prepared launcher, with
private bodies beside their original command paths. This removes repeated
cold executable startup while retaining real subprocess probes. Hard links preserve
command identity when runtime validation resolves executable paths. The Oracle
cleanup test measures from
its actual workload marker after preflight, retaining the 8000 ms bound and
all cleanup assertions. Production probe timeouts and the four-worker pool
remain unchanged. The initial failed run is preserved in the workflow notes;
only the final frozen-candidate gate can establish release readiness.
The lane test isolates its inherited expensive-test flag; the concurrent
verification test holds admission until the second request observes the lock.
The benchmark runtime bundle uses gzip level 1 to reduce preparation CPU cost
while retaining all dependencies, immutable hashing and real install checks.

### Evidence locations

- Release preparation plan and contract: the `20260913-1143-release-0191-current`
  workflow family, archived at closeout.
- Canonical verification: `.ai/harness/checks/latest.json` and its immutable run
  snapshot while preparing; durable disposition in the archived review.
- Published verification: `bun run check:release-published` reads registry
  metadata, downloads the immutable tarball, installs it in a clean prefix and
  verifies installed CLI/hook contracts; its runtime receipt is recorded under
  `.ai/harness/checks/runtime-evidence-release.latest.json`.

### Skill effectiveness and host readiness

- `full_test_count`, `dry_run_ratio`, `grader_pass_rate`: unavailable; no live
  skill-effectiveness eval is claimed. `effectiveness_authority`: none.
- Existing host hook warnings and optional tooling-update notices belong to
  host setup. Preserve user-owned configuration during the runtime refresh.
- Source unit/integration tests and package-install smoke do not claim live
  downstream LLM routing effectiveness.

## Publish Follow-through

- PR #431 merged with Required CI green: run `34740872712`, attempt 2.
  The main-branch run `34741967140` also passed without a retry.
- The first PR attempt failed the benchmark base immutability guard. Its exact
  changed path was not captured; 100 isolated Linux repetitions and the macOS
  focused case passed. No assertion or implementation was changed for this
  intermittent failure. The retry and subsequent main run passed; its root
  cause remains unproven.
- Local full release execution `vx-1d380329781f4342a7b9` passed in 741727 ms.
  The implementation closes with typed owner acceptance (`user_waiver`), not
  the earlier documentation-only external review.
- Packed the exact merged commit with rebuilt hook and operator UI bundles.
  The archive includes all five `repo-harness-test` skill files.
- Frozen tarball: `repo-harness-0.19.1.tgz`, 11729923 bytes;
  SHA-1 `dd04427fcc5b1f6706b31ce8893123e93d5367a7`;
  integrity `sha512-V2XtdC9zMXpRImr5rCib60LRVIv+qNAgYBUoaHtrHRphqwxTrnWZihNgo6oPXIF82cslaSFUqX16uyKqiMVewA==`.
- Replaced the old annotated tag using its exact object as a force-with-lease
  expectation. New tag object `3972e6b247ea87a283112a0f29f16764f93f12a7`
  peels to the published source above.
- npm authentication was renewed as `ancienttwo`; the package upload completed
  after the separate publish authentication with HTTP 202 and CLI exit 0.
- [GitHub Release](https://github.com/Ancienttwo/repo-harness/releases/tag/v0.19.1)
  was published at `2026-09-13T06:13:25Z`, using the 0.19.1 changelog.
- npm's exact-version lifecycle endpoint subsequently returned `published`.
  The initial 404 readback occurred before registry availability; no duplicate
  publish was submitted. Public metadata now reports `latest: 0.19.1` and the
  exact frozen tarball SHA-1 and SHA-512 above.
- `bun run check:release-published` passed. Runtime receipt
  `sha256:e643557ee3e049072bd11e905b56f838ab571cf60fafbebad720ea9a3d6ad307`
  records `published_tarball`, `clean_install` and `installed_hook_readback`
  as pass; the installed hook returned `StateSnapshot v1`.
- The separate existing-host update was attempted with
  `repo-harness update --version 0.19.1 --no-codegraph --no-external-skills`.
  The installer refused two unowned/modified Codex skills (`obsidian-memory`
  and `claude-plan`) and agent-fleet drift, then rolled the transaction back.
  The global CLI still reports 0.19.0. Existing custom files were preserved;
  replacing them requires the owner's disposition. This host-state conflict
  does not invalidate the successful clean installation of the published package.

Before npm publication, an interrupted tag move may be restored with an exact
lease against the tag object written by this release. After npm publication,
the immutable version is retained; any repair needs a new release version.
