# Plan: workflow-contract.json as a thin per-repo marker

> **Status**: Draft (revision 2)
> **Created**: 20261005-1313
> **Revised**: 20261005-1332, after the Codex read-only review `/tmp/contract-marker-plan-codex-review.md` (CHANGES REQUESTED)
> **Slug**: contract-thin-marker
> **Artifact Level**: work-package
> **Promotion Reason**: shared_contract (hooks, doctor, status, adoption, inspection, scaffold, and tests touch this path)
> **Verification Boundary**: Plan only. No code changed. Every file:line below was read at HEAD 4cb2aaf8 (package 0.20.0).
> **Rollback Surface**: Revert the plan commits. The future implementation PR reverts with `git revert <squash-commit>`.
> **Spec**: `docs/spec.md`
> **Research**: `/tmp/global-install-audit.md` §1, §2b, §3 C1, §5 Q2/Q3
> **Task Contract**: (none; plan only)
> **Task Review**: (none; plan only)
> **Implementation Notes**: (none; plan only)

Evidence labels: **(observed)** = I ran a command in this worktree. **(code)** = I read the source at HEAD. **(inferred)** = reasoned, not run. **(audit)** = taken from the audit and not re-run by me. **(review)** = taken from the Codex review and checked by me against the code.

## 0. Due diligence

### P1 map
- The repo path `.ai/harness/workflow-contract.json` has two roles. It is the opt-in marker for hooks, status, doctor, and session context. It is also a byte copy of the package asset `assets/workflow-contract.v1.json`.
- The package asset is the authority. Adoption copies it into each repo (`src/core/adoption/standard-plan.ts:757`, `src/core/adoption/workflow-contract-asset.ts:4-8`). The shell scaffold also copies it (`scripts/lib/project-init-lib.sh:690-703`).
- Production code selects a body at three boundaries: `scripts/workflow-contract.ts:243-296` (inspect), `src/core/adoption/workflow-contract-asset.ts:4-12` (adoption, upgrade), and `src/effects/runtime/helper-runner.ts:276-294` (helpers). Protected helpers select the installed package and ignore `REPO_HARNESS_SOURCE_ROOT` (`helper-runner.ts:20,362-365`).
- The asset is 175,016 B. `migrations` is 125,776 B of that (observed, `jq`). The asset holds no repo data.

### P2 trace (one real path)
`repo-harness init` → `init.ts:725-731` runs `scripts/inspect-project-state.ts --repo <repo>` → `inspectRepo` reads the **repo** copy first through `resolveWorkflowContractForRepo` (`scripts/workflow-contract.ts:293-296`, used at `scripts/inspect-project-state.ts:101`) → `init.ts:733-736` runs adoption **even when inspect failed** → `createPlan` (`src/cli/commands/adoption-plan.ts:67-85`) → `applyAdoptionPlan` (`src/effects/fs-transaction.ts:571-620`) → `standard-plan.ts:757` replaces the repo copy with the asset bytes → `init.ts:930-932` exits 1 when any step failed. The hook runtime only checks that the file exists (`src/cli/hook/runtime.ts:190-192,361`).

Two facts from this trace drive the revision:
- The executor ignores the operation `status` field. It checks kind, path, symlinks, and expected file state (`fs-transaction.ts:535-569`), then applies every operation (`:601-618`). The only boundaries that stop all writes are (a) an exception in `planAdoption`, which `createPlan` turns into `invalid_adoption_plan` (`adoption-plan.ts:71-84,124-136`), and (b) a preflight error, which stops every operation (`fs-transaction.ts:572-599`). (code; the review's dry-run probe agrees)
- An inspect failure does not stop adoption. It only makes `init` exit 1 after adoption already wrote (code).

### P3 decision
- Why the copy exists: older repo-local helpers parsed the repo copy. At v0.8.1 and v0.19.5, `assets/templates/helpers/check-task-workflow.sh` has 9 and 11 parse sites (observed). The v0.10.0 blob calls `contract_query_lines` on `.ai/harness/workflow-contract.json` (`tests/fixtures/upgrade-release-blobs/05ed2543…:60-75`, provenance `tests/fixtures/upgrade-v0.10-project/provenance.json:316-319`).
- That reason is gone. Helpers run only from the package (`helper-runner.ts:15-18`; asset `helpers.runtimeSource: "package"` at `assets/workflow-contract.v1.json:238-239`). The current `check-task-workflow.sh` only parses the JSON and always exits 0 (`scripts/check-task-workflow.sh:10-25`).
- Core invariant: a file at `.ai/harness/workflow-contract.json` opts the repo in, and the package asset is the one source of truth for the contract body.
- Smallest coherent change: the repo file becomes a small marker. Package-body loading and repo-marker classification become two separate steps. Adoption is the only writer, and it refuses at plan creation. No reader accepts a repo body as a contract.

### Corrections to the audit
1. The audit says runtime resolution "already prefers an installed copy" (`scripts/workflow-contract.ts:289-296`). There, "installed" means the **repo** copy: repo-first, package-second. A marker in that path fails `loadWorkflowContract` validation (`:199-241`). This resolver must change.
2. There are two alignment tests: `tests/workflow-contract.test.ts:57-61` (bytes) and `tests/unit/helper-projection-drift.test.ts:20-25` (deep equality).
3. `doctor.ts:455-461` is not a contract check. It only marks `typed-hook-routes` as `na` when the repo is not opted in.
4. The body `version` and `contractId` never changed: every tag from v0.1.2 to v0.20.0 has `1.0.0` / `tasks-first-harness-v1` (observed). They cannot act as a pin today.
5. The growth from 32 KB to 175 KB came from `0573275f feat(upgrade): clean and refresh verified owned leftovers (#511)`, 31,828 → 175,019 B (observed).

## 1. Current contract usage

### 1a. Readers of the repo path `.ai/harness/workflow-contract.json`

| Reader | file:line | What it reads | Effect of a marker |
|---|---|---|---|
| Hook runtime opt-in | `src/cli/hook/runtime.ts:24,190-192,361` | existence only | none |
| Hook command re-export | `src/cli/commands/hook.ts:20,31` | `isOptIn` | none |
| Status | `src/cli/commands/status.ts:49,231,236` | existence only | none |
| Doctor `typed-hook-routes` | `src/cli/commands/doctor.ts:448-462` | existence via `isOptIn` | none |
| Session context tooling advisory | `src/cli/hook/session-context.ts:1280` | existence only | none |
| Inspect project state | `scripts/inspect-project-state.ts:101-108,118-119` via `scripts/workflow-contract.ts:289-296` | **full body**: `artifacts.runtimeManifest`, `documents.*`, `migrations.legacyPaths`, `migrations.upgrade.actions` (fallback at `:103`) | **breaks** (validation throws) |
| Inspect projection | `assets/templates/helpers/inspect-project-state.ts:101-102`, `assets/templates/helpers/workflow-contract.ts:289-296` | same | same; a generated projection of `scripts/` |
| Init inspect step | `src/cli/commands/init.ts:725-731` | runs the inspect script | `init` exits 1 through inspect, after adoption already ran |
| Task workflow check | `scripts/check-task-workflow.sh:14` (projection `assets/templates/helpers/check-task-workflow.sh:14`) | JSON object parse; advisory; exit 0 | none |
| Architecture queue | `scripts/architecture-queue.sh:296-297` | path name only | none |
| Legacy repo-local readers in consumer repos | release helpers that name the path (observed, `git grep` over all `v*` tags): `check-task-workflow.sh`, `ensure-task-workflow.sh`, `workflow-contract.ts` and its importers, `architecture-queue.sh`, `architecture-drift.sh`, hook `session-start-context.sh` | body (for the parsers) or path only | **breaks** for each kept parser fork (§5e) |

### 1b. Readers of the package asset `assets/workflow-contract.v1.json`

| Reader | file:line | Fields |
|---|---|---|
| Asset loader | `src/core/adoption/workflow-contract-asset.ts:4-12` | whole file |
| Adoption templates | `src/core/adoption/manifest-templates.ts:39-60` | `adoptionTemplates`, `documents` |
| Upgrade planner | `src/core/upgrade/legacy-inventory.ts:109-111,293-295` | `migrations.upgrade.actions`, `installedCopyExcludes` |
| Helper runner | `src/effects/runtime/helper-runner.ts:18,161-217` (scripts), `:219-269` (descriptions), `:276-294,362-365` (runtime selection) | `helpers.scripts`, `helpers.descriptions` |
| Workflow contract helper | `scripts/workflow-contract.ts:138,243-287,310-313` | whole file; `REPO_HARNESS_SOURCE_ROOT` override at `:244-253` |
| Skill version check | `scripts/check-skill-version.ts:60-63,113-116` | indirect: `resolveAgenticDevRoot` probes the asset exists, then reads `assets/skill-version.json` |
| Helper projection sync | `scripts/sync-helper-sources.ts:23,110` | `helpers.scripts` |
| Installed-copy sync | `scripts/sync-codex-installed-copies.sh:94` | `installedCopyExcludes` |
| Source checkout probe | `src/core/adoption/source-checkout.ts:4-10` | existence |
| Legacy shell scaffold | `scripts/create-project-dirs.sh:22,38,50`, `scripts/init-project.sh:29,76,304` | `helpers.scripts`, `artifacts.requiredDirectories` |

### 1c. Writers of the repo path

| Writer | file:line | Behavior today |
|---|---|---|
| Adoption apply (`init`) | `src/core/adoption/standard-plan.ts:757`, `writeOperation` at `:150-164` | replace with asset bytes; any existing content, edited or not; fs-transaction backup (`tests/cli/adoption-plan.test.ts:403-418`); apply-time `expectedContentHash` check (`fs-transaction.ts:182-197`) |
| Shell scaffold | `scripts/lib/project-init-lib.sh:690-703` (`cp`), called at `scripts/create-project-dirs.sh:42-43` and `scripts/init-project.sh:68-69,306` | plain overwrite; no ownership check; no backup. `create-project-dirs` is a non-public internal step (`assets/skill-commands/manifest.json:422`). The scaffold protocol runs `scripts/init-project.sh` (`assets/skills/repo-harness-setup/references/scaffold.md:13`) and then says to attach the workflow "through the same contract install path used by init" (`:14`) |

### 1d. Contract data and generated text that name the path
- `artifacts.runtimeManifest` (`assets/workflow-contract.v1.json:242`) and `artifacts.requiredFiles` (`:299`). Both stay valid.
- Upgrade action `runtime-contract-refresh` (`:533-545`). Its summary says "Install the current runtime workflow contract". Change the wording.
- Policy text that points into the repo body: self-host `.ai/harness/policy.json:196,353`, and the shell generator `scripts/lib/project-init-lib.sh:1594` (asset-source list) and `:1706` (`".ai/harness/workflow-contract.json#migrations.upgrade.actions"`). No code reads `upgrade.cleanup.source` or `assets.sources` (observed, grep empty). The TS generator does not write these keys (`standard-plan.ts:400-404`). Change the text to name the package asset, in the same PR.

### 1e. Tests that touch the path

| Group | Files | Change needed |
|---|---|---|
| Repo copy equals asset | `tests/workflow-contract.test.ts:57-61`, `tests/unit/helper-projection-drift.test.ts:20-25` | yes: assert a valid marker for the asset `contractId`/`version` |
| Fixture repos that copy the body | `tests/contract-worktree-squash-cleanup.test.ts:53`, `tests/architecture-projection-continuation.test.ts:79`, `tests/helpers/helper-script-fixture.ts:75` | yes: write a marker |
| Shell scaffold output | `tests/create-project-dirs.runtime.test.ts:122,231-236`, `tests/scaffold-parity.test.ts:32-54`, `tests/init-project.settings.runtime.test.ts:29`, `tests/factor-factory.test.ts:20` | yes, if the shell write retires (§5d): the file is no longer in the shell output; body assertions move to the package asset |
| Inspect with a stale repo body | `tests/workflow-contract.test.ts:436-458` | yes: becomes the `legacy_known` / `legacy_unknown` case |
| Adoption apply | `tests/cli/adoption-plan.test.ts:104,170,403-418,561`, `tests/cli/init.test.ts:103,293,460,1307,1330` | yes: `:403-418` writes `{}`, which becomes a refused state; others check existence |
| Doctor | `tests/cli/doctor.test.ts:52-67` | yes: healthy cases need a valid marker; `{}` stays only in an explicit invalid-marker case |
| Hook-init with `{}` | `tests/cli/init-hook.test.ts:431` (and `:63,89` expect the marker path) | check at implementation: no change if `runInitHook` does not plan adoption |
| Opt-in only (`{}`) | `tests/hook-runtime.test.ts:15`, `tests/hook-runtime-characterization.test.ts:41`, `tests/cli/hook.test.ts:15`, `tests/cli/status.test.ts:207-235`, `tests/session-context.test.ts:866,899,928`, `tests/session-state-authority.test.ts:82,175,245`, `tests/board-slice.test.ts:162`, `tests/runtime-profile-enforcement.test.ts:30`, `tests/plan-status-gate.test.ts:50`, `tests/mutation-guard.test.ts:43`, `tests/run-identity.test.ts:195`, `tests/state/adapter-parity.test.ts:294` | none: existence semantics stay |
| Path list for scans | `tests/retired-planning-provider.test.ts:17` | none (inferred: it lists paths to scan) |
| Package asset content | `tests/workflow-contract.test.ts:43,95,144,214-361`, `tests/bootstrap-files.test.ts:240,337,390`, `tests/install-profiles.test.ts:131`, `tests/migration-script.test.ts:11`, `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts:113`, `tests/cli/run.test.ts:22-238`, `tests/unit/closeout-runner-guardrails.test.ts:65` (a fixture package asset, not the repo path) | none: the asset stays a full body |
| Historical fixtures | `tests/fixtures/upgrade-release-blobs/*`, `tests/fixtures/hrd09-legacy-hook-runtime/*` | none: they are frozen release bytes |
| Adoption expected JSON | `tests/fixtures/adoption/{self-host-repo,minimal-repo,empty-repo}.expected.json` | none: they record operation metadata only, and no test, `src/`, or `scripts/` file reads them (observed, grep empty). Their op id `…:workflow-contract` already differs from the live id built at `standard-plan.ts:153` |

The repo rule `CLAUDE.md:17` / `AGENTS.md:17` says "Keep `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json` aligned". `docs/architecture/domains/workflow-engine.md:21` says the repo file "is the installed runtime copy". Both must change.

## 2. Marker schema

### 2a. Fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `kind` | `"repo-harness.workflow-contract-marker"` | yes | Separates a marker from a legacy body. A legacy body has no `kind`. |
| `protocol` | `1` | yes | Marker format version. A reader rejects any other value. |
| `contractId` | string | yes | Must equal the package body `contractId` (today `tasks-first-harness-v1`). |
| `contractVersion` | string | yes | Must equal the package body `version` (today `1.0.0`). |
| `packageVersion` | semver string | Option P only (§3) | The repo-harness version that the repo requires. Absent in Option F. |

No `overrides` field in protocol 1. The body holds no repo data, and no reader needs a repo override (P1). If Aimpact names a real override, it becomes protocol 2 (Q4). Readers reject unknown keys, so the marker cannot grow into a second, partial body.

### 2b. Example

Option F (floating):
```json
{
  "kind": "repo-harness.workflow-contract-marker",
  "protocol": 1,
  "contractId": "tasks-first-harness-v1",
  "contractVersion": "1.0.0"
}
```

Option P (pin):
```json
{
  "kind": "repo-harness.workflow-contract-marker",
  "protocol": 1,
  "contractId": "tasks-first-harness-v1",
  "contractVersion": "1.0.0",
  "packageVersion": "0.21.0"
}
```

Size: about 150 B, against 175,016 B today.

### 2c. Resolution: two steps

The resolver in `scripts/workflow-contract.ts` replaces `resolveInstalledWorkflowContract` and `resolveWorkflowContractForRepo` (`:289-296`). `src/` imports it directly, as it already imports from `scripts/` (`src/cli/hook/session-context.ts:46`, `src/effects/state/resolve-effective-state.ts:5`). `scripts/sync-helper-sources.ts` carries it to `assets/templates/helpers/`.

**Step A — load the package (fatal).** `loadPackageWorkflowContract(runtimeRoot)` loads the body with the existing `loadWorkflowContract` (`:268-287`) and reads `runtimeRoot/package.json` `version`. The caller passes `runtimeRoot`. It is the runtime that will execute (§3, P2-3). Errors, all fatal for every caller:
- `workflow_contract_package_missing` — no asset (`:256-261`);
- `workflow_contract_package_malformed` — bad JSON (`:280-284`);
- `workflow_contract_package_invalid` — structure check fails (`:199-241`);
- `workflow_contract_package_version_invalid` — `package.json` missing, or `version` not valid semver. Fatal in Option P. In Option F it is only a doctor detail.

**Step B — classify the repo file (never throws on repo content).** `classifyRepoWorkflowContract(repoRoot, pkg)` returns one state. It never reads fields from a legacy body. It only hashes the bytes.

| State | Condition |
|---|---|
| `absent` | no file |
| `marker_valid` | valid marker; `contractId`/`contractVersion` equal the package body; Option P version rule holds |
| `marker_stale` | valid marker; `contractId` or `contractVersion` differs from the package body |
| `marker_pin_newer_than_package` | Option P: `packageVersion` > installed version |
| `marker_pin_older_than_package` | Option P-exact only: `packageVersion` < installed version |
| `legacy_known` | no `kind`; sha256 is in the release table (§5a); carries the matched tag range |
| `legacy_unknown` | no `kind`; JSON object with `contractId` or `helpers`; sha256 not in the table |
| `marker_malformed` | bytes are not JSON |
| `marker_invalid` | JSON, but wrong `kind`/`protocol`, unknown key, wrong type, or neither marker nor body (for example `{}`) |

### 2d. What each caller does

| Caller | Step A failure | Step B use |
|---|---|---|
| Inspect (`inspect-project-state.ts`) | fatal, exit non-zero | one drift signal per state; inspection data always comes from the package body |
| Adoption (`standard-plan.ts`) | fatal (it already reads the asset) | §5b repair table; refuse with an exception for non-repairable states |
| Doctor (§6) | `fail`, whatever Step B says | maps every state to a status |
| `repo-harness run workflow-contract --repo . [--check]` | fatal | prints the package body for an `ok` state; `--check` exits non-zero for any state other than `marker_valid` (CI use, §4) |
| Option P enforcement in `repo-harness run` | fatal | non-`marker_valid` pin states stop the helper |
| Hooks, status, session context | not called | not called: opt-in stays "file exists" (`runtime.ts:190-192`) |

Keeping hooks on existence is not a fallback. It is the single existing opt-in rule, and hooks never read the body. A hook entrypoint that CI happens to call also sees only existence (inferred from `runtime.ts:361`).

## 3. Version pin vs floating (two open options)

Fact first: in 0.20.0 the repo copy is **not** a working pin. Hooks, status, doctor, and session context check only existence (§1a). Helpers, adoption templates, the upgrade planner, and the sync script read the package asset (§1b). Only `inspect-project-state` reads the repo body, and it already prefers the package upgrade actions (`scripts/inspect-project-state.ts:103`). Each machine already behaves like its own installed package (code). So Q2 asks whether Aimpact **wants** a new pin.

### Option F — floating

- Semantics: the marker says "this repo uses contract `tasks-first-harness-v1` v`1.0.0`". The installed package defines all behavior.
- Installed package older or newer than the repo's last `init`: no failure while `contractId`/`contractVersion` match. If a later package changes `contractVersion`, the state is `marker_stale`; `init` repairs it (§5b).
- Max vs Mac mini: each machine uses its own package, as today. Doctor cannot report skew, because the marker records no package version.
- Pros: matches observed 0.20.0 behavior; smallest change; no parse on the hook hot path; `init` on one machine makes no marker diff for the other.
- Cons: two machines can run different bodies with no report. `contractVersion` is a weak gate: it has been `1.0.0` since v0.1.2. It works only if releases bump it on breaking repo-facing changes (Q3).

### Option P — pin

| | P-exact | P-floor |
|---|---|---|
| Rule | installed version = `packageVersion` | installed version >= `packageVersion` |
| Installed older | `marker_pin_newer_than_package` → fail closed | same |
| Installed newer | `marker_pin_older_than_package` → fail closed; `init` repairs | allowed |
| Who writes the pin | every `init` writes the executing version | `init` writes the executing version; Q5 asks whether an older machine may lower it |
| Max vs Mac mini | the machine with the other version fails until `repo-harness update`; an `init` on one machine moves the pin and breaks the other after pull | the older machine fails after the newer machine runs `init` and commits |

- **Version source (review P2-3).** The check must use the runtime that executes. `resolveHelperRuntime` honors `REPO_HARNESS_SOURCE_ROOT` only for unprotected helpers (`helper-runner.ts:276-294`). Protected helpers (`acceptance-receipt`, `contract-worktree`, `ship-worktrees`, `merge-gate`, `:20`) always use the installed package (`:362-365`). So `repo-harness run` passes the selected `HelperRuntime` root to Step A. Inspect and doctor pass the root they run from. The pin check must not make protected helpers honor the override.
- **Enforcement points must be named.** If only inspect and doctor check the pin, it guards little, because hooks and helpers do not read the repo file. To give the pin effect, `repo-harness run` must check it. Hook enforcement (`runtime.ts:361`) adds a read, a parse, and a semver check to every hook call, and lets skew stop hooks on one machine.
- **Limit.** If hooks stay on existence, hook behavior can still differ across machines, even with a pin. P-floor is a minimum version, not an exact behavior pin.
- Pros: one recorded version per repo; skew is visible; CI can run `bunx repo-harness@<packageVersion>`.
- Cons: lockstep upgrades; every `init` can make a marker diff; hot-path cost if hooks enforce it; with `REPO_HARNESS_SOURCE_ROOT` the dev checkout `package.json` decides for unprotected helpers.

### Leaning (not a decision)

Both options stay open. Aimpact decides in Q2.
- If no pin is wanted: Option F, plus a release rule to bump the body `version` when repos must run `init` again (Q3).
- If a pin is wanted: P-floor, enforced in Step A/B callers and `repo-harness run`, with hooks on existence and doctor reporting skew.

The schema supports both. `packageVersion` and the two pin states are the only difference.

## 4. CI and collaborators without the global install

### What still works
- Git tracks the marker. The opt-in rule holds.
- `check-task-workflow.sh` parses JSON and exits 0 (`scripts/check-task-workflow.sh:10-25`). A marker passes. This script is a diagnostic. It cannot block CI, because it always exits 0.
- Hooks normally do not run in CI. If CI calls a hook entrypoint, it checks existence only.
- The `.gitignore` managed block does not change.
- `package.json` scripts already call `repo-harness run …` (`standard-plan.ts:671-687`). They already need the CLI.

### What breaks
1. Consumer CI steps that read body fields from the repo file. I did not check consumer CI (audit Q3, still open).
2. Kept legacy repo-local parsers (§1a last row). The audit reports forks in hegui-agent (28), 97app (5), aiphabee (40, gitignored), and `.ai/harness/scripts/*` in hegui-agent and 97app (audit). §5e gates the cutover on these.
3. A collaborator who reads the repo file to learn the contract sees only the marker.

### Options

| Option | How | Cost | Disposition |
|---|---|---|---|
| A. `bunx repo-harness` | `bunx repo-harness@<version> run workflow-contract --repo .` prints the package body after Step B. npm has `repo-harness` 0.20.0 (observed, `npm view repo-harness version`). Today the helper prints only the package body (`scripts/workflow-contract.ts:310-313`). | small; needs network | recommended |
| B. Blocking CI check | `bunx repo-harness@<version> run workflow-contract --repo . --check` exits non-zero for every state other than `marker_valid`. Do not use `repo-harness doctor` for this: it also runs machine checks, and exits 1 on any `fail` (`src/cli/index.ts:802-805`). | small | recommended |
| C. Advisory parse | `check-task-workflow.sh:14` reports a legacy body or a malformed marker. It still exits 0. | small | optional |
| D. Offline CI | Install the package without the network: a CI image with `repo-harness@<version>` preinstalled, or a package tarball (`bun pm pack`) or a package cache stored as a CI artifact. If a job needs the body as a file, it writes `repo-harness run workflow-contract --repo .` output to a job-only path (for example `$RUNNER_TEMP/workflow-contract.json`). That file is never committed, is not the opt-in marker, and no resolver reads it. | medium | only if Q6 names an offline CI |

**Rejected (review P2-5): a vendored body in the repo.** Revision 1 listed it as option 4C. It conflicts with the resolution rule (§2c rejects every repo body) and with `AGENTS.md:23` ("Do not add … dual authority, semantic fallbacks"). Option D covers the offline need without a second authority.

## 5. Upgrade and migration (Gen-A, Gen-B)

### 5a. Detection by fingerprint
- Hash: `sha256:<hex>` over the file bytes, as in `src/core/upgrade/legacy-inventory.ts:65-67`.
- Table: every body that a release wrote. All `v*` tags give 33 distinct asset bodies (observed; the review counted the same). Examples:
  - Gen-A: `a7940b6dc522…`, 23,218 B, tags v0.7.5–v0.8.2 (observed). The audit matched aiphabee and finmodel (audit).
  - Gen-B: `e74ce53837f3…`, 31,896 B, tags v0.19.1–v0.19.5 (observed). The audit matched arch-context, byok-sdk, hegui-agent, 97app (audit).
  - 0.20.0: `cc0f39d351d9…`, 175,016 B. This repo's own copy equals it (observed, `cmp`).
- Home: a new asset entry in `migrations.upgrade.actions`, for example `id: "legacy-workflow-contract-body"`, `signal: "legacy-workflow-contract-body"`, `action: "reconfigure"`, `ownership: "known_generated"`, `paths: [".ai/harness/workflow-contract.json"]`, `historicalFingerprints: { ".ai/harness/workflow-contract.json": [33 values] }`. The inspect-only actions have no `location` value (observed, `jq`). The implementation must confirm with a test that `legacy-inventory.ts` ignores such an action.
- The table is closed. The last release that writes a body is the last 0.20.x. Generate the list once from git tags and commit it. CI must not need tags. Store the Gen-A and Gen-B bodies as test fixtures, in the style of `tests/fixtures/upgrade-release-blobs/`.

### 5b. One writer and the refusal boundary (review P1-1)
- Writer: adoption only (`standard-plan.ts:757`). It already has fs-transaction backups, rollback, and the apply-time `expectedContentHash` check. No upgrade `refresh` action is added.
- Refusal boundary: `planAdoption` throws a typed error (for example `workflow_contract_refused`). `createPlan` turns it into `invalid_adoption_plan` (`adoption-plan.ts:71-84`). No operation of the plan runs. This works for `init`, `init --dry-run` (`runAdoptionPlan`, `:87-90`), and apply (`runAdoptionApply`, `:123-136`). Revision 1 proposed an operation with `status: "failed"`. That does not work: the executor ignores `status` (`fs-transaction.ts:535-569,601-618`).
- The write operation keeps `expectedContentHash` from `writeOperation` (`standard-plan.ts:162-163`). The file can change between plan and apply; then the preflight stops all operations (`fs-transaction.ts:190-194,572-599`).
- Repair table:

| Step B state | Adoption action | Inspect signal |
|---|---|---|
| `absent` | write marker (`expectedAbsent`) | `missing-runtime-contract-manifest` (as today, `inspect-project-state.ts:136-138`) |
| `marker_valid` | no operation when bytes equal; rewrite when only formatting differs | none |
| `marker_stale` | rewrite marker | `stale-workflow-contract-marker` |
| `marker_pin_older_than_package` (P-exact) | rewrite with the executing version | `workflow-contract-pin-behind` |
| `marker_pin_newer_than_package` (P) | refuse (an older package must not rewrite a newer pin; Q5) | `workflow-contract-pin-ahead` |
| `legacy_known` | rewrite marker, if §5e finds no blocker; otherwise refuse | `legacy-workflow-contract-body` |
| `legacy_unknown` | refuse | `unknown-workflow-contract-body` |
| `marker_malformed`, `marker_invalid` | refuse | `invalid-workflow-contract-marker` |

### 5c. Init lifecycle (review P2-1)
Inspect must exit 0 for every Step B state, because it is a diagnostic. Otherwise `init` exits 1 even after a good repair (`init.ts:930-932`). Inspect exits non-zero only for a Step A failure.

| Case | Inspect | Adoption | `init` exit |
|---|---|---|---|
| Fresh repo | 0, `missing-runtime-contract-manifest` | writes marker | 0 |
| Valid marker | 0 | no contract operation | 0 |
| Package bumps `contractVersion` | 0, `stale-workflow-contract-marker` | rewrites marker | 0 |
| Gen-A or Gen-B body, no blocker | 0, `legacy-workflow-contract-body` | rewrites marker, backup | 0 |
| Known body + kept body reader (§5e) | 0, signal plus blocker list | refuses; no repo writes | 1 |
| Unknown body, malformed or invalid marker | 0, signal | refuses; no repo writes | 1 |
| Package asset or version broken | non-zero | `planAdoption` fails reading the asset | 1 |

Revision 1 said an inspect exception would stop migration. That was wrong: at HEAD, adoption runs after a failed inspect (`init.ts:733-736`).

Tests: fresh `init`; `contractVersion` upgrade; Gen-A and Gen-B fixtures; edited body (bytes stay identical, and unrelated operations such as `tasks/current.md` do not run); malformed marker; blocker present. Each test asserts the `init` exit code and the file bytes.

### 5d. Shell scaffold (review P1-2)
Retire the shell write. Remove `install_workflow_contract` at `scripts/create-project-dirs.sh:42-43` and `scripts/init-project.sh:68-69,306`, and `pi_install_workflow_contract` at `scripts/lib/project-init-lib.sh:690-703`. The scaffold protocol attaches the workflow with `repo-harness init --repo <new-project>` (`scaffold.md:14` already requires the init path). Change the generated policy text at `project-init-lib.sh:1594,1706` (§1d). Update the shell tests in §1e.

Rejected alternative: let the shell call the marker renderer. A renderer gives new bytes but checks no ownership and makes no backup, so it would still overwrite an edited body.

### 5e. Kept body readers gate the cutover (review P2-2)
A repo can hold a clean Gen-A/Gen-B body and an edited helper fork that parses it. The body passes §5a, but a marker would break the fork. Upgrade only reports an edited fork (`legacy-inventory.ts:494-499`), and adoption only warns about it (`standard-plan.ts:587-591`). So "upgrade first" proves nothing.

Code gate in adoption, before the contract operation:
- A closed list of body-reader file names, derived once from release tags. Candidates (observed, `git grep -l workflow-contract.json <tag>`): `check-task-workflow.sh`, `ensure-task-workflow.sh`, `workflow-contract.ts`, `inspect-project-state.ts` and `check-skill-version.ts` (they import `workflow-contract.ts`), `architecture-queue.sh`, `architecture-drift.sh`, and hook `session-start-context.sh`. The implementation marks each one "parses body" or "path only" from release bytes. Only the parsers go on the list.
- Locations: `scripts/`, `.ai/harness/scripts/`, `.ai/hooks/`, `.claude/hooks/`. `.ai/harness/scripts/*` has no upgrade action at all (observed, `jq`), so no command removes it today.
- Rule: if a listed file exists and this same plan does not remove it as owned-clean (`standard-plan.ts:577-611`), adoption refuses the contract cutover and names every file (§5b). The file can be ignored by git; the gate checks the disk.

Manual rollout check, per consumer, before its cutover (code cannot see CI intent):
1. `git grep -n 'workflow-contract.json'` over tracked files, including `.github/workflows/`.
2. The same search over ignored files (`git ls-files -o -i --exclude-standard`).
3. Each hit is routed to a package helper, or the repo owner records a retirement decision.
4. Stop the cutover for that repo while a hit is unresolved. Do not add a runtime body fallback.

Recommended order per repo: `repo-harness upgrade --scope project` (removes owned-clean forks), resolve the remaining readers (gate + manual check), `repo-harness init`, commit the marker.

### 5f. Edited copies and backups
- An edited body is `legacy_unknown`. Adoption refuses it, and the bytes stay identical (§5c test). Revision 1 noted that adoption today overwrites edited bodies with a backup (`standard-plan.ts:150-164`); this plan makes it refuse instead.
- The fix: the body holds no repo data, so there is nothing to merge. Restore a release body or delete the file, then run `init`. If an edit carries real intent, raise it as Q4.
- Backups for a good rewrite: `.ai/harness/backups/fs-transaction/*` (gitignored); rollback `repo-harness init rollback --transaction <manifest>` (form at `src/cli/commands/upgrade.ts:172`). Git history also keeps the tracked body.
- The six sampled repos match release hashes (audit). Edited copies are likely rare (inferred).
- Gen-A: `init` from 0.8.1 also rewrites templates, `workflow-state.sh`, and policy. The contract rewrite cannot run alone. I add no narrow command (Q7).

### 5g. No steady-state fallback
- After the cutover, no reader uses a repo body as a contract. The repo-first branch at `scripts/workflow-contract.ts:293-296` is removed, not kept beside the new path.
- `inspect-project-state` uses only the package body (`:101-108` collapse to one contract). It hashes a legacy body and never reads its fields.
- The fingerprint table and the body-reader list are migration data, not runtime paths. Remove them in a named later release (Q8).

## 6. Doctor detection (review P2-4)

Add one project check, for example `workflow-contract-marker`, after `checkTypedHookRoutes` (`src/cli/commands/doctor.ts:504`). Doctor has `ok`/`warn`/`fail`/`na` (`doctor.ts:104,443,453-461`) and exits 1 on any `fail` (`src/cli/index.ts:802-805`).

Order: (1) git repo and opt-in; (2) Step A, always, for every opted-in repo; (3) Step B. A Step A failure is `fail` even when Step B is a known legacy body, so a broken package never hides behind a `warn`.

| Case | Status | Detail |
|---|---|---|
| Not a git repo / not opted in | `na` | same text as `doctor.ts:452-461` |
| Step A: asset missing | `fail` | `workflow_contract_package_missing`; "reinstall repo-harness" |
| Step A: asset malformed JSON | `fail` | `workflow_contract_package_malformed`; path |
| Step A: asset structure invalid | `fail` | `workflow_contract_package_invalid`; field |
| Step A: `package.json` version missing or invalid | `fail` in Option P; `warn` in Option F | `workflow_contract_package_version_invalid` |
| Step A fails and Step B is `legacy_known` | `fail` | the Step A error, plus "repo also holds a legacy body" |
| `marker_valid` | `ok` | `contractId`, `contractVersion`, package version, runtime root |
| `legacy_known` | `warn` | tag range; "run `repo-harness init`". Hooks and helpers do not read it |
| `legacy_known` + §5e blocker | `fail` | blocker files; "init will refuse" |
| `legacy_unknown` | `fail` | "unknown body; init will refuse; restore a release body or delete it" |
| `marker_malformed` / `marker_invalid` | `fail` | the state and the offending key |
| `marker_stale` | `fail` | both values; "run `repo-harness init`" |
| `marker_pin_newer_than_package` (P) | `fail` | both versions; "run `repo-harness update`" |
| `marker_pin_older_than_package` (P-exact) | `fail` | both versions; "run `repo-harness init`" |

In Option F the two pin rows do not exist: the marker has no package version. Session context may show the same result once per session; that is not in the first PR.

## 7. Risks

1. **Hidden body readers in consumer repos.** CI steps or kept forks that parse the body break. Mitigation: §5e gate plus the manual check; answer Q3 first.
2. **Refusal boundary.** Only a `planAdoption` exception or a preflight error stops writes; operation `status` does not. Mitigation: §5b uses the exception, with a test that proves bytes and unrelated files stay unchanged.
3. **Init exit codes.** Inspect must exit 0 for all repo states, or a good repair still ends with exit 1. Mitigation: §5c table as tests.
4. **Second writer.** If the shell write is not removed, it overwrites edited bodies and writes bodies again. Mitigation: §5d retires it.
5. **Pin checks the wrong runtime.** With `REPO_HARNESS_SOURCE_ROOT`, a check can read the source checkout while a protected helper runs the installed package. Mitigation: Step A takes the executing runtime root (§3).
6. **Broken package hidden by a legacy warning.** Mitigation: doctor runs Step A first (§6).
7. **Weak gate in Option F.** `contractVersion` has never changed. Without a release rule, machines can differ with no signal.
8. **Lockstep in Option P.** P-exact makes every `init` a cross-machine break. Hook enforcement adds hot-path cost.
9. **Test changes.** Two equality tests, the shell scaffold tests, doctor fixtures, and several fixture repos change (§1e). The repo rule requires an item-by-item reason in the PR and one read-only review for tests bent to fit a bug.
10. **Refused repos.** An edited body or a kept reader stops `init` for that repo until a person acts. This is the intended fail-closed result, but it can surprise users.
11. **Fingerprint and reader lists.** A body from an unreleased dev checkout is `legacy_unknown`. A reader fork with a new name escapes the code gate; the manual check covers it.
12. **Docs and rules drift.** `CLAUDE.md:17`, `AGENTS.md:17`, `docs/architecture/domains/workflow-engine.md:21`, the `runtime-contract-refresh` summary, the policy text in §1d, and `.archcontext/model/nodes/capability.workflow-engine.contract-assets.yaml` describe a copy. Update the model, then project the docs.

### Implementation outline (later PR, not this one)
1. Step A, Step B, the marker renderer, and error codes in `scripts/workflow-contract.ts`; sync the projection.
2. Adoption: repair table, refusal exception, §5e gate.
3. Inspect: package body only; Step B signals; exit 0 for repo states.
4. Shell scaffold: retire the write; scaffold doc runs `repo-harness init`; policy text.
5. Asset: fingerprint table entry; fixtures for Gen-A and Gen-B.
6. Doctor check. `repo-harness run workflow-contract --repo . [--check]`.
7. Option P only: version check on the executing runtime in `repo-harness run`.
8. Rewrite this repo's own `.ai/harness/workflow-contract.json` to a marker; update rules, docs, and the tests in §1e.
9. Verify: `bun run check:type`; `bun run test:files tests/workflow-contract.test.ts tests/unit/helper-projection-drift.test.ts tests/cli/adoption-plan.test.ts tests/cli/init.test.ts tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts tests/cli/doctor.test.ts tests/hook-runtime.test.ts tests/cli/status.test.ts --timeout 60000 --max-concurrency 1`; add `tests/cli/run.test.ts` with older/equal/newer cases and distinct source and installed versions if Option P is chosen.
10. Rollback: `git revert <squash-commit>`. Consumer repos restore from the fs-transaction backup or from git.

## 8. Open questions for Aimpact

1. **Q2 — pin or float?** Do you want a new version pin in the marker? The code shows the repo copy does not pin behavior today (§3). If yes: P-floor or P-exact? Must hooks enforce it, or only `repo-harness run`, inspect, and doctor?
2. **Q3 — consumer CI and release rule.** Do consumer workflows read the repo body or run legacy forks (§5e manual check)? And may releases bump the body `version` when repos must run `init` again? Option F depends on that rule.
3. **Q4 — overrides.** Is there a real repo-specific value that a repo must override? If not, protocol 1 has no `overrides` field.
4. **Q5 — pin direction (Option P).** May an older machine lower `packageVersion`? This plan refuses that by default.
5. **Q6 — offline CI.** Is there a CI that cannot reach npm? Only that case needs option 4D.
6. **Q7 — narrow migration.** Is a full `init` acceptable for Gen-A repos, or do you want a contract-only step?
7. **Q8 — retirement.** In which release may the fingerprint table, the reader list, and the legacy signals go away?
8. **Q9 — kept forks.** For each consumer with kept reader forks (`scripts/*`, `.ai/harness/scripts/*`): retire them, or route them to package helpers? The cutover waits for this answer.

## 9. Review disposition (Codex, `/tmp/contract-marker-plan-codex-review.md`)

| Finding | Verified against | Disposition |
|---|---|---|
| P1-1 planned `failed` status does not stop adoption | `fs-transaction.ts:535-569,571-620`; `adoption-plan.ts:71-84,123-163` | accepted; §5b uses a `planAdoption` exception, keeps `expectedContentHash`, and adds a byte-identical test |
| P1-2 shell writer bypasses protection | `project-init-lib.sh:690-703`; `create-project-dirs.sh:42-43`; `init-project.sh:68-69,306`; `scaffold.md:13-14` | accepted; §5d retires the shell write |
| P2-1 resolver lifecycle incomplete | `inspect-project-state.ts:101-138`; `init.ts:725-736,930-932` | accepted; §2c splits Step A/B, §5b repair table, §5c init lifecycle; the revision 1 claim about inspect stopping migration is corrected |
| P2-2 upgrade-first is not enough | `legacy-inventory.ts:494-499`; `standard-plan.ts:587-591`; no action covers `.ai/harness/scripts/*` (observed) | accepted; §5e code gate plus manual rollout check; Q9 |
| P2-3 pin must check the executing package | `helper-runner.ts:20,276-294,362-365` | accepted; §3 and Step A take the executing runtime root; `tests/cli/run.test.ts` added to the conditional scope |
| P2-4 doctor misses broken package on legacy repos | `scripts/workflow-contract.ts:243-286`; `src/cli/index.ts:802-805` | accepted; §6 runs Step A first and lists the full matrix, including P-exact newer and invalid version metadata |
| P2-5 vendored body conflicts with the authority rule | `AGENTS.md:23` | accepted; vendoring rejected; §4D offline install and job-only export; diagnostic vs blocking check separated |
| P3-1 helper descriptions range | `helper-runner.ts:219-269` | fixed in §1b |
| P3-1 `check-skill-version.ts` is an indirect probe | `check-skill-version.ts:60-63,113-116` | fixed in §1b |
| P3-1 `hrd-09` filename | `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts:113` | fixed in §1e |
| P3-1 "about 10 more" tests | grep at HEAD | fixed: §1e lists the files, and separates historical fixtures |
| P3-1 doctor `{}` fixture | `tests/cli/doctor.test.ts:52-67` | fixed in §1e |
| P3-1 adoption expected JSON | the three files; no consumer (observed, grep) | fixed: §1e says no change and records the op id mismatch |
| P3-1 shell policy references | `project-init-lib.sh:1594,1706` | fixed in §1d and §5d |
| P3-1 setup skill invocation claim | `scaffold.md:13` runs `init-project.sh`; `manifest.json:422` lists `create-project-dirs` as internal | fixed in §1c |
