# Plan: Testing policy and test artifact authoring

> **Status**: Review
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
- [ ] Archive after the pre-existing architecture queue blockers are resolved by their owner.

## Delivery integration

- The owner authorized committing, integrating and pushing the preserved WIP `47e1ae08`. Integrated target `f3ec45255c07f86d23c9aaa04cf457aac7b1c403` in an isolated worktree.
- The architecture conflict was the already-resolved root event `sha256:437c13ac41fad6e2406993638005327451b7b1155eedc21a83c7b75ed66b1e36`. Retained #414's resolved archive and architecture index; removed the obsolete pending copy rather than reopening the same event. The original WIP remains in Git history.
- Current focused verification passed: 8 verification-authoring/schema tests (42 assertions) and 2 fleet generation/parity tests (111 assertions). Logs: `/tmp/rh-policy-delivery-focused.log` and `/tmp/rh-policy-delivery-fleet.log`. No local full-suite execution.
- Hosted CI is an explicit remaining gate: root agent files, templates and the test assertion select full coverage. Expected Test job cost is about 22 minutes, based on #415; a PR pass does not waive the required main-push run.
- All nine required integrity checks passed on the integrated candidate, including architecture sync (zero blocking requests), task-sync bound to the header digest and strict workflow validation. Logs: `/tmp/rh-policy-integrity-{0..8}.log`. The former architecture blocker is resolved; no external AcceptanceReceipt is claimed.
