# repo-harness 0.19.1 Release Filing

- Date: 2026-09-12
- Package: `repo-harness@0.19.1`
- Base release: `v0.19.0`
- Integration base: `2bea52c1`. The contract started at `3ea6e453`; PR #410
  merged into `main` on 2026-09-12 and the candidate was rebased onto it.
- Release branch: `codex/release-0-19-1`.
- Candidate commit: bound by the release PR head.
- Release scope: metadata and documentation only. Every product surface in
  `v0.19.0..2bea52c1` is already accepted on `main`; this work-package stamps the
  two version authorities, rebuilds `docs/CHANGELOG.md` for the full range,
  refreshes the release-stamp lines in five README locales, and records this
  filing. No `src/` or `tests/` path is touched.
- Publish status: **not published.** Merge, tag, npm publication,
  `check:release-published`, and the Bun-global runtime refresh are all pending
  owner authorization.

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
  backlog — 9.7 GB in one repository measured at authoring time.
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
  `.ai/harness/policy.json#architecture.projection_*` keys — including
  `projection_version` — are stripped by adoption rather than copied into the
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
  produced no runtime effect — worker role only, identical identity, and the
  original deadline neither replaced nor extended.
  `assertCampaignPreparationRetryable` is the exclusive fence before the
  container create request; an existing container journal for the version probe
  or the workload identity means reconciliation, not retry, is the only exit.

### Same-release corrections (PR #410)

PR #410 merged into `main` at `2bea52c1` after this contract started and is part
of the candidate. It corrects work that is itself shipping for the first time in
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

The owner was shown that evidence on 2026-09-12 and selected `0.19.1`. Under 0.x
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
never reads the repository's prior values — nothing carries a repository setting
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
| `projection_failure_gate: "strict"` weakens to the host default `advisory` — a gate downgrade, not a default change | Set `projection_failure_gate: "strict"` in the same global block before running `init`; a repository that failed closed otherwise stops doing so |
| A tuned `projection_timeout_ms` reverts to `120000` | Re-author the timeout in the same global block before running `init` |
| Every adopted repository that simply never opted in flips from off to on once the account runs `update` — the widest blast radius, because it needs no prior repository setting to be hit | Assert the whole intended `architecture` block in `~/.repo-harness/config.json` before the first `init`, then inspect the first projection run |

The assertion must happen **before** `init`. Adoption deletes the repository
keys silently and warns nobody, so after the fact there is no record of what the
repository asked for, and the setting is not representable at repository scope
any more: a per-repository projection policy cannot be re-authored at all once
the upgrade lands. The breaking property is that a deliberately-set value is
discarded without warning, not that an upgrade step is required.

The remaining range items retire no authority:

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
release. None of those layers is claimed by this filing: only the version files
are stamped here, and every other layer stays unverified until the publish
follow-through below is authorized and read back.

## Verification

Run from the release worktree. The rows below were re-run after the candidate
was rebased onto `2bea52c1`; earlier results against `3ea6e453` are superseded.

| Gate | Result |
| --- | --- |
| `bun scripts/check-skill-version.ts` | pass — `repo-harness=0.19.1, template=0.19.1` |
| `bun test tests/readme-dx.test.ts --timeout 60000` | pass |
| `bun run check:reference-configs` | pass |
| `bash scripts/check-task-workflow.sh --strict` | pass |
| `bash scripts/check-architecture-sync.sh` | pass |
| `REPO_HARNESS_DIFF_BASE=2bea52c1 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh` | pass — this is the Governance root cause. On the first candidate the check reported `Substantive diff lacks canonical workflow evidence bound to sha256:a9056e87...` over `README.es.md`, `README.fr.md`, `README.ja.md`, `README.zh-CN.md`, `assets/skill-version.json`, `deploy/release-checklists/260912-repo-harness-0.19.1.md`, and `package.json`: no canonical workflow artifact carried that digest. Fixed by binding the recomputed `> **Substantive Change SHA256**:` line into `plans/plan-20260912-1053-release-0-19-1.md`, and by declaring the check in the contract's Verification Plan with its diff boundary bound into the command — without a committed comparison boundary the script prints `[task-sync] No changes detected.` and exits 0, a false green. |
| `bun src/cli/index.ts init --repo . --dry-run` | pass |
| `bun src/cli/index.ts fleet prune --help` | resolves; options as documented |
| `bun src/cli/index.ts run evidence-gc` usage | resolves; `--repo`, `--dry-run`, `--format` |
| `bun src/cli/index.ts refactor recommendations --help` | resolves; `--repo`, `--json` |
| `bash scripts/check-tarball-install-smoke.sh` | pass — `repo-harness-0.19.1.tgz installs, serves the packaged Operator, and packaged CLI bins start` |
| `bun src/cli/index.ts run verify-sprint --prepare-acceptance` | Inner `verify-contract` report: 12 criteria, 0 failed, status Fulfilled, verification evidence frozen. Enclosing gate: **failed closed.** The run recorded in `.ai/harness/checks/latest.json` for the first candidate was `repo-harness run verify-sprint` with `status: "fail"`, `exit_code: 1`, `failure_class: "change_assessment"` — the change assessment had no `ready` binding because the substantive digest was unbound. That binding is repaired here. The enclosing gate failed closed on the first candidate; on this head it passes — `bun src/cli/index.ts run verify-sprint` exits 0 under the recorded `user_waiver` AcceptanceReceipt (reviewer `User`, source `user-waiver`, actor `kito`), which the contract's `{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}` policy permits through its `user_waiver` clause. The criteria count is the inner report only and is not a release-gate pass. |
| `change-assessment prepare` | ready — `irreversible_effect` (deploy, release) covered by the declared `tarball-install-smoke` runtime readback |
| `bun run check:release` | **could not complete on the release machine.** Run over head `57511350`, it reached `scripts/check-ci.sh` and failed one test, `tests/architecture-projection-provider.test.ts:245` ("bounds a real provider process tree whose descendant keeps captured pipes open"); the observable failure is `ENOENT` opening the fixture's `descendant.pid`, meaning the spawned descendant never wrote it. The mechanism is not established and this row does not claim one. What is established is that the failure is not caused by this candidate: the diff contains zero `src/` and zero `tests/` paths and its only executable-adjacent change is the `package.json` version line; the same file on the same machine fails **two** tests against `main` at `2bea52c1` and **one** against this candidate; and CI over `2bea52c1` is green. A separate first attempt was SIGTERM'd by the OS under memory pressure and is not counted as a result. The full suite's authority for this release is therefore the CI `Test` job, recorded in the row below; this row is an unavailable local gate, not a pass. `package.json#prepublishOnly` runs `check-npm-release.sh --prepublish`, which returns at the fast gate and never reaches `check-ci.sh`, so publication is not mechanically blocked by this. The machine-local failure is recorded as out-of-scope follow-up, not repaired by this release. |
| `npm view repo-harness version` | pending |
| GitHub Required/CI on release PR | **pass over head `57511350`** — Actions run `34671334660`: `Test` pass (22m29s), `Governance` pass, `MCP path matrix` pass on `ubuntu-latest`, `macos-latest` and `windows-latest`, `Required / CI` pass; `mergeStateStatus` CLEAN. That head carries every substantive path in this release. The commit that merges also carries this row and the `check:release` row above, so it is one docs-only delta beyond `57511350`; CI re-runs on it and the merge is gated on that run being green, confirmed at merge time rather than claimed here. |

The declared `runtime_readback` oracle is not decorative. `deploy` and `release`
are irreversible workflow categories, so `change-assessment` refused to reach
`ready` while the contract declared no oracle of that kind — the first prepare
returned `blocked` with `oracle_gap` over all nine subject paths. The tarball
install smoke is what closes it: it observes the artifact a consumer receives
rather than the files in the worktree.

### Skill eval evidence

- `full_test_count`: unavailable — no skill eval was run for this candidate.
- `dry_run_ratio`: unavailable.
- `grader_pass_rate`: unavailable.
- `effectiveness_authority`: **none.** This filing carries no authoritative
  skill-effectiveness evidence and must not be read as a pass.

### Readiness yellow flags

From `bun src/cli/index.ts setup check --target claude --check-updates --json`
(overall `status: attention`):

- `doctor.security-config` — 2 findings, 0 high / 2 warn / 0 fail; first is
  `unmanaged-hook-command` at `~/.claude/settings.json`. Accepted: the machine's
  own user-level hook wiring, not a property of the released package. Inspect
  with `repo-harness security scan --json`; do not blind-delete user-owned
  config.
- `tooling.waza` — update-available. Repair:
  `bunx skills add tw93/Waza -g -a claude-code -s think hunt check health -y`,
  then re-run the readiness command.
- `tooling.codegraph` — update-available. Repair:
  `bun update @colbymchenry/codegraph && bash scripts/ensure-codegraph.sh --sync`.
- `runtime.skills_cli` — missing (optional), declared exception boundary for
  external Waza/Mermaid skill bootstrap. Accepted as-is.
- `repo.init-refresh` — `na`; this self-host source checkout owns its own
  workflow surfaces. Accepted as-is.
- Missing skill eval evidence: recorded above as unavailable, not as a pass.

None of these flags change the source or packaged runtime being released.

## Publish Follow-through

The owner has not authorized any of the following. All five are **pending** and
none was performed by this work-package:

1. Pending — merge the release PR into `main`.
2. Pending — annotated tag `v0.19.1` at the merge commit, pushed to `origin`.
3. Pending — `npm publish` of `repo-harness@0.19.1`.
4. Pending — `bun run check:release-published` read-back: registry, dist-tag,
   tarball, tag, and local version files must agree.
5. Pending — Bun-global runtime refresh, with `repo-harness --version` read back
   as `0.19.1`.
