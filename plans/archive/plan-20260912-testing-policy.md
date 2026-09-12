> **Archived**: 2026-09-12 17:19
> **Related Plan**: plans/archive/plan-20260912-testing-policy.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260912-1719
> **Archive Projection V1**: `plans/plan-20260912-testing-policy.md` => `plans/archive/plan-20260912-testing-policy.md`

# Plan: Testing policy and test artifact authoring

> **Status**: Archived
> **Substantive Change SHA256**: `sha256:baa1c291cd15530cd9cdf1ecc732e31aed8f170ff5398191d9e3e42996a0ee76`
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Contract template parsing, source/projection equality, role generation and repository-integrity checks.
> **Rollback Surface**: Revert only this policy/template/persona diff; runtime and CI are unchanged.
> **Scope**: Standard documentation and template change; approved by the user.

## Decision

- P1: `assets/reference-configs/sprint-contracts.md` owns the published policy; `docs/reference-configs/` is its checked projection. Root agent files own this repository's required commands. Contract/review templates and fleet personas consume the policy.
- P2: Authors select checks, the canonical executor produces evidence, and reviewers consume it. Template defaults currently seed a new task-named test and typecheck; gatekeeper instructions independently request execution.
- P3: Consolidate test selection, test-file admission, execution ownership and document creation rules in the existing policy. Keep CI/release gates and runtime evidence protocols unchanged. Avoid new policy files, schemas, dependencies and report templates. At larger scale, fixture/process costs remain a separate optimization.

## Scope and verification

Edit root AGENTS/CLAUDE, canonical sprint-contracts and its projection, contract/review templates and their installed copies, the gatekeeper persona and repository Codex projection, the existing template schema assertion, and tasks/lessons. No runtime or CI changes, host installation, commit or publication.

Run the existing verification-authoring and verification-plan tests, targeted fleet projection verification, and root repository-integrity checks. No full suite: changed behavior is authoring/projection, covered by these checks. Record results here; no separate contract, review or notes artifact is needed for this standard slice.

## Promotion Gate

- **Merge/PR unit**: One coherent policy/template/persona update; no publication requested.
- **Rollback surface**: This plan's declared file set, with no runtime state migration.
- **Verification boundary**: Existing authoring/schema checks and installer-generated persona parity.
- **Review/acceptance boundary**: Standard profile; local evidence is recorded in this plan, with no separate contract/review scaffolding.
- **High-risk surface**: Existing CI/release checks and execution schema are preserved.
- **Why not checklist row**: No existing active plan owns the cross-entrypoint testing policy and template default change.

## Evidence Contract

- **State/progress path**: This plan's Task Breakdown and Verification Results.
- **Verification evidence**: Named focused tests and required integrity command output; no new report store.
- **Evaluator rubric**: One policy authority, valid empty template, generated copies match sources, unchanged runtime/CI requirements.
- **Stop condition**: Policy and projections complete; all required checks pass or unresolved out-of-scope gates are reported without claiming acceptance.
- **Rollback surface**: This plan's declared file set only.

## Verification Results

- Eight existing verification-plan/authoring tests passed; two selected fleet installer/parity tests passed. Real fleet generation used a disposable HOME; no host installation was performed.
- Hook/helper/reference projections, deployment SQL order, project inspection and init dry-run passed. Init planned zero operations. Root AGENTS/CLAUDE and contract/review template copies are checked for equality.
- Architecture sync failed on pre-existing pending requests: root from `scripts/ensure-task-workflow.sh`, and workflow-engine-contract-assets from `.ai/harness/policy.json`, both dated 2026-09-12 before this change. Their source files are outside this diff; no architecture acceptance is claimed.
- The repository review template also receives its canonical source's existing Manual Check Evidence section during synchronization; this preserves the source rather than maintaining a divergent local template.
- Full suite was not run: named authoring and generation checks cover the changed executable template shape; no runtime/CI code changed.
- Strict task-workflow passed after adding the required plan metadata. Task-sync uses the exact substantive digest above. Architecture queue ownership remains an external closeout dependency; the plan stays Blocked and unarchived rather than claiming full acceptance.

## Task Breakdown

- [x] Consolidate policy and test/document creation standards.
- [x] Align templates, root references and reviewer instructions.
- [x] Verify affected authoring/projection surfaces and repository integrity; preserve the architecture-sync failure as a closeout blocker.
- [x] Record durable lesson in tasks/lessons.md.
- [x] Archive after the pre-existing architecture queue blockers are resolved by their owner.

## Delivery integration

- The owner authorized committing, integrating and pushing the preserved WIP `47e1ae08`. Integrated target `f3ec45255c07f86d23c9aaa04cf457aac7b1c403` in an isolated worktree.
- The architecture conflict was the already-resolved root event `sha256:437c13ac41fad6e2406993638005327451b7b1155eedc21a83c7b75ed66b1e36`. Retained #414's resolved archive and architecture index; removed the obsolete pending copy rather than reopening the same event. The original WIP remains in Git history.
- Current focused verification passed: 8 verification-authoring/schema tests (42 assertions) and 2 fleet generation/parity tests (111 assertions). Logs: `/tmp/rh-policy-delivery-focused.log` and `/tmp/rh-policy-delivery-fleet.log`. No local full-suite execution.
- Hosted CI is an explicit remaining gate: root agent files, templates and the test assertion select full coverage. Expected Test job cost is about 22 minutes, based on #415; a PR pass does not waive the required main-push run.
- All nine required integrity checks passed on the integrated candidate, including architecture sync (zero blocking requests), task-sync bound to the header digest and strict workflow validation. Logs: `/tmp/rh-policy-integrity-{0..8}.log`. The former architecture blocker is resolved; no external AcceptanceReceipt is claimed.

## Hosted delivery evidence

- PR [#418](https://github.com/Ancienttwo/repo-harness/pull/418) merged as `6a8439a81a1fe1ef61df4b9959fb64f5ae9d1c7f`, retaining original WIP `47e1ae08` in its ancestry. Local main was fast-forwarded to the same commit with a clean working tree.
- PR run [34683536952](https://github.com/Ancienttwo/repo-harness/actions/runs/34683536952), head `a1e4b6eb`: full coverage passed, including 425 Test files / 5281 passed tests, tarball install / packaged Operator / CLI smoke, Governance, all three platform matrix jobs and Required / CI. Test job took 20m12s.
- Main run [34684444855](https://github.com/Ancienttwo/repo-harness/actions/runs/34684444855), head `6a8439a8`: the full Test passed once in 22m04s (08:54:15–09:16:19 UTC). Attempt 1 failed only the Windows matrix plus its Required / CI aggregate. `tests/cli/mcp-http.test.ts:1337` assumed a 3000 ms initial yield guaranteed command completion; the observed response was a valid running session after 3011 ms. The process manager explicitly races exit against the yield timer, and both files were unchanged from the passing PR. This timing-sensitive assertion remains a deferred test defect, not a repaired product defect.
- One targeted rerun of Windows job `103528880771` produced attempt 2: Windows and Required / CI passed. The Test job retained its original start/end timestamps and result; no second full Test execution occurred. The original failed attempt remains part of the evidence, with the repair tracked in tasks/todos.md.

## Archive Note

Superseded after delivery through PR #418: the canonical Testing Policy and Artifact Standards section now owns the durable requirements, while this plan is historical implementation evidence. No AcceptanceReceipt was produced; this is not a Completed contract acceptance claim.
