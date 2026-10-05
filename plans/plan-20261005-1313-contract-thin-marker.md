# Plan: workflow-contract.json as a thin per-repo marker

> **Status**: Draft
> **Created**: 20261005-1313
> **Slug**: contract-thin-marker
> **Artifact Level**: work-package
> **Promotion Reason**: shared_contract (hooks, doctor, status, adoption, inspection, and tests read this path)
> **Verification Boundary**: Plan only. No code changed. Every file:line below was read at HEAD 4cb2aaf8 (package 0.20.0).
> **Rollback Surface**: Delete this file. The future implementation PR reverts with `git revert <squash-commit>`.
> **Spec**: `docs/spec.md`
> **Research**: `/tmp/global-install-audit.md` §1, §2b, §3 C1, §5 Q2/Q3
> **Task Contract**: (none; plan only)
> **Task Review**: (none; plan only)
> **Implementation Notes**: (none; plan only)

Evidence labels: **(observed)** = I ran a command in this worktree. **(code)** = I read the source at HEAD. **(inferred)** = reasoned, not run. **(audit)** = taken from the audit and not re-run by me.

## 0. Due diligence

### P1 map
- The repo path `.ai/harness/workflow-contract.json` has two roles. It is the opt-in marker for hooks, status, doctor, and session context. It is also a byte copy of the package asset `assets/workflow-contract.v1.json`.
- The package asset is the authority. The adoption writer copies it into each repo (`src/core/adoption/standard-plan.ts:757`, `src/core/adoption/workflow-contract-asset.ts:4-8`).
- The asset is 175,016 B. `migrations` is 125,776 B of that (observed, `jq`). The asset holds no repo data.

### P2 trace (one real path)
`repo-harness init` → `init.ts:725-731` runs `scripts/inspect-project-state.ts --repo <repo>` → `inspectRepo` reads the **repo** copy first through `resolveWorkflowContractForRepo` (`scripts/workflow-contract.ts:293-296`, used at `scripts/inspect-project-state.ts:101`) → `init.ts:733-736` runs adoption apply → `standard-plan.ts:757` replaces the repo copy with the package asset bytes. After that, the hook runtime only checks that the file exists (`src/cli/hook/runtime.ts:190-192,361`).

### P3 decision
- Why the copy exists: older repo-local helpers parsed the repo copy. At v0.8.1 and v0.19.5, `assets/templates/helpers/check-task-workflow.sh` has 9 and 11 parse sites (observed, `git show <tag>:… | grep -c`). The v0.10.0 blob calls `contract_query_lines` on `.ai/harness/workflow-contract.json` (`tests/fixtures/upgrade-release-blobs/05ed2543…:60-75`, provenance `tests/fixtures/upgrade-v0.10-project/provenance.json:316-319`).
- That reason is gone. Helpers now run only from the package (`src/effects/runtime/helper-runner.ts:15-18`, asset `helpers.runtimeSource: "package"` at `assets/workflow-contract.v1.json:238-239`). The current `check-task-workflow.sh` only parses the JSON and always exits 0 (`scripts/check-task-workflow.sh:10-25`).
- Core invariant to keep: a file at `.ai/harness/workflow-contract.json` opts the repo in, and the package asset is the one source of truth for the contract body.
- Smallest coherent change: the repo file becomes a small marker. Every body reader reads the package asset. One resolver validates the marker. No reader accepts a repo body as a contract.

### Corrections to the audit
1. The audit says runtime resolution "already prefers an installed copy" (`scripts/workflow-contract.ts:289-296`). In that code, "installed" means the **repo** copy. It is repo-first, package-second. A marker in that path breaks `loadWorkflowContract` validation (`:199-241`). This resolver must change.
2. The audit lists one alignment test. There are two: `tests/workflow-contract.test.ts:57-61` (byte equality) and `tests/unit/helper-projection-drift.test.ts:20-25` (deep equality).
3. `doctor.ts:455-461` is not a contract check. It only marks `typed-hook-routes` as `na` when the repo is not opted in.
4. The body `version` and `contractId` never changed. Every tag from v0.1.2 to v0.20.0 has `1.0.0` / `tasks-first-harness-v1` (observed). These fields cannot act as a version pin today.
5. The growth from 32 KB to 175 KB came from one commit: `0573275f feat(upgrade): clean and refresh verified owned leftovers (#511)`, 31,828 → 175,019 B (observed). It added historical fingerprints.

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
| Inspect projection | `assets/templates/helpers/inspect-project-state.ts:101-102`, `assets/templates/helpers/workflow-contract.ts:289-296` | same as above | same; it is a generated projection of `scripts/` |
| Init inspect step | `src/cli/commands/init.ts:725-731` | runs the inspect script | breaks through inspect |
| Task workflow check | `scripts/check-task-workflow.sh:14` (projection `assets/templates/helpers/check-task-workflow.sh:14`) | JSON object parse, advisory, exit 0 | none (a marker is a JSON object) |
| Architecture queue | `scripts/architecture-queue.sh:296-297` | path name only | none |
| Legacy repo-local helper forks in consumer repos | e.g. v0.19.5 `check-task-workflow.sh` (11 parse sites), `ensure-task-workflow.sh` (2) (observed in tags) | full body | **breaks** if a repo still runs a fork |

### 1b. Readers of the package asset `assets/workflow-contract.v1.json`

| Reader | file:line | Fields |
|---|---|---|
| Asset loader | `src/core/adoption/workflow-contract-asset.ts:4-12` | whole file |
| Adoption templates | `src/core/adoption/manifest-templates.ts:39-60` | `adoptionTemplates`, `documents` |
| Upgrade planner | `src/core/upgrade/legacy-inventory.ts:109-111,293-295` | `migrations.upgrade.actions`, `installedCopyExcludes` |
| Helper runner | `src/effects/runtime/helper-runner.ts:18,161-217,276-294` | `helpers.scripts`, `helpers.descriptions` |
| Workflow contract helper | `scripts/workflow-contract.ts:138,243-287,310-313` | whole file; `REPO_HARNESS_SOURCE_ROOT` override at `:244-253` |
| Skill version check | `scripts/check-skill-version.ts:15` | `resolveAgenticDevRoot` |
| Helper projection sync | `scripts/sync-helper-sources.ts:23,110` | `helpers.scripts` |
| Installed-copy sync | `scripts/sync-codex-installed-copies.sh:94` | `installedCopyExcludes` |
| Source checkout probe | `src/core/adoption/source-checkout.ts:4-10` | existence |
| Legacy shell scaffold | `scripts/create-project-dirs.sh:22,38,43,50`, `scripts/init-project.sh:29,69,76,304` | `helpers.scripts`, `artifacts.requiredDirectories` |

### 1c. Writers of the repo path

| Writer | file:line | Behavior |
|---|---|---|
| Adoption apply (`init`) | `src/core/adoption/standard-plan.ts:757` with `writeOperation` `:150-164` | replace with asset bytes; status `planned` when bytes differ; fs-transaction backup (`tests/cli/adoption-plan.test.ts:403-418`) |
| Legacy shell scaffold | `scripts/lib/project-init-lib.sh:690-703` (`cp`), called from `scripts/create-project-dirs.sh:43`, `scripts/init-project.sh:69` | plain copy, no backup. `create-project-dirs` is a non-public internal step (`tests/action-command-skills.test.ts:82-86`) used by `assets/skills/repo-harness-setup` |

### 1d. Contract data that names the path
- `artifacts.runtimeManifest` (`assets/workflow-contract.v1.json:242`) and `artifacts.requiredFiles` (`:299`). Both stay valid: the path still exists.
- Upgrade action `runtime-contract-refresh` (`:533-545`). Its summary says "Install the current runtime workflow contract". The wording must change.
- Self-host policy text `.ai/harness/policy.json:196,353`. No code reads `upgrade.cleanup.source` or `assets.sources` (observed, grep returns nothing). The current policy generator does not write these keys (`standard-plan.ts:400-404`).

### 1e. Tests that touch the path

| Group | Files | Change needed |
|---|---|---|
| Byte/deep equality of repo copy and asset | `tests/workflow-contract.test.ts:57-61`, `tests/unit/helper-projection-drift.test.ts:20-25` | yes: assert a valid marker that names the asset `contractId`/`version` |
| Fixture repos that copy the body | `tests/contract-worktree-squash-cleanup.test.ts:53`, `tests/architecture-projection-continuation.test.ts:79`, `tests/helpers/helper-script-fixture.ts:75` | yes: write a marker |
| Reads body fields from a scaffolded repo | `tests/create-project-dirs.runtime.test.ts:122,231-236` | yes: assert the body through the resolver, the marker on disk |
| Inspect with a stale repo body | `tests/workflow-contract.test.ts:436-458` | yes: becomes the "legacy body detected" case |
| Adoption plan fixtures | `tests/fixtures/adoption/{self-host-repo,minimal-repo,empty-repo}.expected.json` (op id `writeFile:.ai/harness/workflow-contract.json:workflow-contract`) | content changes; op id can stay |
| Adoption apply | `tests/cli/adoption-plan.test.ts:104,170,403-418,561`, `tests/cli/init.test.ts:103,293,460,1307,1330` | review; most only check existence |
| Opt-in only (`'{}'` marker) | `tests/hook-runtime.test.ts:15`, `tests/cli/hook.test.ts:15`, `tests/cli/status.test.ts:207-235`, `tests/cli/doctor.test.ts:62`, `tests/session-context.test.ts:866,899,928`, and about 10 more | none: existence semantics stay |
| Asset content | `tests/workflow-contract.test.ts:43,95,144,214-361`, `tests/bootstrap-files.test.ts:240,337,390`, `tests/install-profiles.test.ts:131`, `tests/migration-script.test.ts:11`, `tests/unit/hrd-09-…:113`, `tests/cli/run.test.ts:22-238` | none: the asset stays a full body |

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

No `overrides` field in protocol 1. Reason: the body holds no repo data, and no reader needs a repo override (P1). The rule says to add an extension point only for a real consumer. If Aimpact names a real override, it becomes protocol 2 (Q4).

Readers reject unknown keys. This keeps the marker from turning into a second, partial body.

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

### 2c. Resolution

One function in `scripts/workflow-contract.ts`, for example `resolveRepoWorkflowContract(repoRoot)`. It replaces `resolveInstalledWorkflowContract` and `resolveWorkflowContractForRepo` (`:289-296`). `src/` imports it directly; `src/` already imports from `scripts/` (`src/cli/hook/session-context.ts:46`, `src/effects/state/resolve-effective-state.ts:5`). The helper projection carries it to `assets/templates/helpers/` through `scripts/sync-helper-sources.ts`.

Steps:
1. Read `.ai/harness/workflow-contract.json`. If it is absent, return "not opted in". Callers keep their current handling (inspect emits `missing-runtime-contract-manifest`, `inspect-project-state.ts:136-138`).
2. Parse JSON. Malformed JSON → error `workflow_contract_marker_malformed`.
3. If the object has no `kind` and has `contractId` + `helpers`, it is a legacy body → error `workflow_contract_legacy_body`. The error names the matched release from the fingerprint table (§5), or says "unknown body".
4. Validate the marker fields and reject unknown keys → error `workflow_contract_marker_invalid`.
5. Load the package body with the existing `resolveUpstreamWorkflowContract()` + `loadWorkflowContract()` (`:264-287`). This keeps the `REPO_HARNESS_SOURCE_ROOT` rule (`:244-253`).
6. Compare `contractId` and `contractVersion` with the body → error `workflow_contract_mismatch`.
7. Option P only: compare `packageVersion` with the resolved package `package.json` version, with `Bun.semver` (already used at `src/effects/runtime/helper-runner.ts:61`) → error `workflow_contract_package_too_old` (and, for exact pin, `…_package_differs`).
8. Return the package body.

The marker renderer lives beside it, for example `renderWorkflowContractMarker()`. It takes `contractId`/`version` from the asset and, in Option P, the version from the package `package.json`. Adoption and the shell scaffold both use it. The marker is a deterministic projection, so it is not a second source of truth.

### 2d. What fails closed

| Condition | Who fails | Who does not fail |
|---|---|---|
| Malformed marker, unknown key, wrong `kind`/`protocol` | resolver callers (inspect, doctor) | hooks, status (existence only) |
| Legacy full body (known or unknown) | resolver callers report it; adoption refuses unknown bodies (§5) | hooks, status |
| `contractId`/`contractVersion` differ from the package body | resolver callers | hooks, status |
| Package asset missing | every package reader, as today (`scripts/workflow-contract.ts:256-261`, `helper-runner.ts:161-167`) | — |
| Option P: package version outside the pin | resolver callers; hook runtime only if Aimpact chooses that (§3) | — |

The opt-in check stays "file exists" (`runtime.ts:190-192`). This is not a fallback: it is the one existing rule for opt-in, and hooks never read the body. Hooks must not start to parse the file unless Option P needs it (§3).

## 3. Version pin vs floating

Fact first: in 0.20.0 the repo copy is **not** a working pin. Hooks, status, doctor, and session context check only existence (§1a). Helpers, adoption templates, the upgrade planner, and the sync script read the package asset (§1b). Only `inspect-project-state` reads the repo body, and it already prefers the package upgrade actions (`scripts/inspect-project-state.ts:103`). Today each machine already behaves like its own installed package (code). So Q2 asks whether Aimpact **wants** a new pin, not whether to keep one.

### Option F — floating

- Semantics: the marker says "this repo uses contract `tasks-first-harness-v1` v`1.0.0`". The installed package defines all behavior.
- Installed package older or newer than the repo's last init: no failure while `contractId`/`contractVersion` match. If a future package changes `contractVersion`, resolver callers fail closed until someone runs `repo-harness init`.
- Max vs Mac mini: each machine uses its own package, the same as today. Doctor cannot report skew, because the marker records no package version.
- Pros: matches observed 0.20.0 behavior; smallest change; no parse on the hook hot path; `init` on one machine makes no marker diff for the other machine.
- Cons: two machines can run different contract bodies with no report. `contractVersion` is a weak gate, because it has been `1.0.0` since v0.1.2. It works only if releases start to bump it on breaking repo-facing changes (Q3).

### Option P — pin

Two variants. Both add `packageVersion`.

| | P-exact | P-floor |
|---|---|---|
| Rule | installed version must equal `packageVersion` | installed version must be `>= packageVersion` |
| Installed older | fail closed | fail closed |
| Installed newer | fail closed | allowed |
| Who writes the pin | every `init` writes the current CLI version | `init` writes the current CLI version; Q5 asks whether it may lower or must keep a higher value |
| Max vs Mac mini | the machine with the other version fails until `repo-harness update`; an `init` on one machine moves the pin and breaks the other after pull | the older machine fails after the newer machine runs `init` and commits; the newer machine never fails |

- Enforcement points must be named. If only inspect and doctor enforce the pin, it guards almost nothing, because hooks and helpers do not read the repo file. To give the pin effect, the hook runtime (`runtime.ts:361`) and `repo-harness run` (`helper-runner.ts:276-294`) must also read and check the marker. That adds a file read, a JSON parse, and a semver check to every hook call. It also lets version skew stop hooks on one machine.
- Pros: one recorded version per repo; skew is visible and blocks before behavior differs; CI can run `bunx repo-harness@<packageVersion>`.
- Cons: lockstep upgrades across machines and collaborators; every `init` can make a marker diff; hot-path cost if hooks enforce it; with `REPO_HARNESS_SOURCE_ROOT` the dev checkout `package.json` version decides, which may not match its code.

### Recommendation

Option F now. Reasons: it matches the observed 0.20.0 behavior, it adds no hot-path work, and it does not create cross-machine lockstep. Add one release rule with it: bump the body `version` when a change needs repos to run `init` again.

If Aimpact wants a pin (Q2), choose P-floor, enforced in the resolver, doctor, and `repo-harness run`. Keep hooks on existence only, and let doctor and session context report skew. This gives a visible guard and does not let skew stop hooks.

The marker schema supports both: `packageVersion` is the only difference. This plan does not pick silently. Aimpact decides in Q2.

## 4. CI and collaborators without the global install

### What still works
- Git tracks the marker. The opt-in rule still holds.
- The current `check-task-workflow.sh` parses JSON and exits 0 (`scripts/check-task-workflow.sh:10-25`). A marker passes.
- Hooks do not run in CI. They need the host adapters in `~/.claude` / `~/.codex`.
- The `.gitignore` managed block does not change.
- `package.json` scripts already call `repo-harness run …` (`standard-plan.ts:671-687`). They already need the CLI. The marker adds no new need.

### What breaks
1. Any consumer CI step that reads body fields (for example `jq .helpers.scripts .ai/harness/workflow-contract.json`). I did not check consumer CI (audit Q3, still open).
2. Any legacy repo-local helper fork that parses the body (§1a last row). The audit reports forks in hegui-agent (28), 97app (5), aiphabee (40, gitignored) (audit). The upgrade action `legacy-root-helper-runtime` already lists `scripts/check-task-workflow.sh`, `scripts/inspect-project-state.ts`, and `scripts/workflow-contract.ts` (observed, `jq`). It removes only owned-clean forks. Edited forks stay and break.
3. A collaborator who reads the repo file to learn the contract sees only the marker.

### Options

| Option | How | Cost | Recommendation |
|---|---|---|---|
| A. `bunx repo-harness` | `bunx repo-harness@<version> run workflow-contract --repo .` prints the resolved body. npm has `repo-harness` 0.20.0 (observed, `npm view repo-harness version`). Today the helper prints the package body only (`scripts/workflow-contract.ts:310-313`), so it needs a `--repo` form that goes through the resolver. | small; needs network in CI | yes, document it |
| B. CI parse check without the CLI | Teach `check-task-workflow.sh:14` to report a legacy body or a malformed marker. It stays advisory and exits 0. | small | yes |
| C. Vendored body opt-in | The repo keeps a full body on purpose, with a drift check against the package. | brings back two authorities and the drift this plan removes | no, unless Aimpact names a CI that cannot reach npm (Q6) |
| D. `repo-harness doctor --json` in CI via `bunx` | runs the §6 check in CI | small | optional |

## 5. Upgrade and migration (Gen-A, Gen-B)

### 5a. Detection by fingerprint
- Hash: `sha256:<hex>` over the file bytes, the same format as `src/core/upgrade/legacy-inventory.ts:65-67`.
- Table: every body that a release wrote. Across all `v*` tags there are 33 distinct asset bodies (observed). Examples:
  - Gen-A: `a7940b6d…`, 23,218 B, tags v0.7.5–v0.8.2 (observed). The audit matched aiphabee and finmodel to it (audit).
  - Gen-B: `e74ce538…`, 31,896 B, tags v0.19.1–v0.19.5 (observed). The audit matched arch-context, byok-sdk, hegui-agent, 97app (audit).
  - 0.20.0: `cc0f39d3…`, 175,016 B (observed). This repo's own copy is byte-identical to it (observed, `cmp`).
- Home of the table: a new entry in the asset `migrations.upgrade.actions`, for example `id: "legacy-workflow-contract-body"`, `signal: "legacy-workflow-contract-body"`, `action: "reconfigure"`, `ownership: "known_generated"`, `paths: [".ai/harness/workflow-contract.json"]`, `historicalFingerprints: { ".ai/harness/workflow-contract.json": [33 values] }`. This keeps the data in the same place as other historical fingerprints. The implementation must confirm that `legacy-inventory.ts` ignores an action without `location` (the existing inspect-only actions have no `location` value, observed with `jq`).
- The table is closed. The last release that writes a body is the last 0.20.x. Later releases add no values. Generate the list once from git tags at authoring time, and commit it. CI must not need tags. Store the Gen-A and Gen-B bodies as test fixtures, in the same way as `tests/fixtures/upgrade-release-blobs/`.

### 5b. One-shot rewrite
- Writer: adoption only (`standard-plan.ts:757`). `init` already writes this path and already has fs-transaction backups and rollback. I do not add an upgrade `refresh` action. That would need a static marker file in the package and a second writer.
- Rule for the adoption operation:
  - file absent → write the marker;
  - file is a valid marker → replace only when the rendered bytes differ;
  - file bytes are in the fingerprint table → replace with the marker;
  - anything else → plan the operation as `failed` (`src/core/adoption/operations.ts:4`), with a message that names the path and the fix. Apply must stop. The implementation must confirm how a `failed` planned operation stops `applyAdoptionPlan`.
- Backups: the fs-transaction backup under `.ai/harness/backups/fs-transaction/*` (gitignored), rollback with `repo-harness init rollback --transaction <manifest>` (same form as `src/cli/commands/upgrade.ts:172`). Git history also keeps the tracked body.
- Recommended order per consumer repo: `repo-harness upgrade --scope project` first (it removes owned-clean helper forks that parse the body), then `repo-harness init`, then commit the marker.
- Gen-A repos: `init` from 0.8.1 also rewrites templates, `workflow-state.sh`, and policy. The contract rewrite cannot run alone. I add no narrow command (Q7).

### 5c. Edited copies
- An edited body has no fingerprint match. Adoption refuses it (above). Inspect and doctor report it.
- Today adoption overwrites an edited body with a backup (`standard-plan.ts:150-164`). This plan makes that stricter.
- The fix for the user: the body holds no repo data, so there is nothing to merge. Restore a release body or delete the file, then run `init`. If an edit carries real intent, that is a Q4 override request.
- The six sampled repos all match release hashes (audit). So edited copies are likely rare (inferred).

### 5d. No steady-state fallback
- After the cutover, no reader uses a repo body as a contract. The repo-first branch in `scripts/workflow-contract.ts:293-296` is removed, not kept beside the new path.
- `inspect-project-state` collapses `contract` and `latestContract` into the one package body (`:101-108`). It emits the signal `legacy-workflow-contract-body` for a legacy body and does not throw. `init.ts:725-731` runs inspect before adoption, so inspect must report, not fail. It does not read fields from the legacy body.
- The fingerprint table is migration data, not a runtime path. Remove it in a named later release (Q8).

## 6. Doctor detection

Add one project check, for example `workflow-contract-marker`, after `checkTypedHookRoutes` (`src/cli/commands/doctor.ts:504`). It calls the §2c resolver. Doctor has `ok`/`warn`/`fail`/`na` today (`doctor.ts:440-462`).

| Case | Detection | Status | Detail |
|---|---|---|---|
| Not a git repo / not opted in | `resolveRepoRoot`, `isOptIn` | `na` | same text as `doctor.ts:452-461` |
| Valid marker, body resolves | resolver returns | `ok` | `contractId`, `contractVersion`, package version |
| Full-body legacy copy, known | no `kind`; hash in table | `warn` | "legacy body from <tag range>; run `repo-harness init`". `warn`, because hooks and helpers do not read it |
| Unknown or edited body | no `kind`; hash not in table | `fail` | "unknown body; adoption will refuse it; restore a release body or delete it" |
| Malformed marker / unknown key / wrong protocol | resolver step 2 or 4 | `fail` | the error code |
| Marker contract differs from the package body | resolver step 6 | `fail` | both values; "run `repo-harness update` or `init`" |
| Marker newer than installed package | Option P only, resolver step 7 | `fail` | both versions; "run `repo-harness update`". In Option F this case cannot be seen: the marker has no package version |
| Body missing in the package | `resolveAgenticDevRoot` throws (`scripts/workflow-contract.ts:256-261`) | `fail` | "package is incomplete; reinstall". Same failure as other package readers |

Session context may show the same `warn`/`fail` once per session. That is optional and not in the first PR.

## 7. Risks

1. **Hidden body readers in consumer repos.** CI steps or kept helper forks that parse the body break. Evidence: v0.19.5 `check-task-workflow.sh` has 11 parse sites. Mitigation: run `upgrade --scope project` first; answer Q3 before cutover.
2. **Init on a legacy repo.** Inspect runs before adoption (`init.ts:725-731`). If inspect throws on a legacy body, `init` cannot migrate. Mitigation: inspect reports (§5d); a test with the Gen-A and Gen-B fixtures.
3. **Two writers.** The shell scaffold (`scripts/lib/project-init-lib.sh:690-703`) copies the body. If it is not changed, it creates legacy bodies again. Mitigation: it calls the same renderer, or the setup skill stops using it; a test in `tests/create-project-dirs.runtime.test.ts`.
4. **Weak gate in Option F.** `contractVersion` has never changed. Without a release rule, two machines can differ with no signal.
5. **Lockstep in Option P.** P-exact makes every `init` a cross-machine break. Hook enforcement adds hot-path cost.
6. **Dev checkout version.** With `REPO_HARNESS_SOURCE_ROOT`, the checkout `package.json` decides the version check (Option P). It can lag behind its code.
7. **Test changes.** Two equality tests and several fixtures change (§1e). The repo rule requires an item-by-item reason in the PR and one read-only review for tests bent to fit a bug.
8. **Edited copies block init.** A refused body stops adoption for that repo until a person acts. That is the intended fail-closed result, but it can surprise users.
9. **Fingerprint table size and accuracy.** 33 values are small. A body written by an unreleased dev checkout is "unknown" and gets refused.
10. **Docs and rules drift.** `CLAUDE.md:17`, `AGENTS.md:17`, `docs/architecture/domains/workflow-engine.md:21`, the `runtime-contract-refresh` summary, and `.archcontext/model/nodes/capability.workflow-engine.contract-assets.yaml` describe a copy. Update the model, then project the docs.

### Implementation outline (for the later PR, not this one)
1. Resolver, renderer, and error codes in `scripts/workflow-contract.ts`; sync the projection.
2. Adoption writer rule (§5b) and shell scaffold change.
3. Inspect collapse and the legacy signal.
4. Fingerprint table entry in the asset plus Gen-A/Gen-B fixtures.
5. Doctor check.
6. Rewrite this repo's own `.ai/harness/workflow-contract.json` to a marker; update the rules, docs, and tests in §1e.
7. Verify: `bun run check:type`; `bun run test:files tests/workflow-contract.test.ts tests/unit/helper-projection-drift.test.ts tests/cli/adoption-plan.test.ts tests/cli/init.test.ts tests/create-project-dirs.runtime.test.ts tests/cli/doctor.test.ts tests/hook-runtime.test.ts tests/cli/status.test.ts --timeout 60000 --max-concurrency 1`.
8. Rollback: `git revert <squash-commit>`. Consumer repos restore from the fs-transaction backup or from git.

## 8. Open questions for Aimpact

1. **Q2 — pin or float?** Do you want a new version pin in the marker? The code shows the repo copy does not pin behavior today (§3). If yes, P-floor or P-exact? Must hooks enforce it, or only doctor and `repo-harness run`?
2. **Q3 — consumer CI.** Do any consumer workflows read `.ai/harness/workflow-contract.json` fields or run legacy helper forks? This decides whether option 4C is needed.
3. **Release rule.** May releases bump the body `version` when repos must run `init` again? Option F depends on it.
4. **Overrides.** Is there any real repo-specific value that a repo must override in the contract? If not, protocol 1 has no `overrides` field.
5. **Floor direction (Option P).** May `init` lower `packageVersion` when it runs from an older machine, or must it keep the higher value?
6. **Offline CI.** Is there a CI that cannot reach npm? Only that case would justify a vendored body.
7. **Narrow migration.** Is a full `init` acceptable for Gen-A repos, or do you want a contract-only migration step?
8. **Table retirement.** In which release may the legacy fingerprint table and the `legacy-workflow-contract-body` signal go away?
9. **Shell scaffold.** Should `create-project-dirs` / `init-project.sh` call the shared renderer, or retire as a writer of this path?
