# Plan: workflow-contract.json as a thin per-repo marker

> **Status**: Draft (revision 4)
> **Created**: 20261005-1313
> **Revised**: revision 2 (20261005-1332) and revision 3 (20261005-1344) after the Codex reviews in `/tmp/contract-marker-plan-codex-review.md`; revision 4 (20261005-1545) after the Aimpact decision: Option F, remove as much legacy as possible, add no complexity
> **Slug**: contract-thin-marker
> **Artifact Level**: work-package
> **Promotion Reason**: shared_contract (adoption, inspection, scaffold, docs, and tests touch this path)
> **Verification Boundary**: Plan only. No code changed. File:line references were read at HEAD 4cb2aaf8 (package 0.20.0). Main is now ac21fbdd (#531, #532); some lines moved (for example the adoption writer is `standard-plan.ts:752` on main). The implementation re-reads every line on main.
> **Rollback Surface**: Revert the plan commits. The implementation PR reverts with `git revert <squash-commit>`.
> **Spec**: `docs/spec.md`
> **Research**: `/tmp/global-install-audit.md` §1, §2b, §3 C1; `/tmp/contract-pin-investigation.md` (pin history)
> **Task Contract**: (none; plan only)
> **Task Review**: (none; plan only)
> **Implementation Notes**: (none; plan only)

Evidence labels: **(observed)** = I ran a command. **(code)** = I read the source. **(inferred)** = reasoned, not run.

## 0. Decision record

| Question | Decision | Source |
|---|---|---|
| Q2 pin or float | **Option F (float).** The repo file records no version. The installed package defines all behavior. | Aimpact, revision 4. History: the copy was a repo-local-first leftover, not a pin (`/tmp/contract-pin-investigation.md` §1, high confidence) |
| Q3 release rule | Not needed. No reader compares marker fields. | follows from Q2 + §2 |
| Q4 overrides | None. The body holds no repo data. | code |
| Q5 pin direction | Not applicable. | follows from Q2 |
| Q6 offline CI | Not needed. No consumer CI reads the file (probe of 6 repos, investigation §2c). | observed |
| Q7 narrow migration | None. The next `repo-harness init` rewrites the file. | Aimpact: no added complexity |
| Q8 retirement | Nothing to retire. The plan adds no migration data. | §3 |
| Q9 kept forks | No code gate. Cleanup is a follow-up that waits for Aimpact approval (§5). | Aimpact: no added complexity |

## 1. Due diligence

### P1 map
- `.ai/harness/workflow-contract.json` has two roles today. It is the opt-in marker for hooks, status, doctor, and session context (existence only: `src/cli/hook/runtime.ts:24,190-192,361`, `src/cli/commands/status.ts:49`, `src/cli/hook/session-context.ts:1280`). It is also a byte copy of `assets/workflow-contract.v1.json` (code).
- Writers: adoption `src/core/adoption/standard-plan.ts:757` (always replace, with fs-transaction backup); shell scaffold `scripts/lib/project-init-lib.sh:690-703` (`cp`, no backup).
- The only body reader of the repo copy is inspect: `scripts/inspect-project-state.ts:101` through the repo-first resolver `scripts/workflow-contract.ts:289-296` (code; grep shows no other caller in `src`, `scripts`, `assets`, `tests`). Its projection is `assets/templates/helpers/`.
- Helpers, adoption templates, the upgrade planner, and doctor read the package asset (code).

### P2 trace
`repo-harness init` → `init.ts:725-731` runs inspect → `inspectRepo` loads the repo copy (`inspect-project-state.ts:101`) and the package body (`:102`), and prefers the package upgrade actions (`:103`) → adoption → `standard-plan.ts:757` replaces the repo copy with the asset bytes, with a backup for any existing content (`tests/cli/adoption-plan.test.ts:403-418`).

### P3 decision
- Why the copy exists: 3.2.0 (`34d194d0`) set `compatibility.repoLocalFirst: true`. Repo-local helpers read the copy. v0.5.0 (`13052d45`) set it `false` and moved helpers to the package. The last package helper that parsed the copy stopped in v0.20.0 (`d26f1a5f`, #483). No reader needs the body in the repo now (investigation §2a-b).
- Core invariant: a file at `.ai/harness/workflow-contract.json` opts the repo in. The package asset is the one contract body.
- Smallest change: keep every current mechanism. Adoption keeps its always-replace write, but writes a constant marker instead of the body. Inspect reads the package body only. The second writer (shell scaffold) goes away.

## 2. Marker

```json
{
  "kind": "repo-harness.workflow-contract-marker",
  "protocol": 1
}
```

- Two constant fields. `kind` lets a person or tool tell the marker from a legacy body. `protocol` follows the repo's protocol-v1 convention.
- No `contractId`, `contractVersion`, or `packageVersion`. No reader would use them (Q2, Q3).
- No reader validates the marker. Opt-in stays "file exists". `scripts/check-task-workflow.sh:14` parses it as a JSON object and exits 0; the marker passes.
- One renderer, `renderWorkflowContractMarker()` in `src/core/adoption/workflow-contract-asset.ts`, returns the bytes. Adoption and the alignment test use it.

## 3. Changes

1. **Adoption.** `standard-plan.ts:757` writes `renderWorkflowContractMarker()` instead of `readWorkflowContractAsset()`. `writeOperation` stays as it is: it replaces any different content (legacy body, edited body, `{}`, malformed bytes) and the fs-transaction keeps a backup. No refusal, no state classifier, no new error.
2. **Inspect.** `inspectRepo` loads only the package body: `loadWorkflowContract()` once. Remove the `contract`/`latestContract` split and the fallback at `:103-108`. Remove `resolveInstalledWorkflowContract` and `resolveWorkflowContractForRepo` from `scripts/workflow-contract.ts:289-296`. Sync the projection with `scripts/sync-helper-sources.ts`. The `missing-runtime-contract-manifest` signal (`:136-137`) stays; it checks existence.
3. **Shell scaffold.** Remove `pi_install_workflow_contract` (`project-init-lib.sh:690-703`) and its calls (`create-project-dirs.sh:42-43`, `init-project.sh:68-69,306`). The scaffold protocol already attaches the workflow through `repo-harness init` (`assets/skills/repo-harness-setup/references/scaffold.md:14`).
4. **Text that points into the repo body.** Change to the package asset: `project-init-lib.sh:1594,1706`, self-host `.ai/harness/policy.json:196,353`, and the `runtime-contract-refresh` summary (`assets/workflow-contract.v1.json:544`, "Install the repo-harness opt-in marker, harness policy, and context map."). No code reads these strings (observed, grep).
5. **This repo.** Replace `.ai/harness/workflow-contract.json` with the marker.
6. **Rules and docs.** `CLAUDE.md:17` / `AGENTS.md:17`: replace "Keep … aligned" with "`.ai/harness/workflow-contract.json` is the opt-in marker; `assets/workflow-contract.v1.json` is the contract." Update `docs/architecture/domains/workflow-engine.md:21`, `docs/architecture/modules/workflow-engine/contract-assets.md` (mirror wording), `assets/reference-configs/harness-overview.md:220` and its `docs/` projection, and `.archcontext/model/nodes/capability.workflow-engine.contract-assets.yaml` (model first, then project docs).

Not added (each was in revision 3; each is removed by the decision):

| Removed item | Why it is not needed |
|---|---|
| `packageVersion`, pin states, P-floor / P-exact, `preserve` / `raise` | Option F |
| Step A / Step B classifier and nine states | No reader uses marker content; adoption always replaces |
| Typed refusal, `createPlan` / init-hook catch (§5h of rev. 3) | Nothing refuses; today's replace + backup stays |
| 33-entry fingerprint table and asset upgrade action | Legacy bodies need no detection; any content is replaced with a backup |
| Body-reader code gate for kept forks | Probe found no caller of the forks; cleanup is a follow-up (§5) |
| New doctor check | A leftover legacy body is inert: hooks check existence, nothing reads the body |
| `run workflow-contract --check`, offline CI option | No consumer CI reads the file; `repo-harness run workflow-contract` already prints the package body |
| `package.json` version error | Marker records no version |

## 4. Tests

| Test | Change | Reason |
|---|---|---|
| `tests/workflow-contract.test.ts:57-61`, `tests/unit/helper-projection-drift.test.ts:20-25` (repo copy equals asset) | Assert the repo file equals `renderWorkflowContractMarker()` | The equality being tested changes by design |
| Shell scaffold: `tests/create-project-dirs.runtime.test.ts:122,231-236`, `tests/scaffold-parity.test.ts:32-54`, `tests/init-project.settings.runtime.test.ts:29`, `tests/factor-factory.test.ts:20` | Remove the expectation that the shell writes the file | The shell writer is retired (§3.3) |
| New case in `tests/cli/adoption-plan.test.ts` | A Gen-B body (v0.19.5 bytes) is replaced by the marker, and the backup holds the old bytes | Covers the consumer migration path |
| New case in `tests/workflow-contract.test.ts` | Inspect gives the same result when the repo file is a marker, a legacy body, or `{}` | Proves inspect no longer reads the repo body |
| `tests/workflow-contract.test.ts:436-458` (stale repo body) | None | Every assertion already comes from the package actions; it still passes |
| `tests/cli/adoption-plan.test.ts:403-418` (`{}` replaced with backup) | None | Replace + backup behavior stays |
| `tests/cli/init-hook.test.ts:426-448`, `tests/cli/doctor.test.ts:52-67`, opt-in `{}` fixtures, historical fixtures | None | Existence semantics and adoption behavior stay |
| Fixture repos that copy the body (`tests/contract-worktree-squash-cleanup.test.ts:53`, `tests/architecture-projection-continuation.test.ts:79`, `tests/helpers/helper-script-fixture.ts:75`) | None, unless they fail | Their content is no longer read; existence is enough |

No existing assertion is weakened. The PR lists each test change with its reason, and gets the one read-only review for tests bent to fit a bug.

## 5. Consumer rollout and follow-ups

Rollout per consumer (outside this PR): `repo-harness upgrade --scope project`, then `repo-harness init`, then commit the marker. Adoption keeps a backup under `.ai/harness/backups/fs-transaction/`; git keeps the old body.

Follow-ups that wait for Aimpact approval. Nobody runs them until Aimpact approves each item:

| Item | Evidence (observed 2026-10-05) | Proposed action |
|---|---|---|
| F1. Kept forks in 97app | `.ai/harness/scripts/` has 42 files; `check-task-workflow.sh:31` and `workflow-contract.ts:162` parse the body. No caller in `package.json`, `.claude`, `.codex`, `.github`. Working tree clean. No upgrade action covers `.ai/harness/scripts/*` | Delete `.ai/harness/scripts/`, or keep it. After the marker, a fork fails only when someone runs it by hand |
| F2. Kept forks in hegui-agent | Same 42 files and readers. `scripts/architecture-queue.sh:5` wraps the path-only `architecture-queue.sh`. Working tree has 4 uncommitted entries | Same as F1. The repo owner handles the uncommitted work first |
| F3. Stale entries in `~/.repo-harness/registered-repos.json` | 20 entries point to temporary directories under `/private/var/folders/…/T/` and `/private/tmp/` that no longer exist | Prune the 20 dead entries. Keep the 7 entries under `~/Projects` |

## 6. Risks

1. A kept fork fails if a person runs it after the cutover. Low: no caller observed. Fix: F1/F2 (§5).
2. An edited repo body is replaced. Same as today (`standard-plan.ts:150-164`). The body holds no repo data; backup and git keep the bytes.
3. Two machines with different packages run different contract bodies with no report. Same as today; accepted by Option F.
4. Docs and rules drift. §3.6 lists every file.

## 7. Implementation outline (later PR)

1. Marker renderer; adoption write (§3.1).
2. Inspect and resolver cleanup; projection sync (§3.2).
3. Retire the shell write; text updates (§3.3, §3.4).
4. This repo's marker; rules, model, docs (§3.5, §3.6).
5. Tests (§4).
6. Verify: `bun run check:type`; `HOME=$(mktemp -d /tmp/rh-home.XXXX) bun run test:files tests/workflow-contract.test.ts tests/unit/helper-projection-drift.test.ts tests/cli/adoption-plan.test.ts tests/cli/init.test.ts tests/create-project-dirs.runtime.test.ts tests/scaffold-parity.test.ts tests/init-project.settings.runtime.test.ts tests/factor-factory.test.ts tests/cli/init-hook.test.ts tests/cli/doctor.test.ts tests/hook-runtime.test.ts tests/cli/status.test.ts --timeout 60000 --max-concurrency 1`.
7. Rollback: `git revert <squash-commit>`. A consumer restores its body from the fs-transaction backup or git.

## 8. Review history

Revisions 1-3 answered two Codex reviews (`/tmp/contract-marker-plan-codex-review.md`). Their P1/P2 findings were about the refusal boundary, the classifier states, the pin version source, and the doctor matrix. Revision 4 removes those mechanisms. The findings that still apply are kept: one writer (P1-2, §3.3), inspect must not fail on repo content (P2-1, §3.2), no vendored body in the repo (P2-5, §2), and doctor must not hide a broken package (P2-4; no new doctor check, so the existing package checks stay as they are).
