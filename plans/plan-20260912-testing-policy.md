# Plan: Testing policy and test artifact authoring

> **Status**: Blocked
> **Substantive Change SHA256**: `sha256:584bbdf9f415f78a934a5e96e51570f33ea9dc329e168b4f4745915e6daddf0a`
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
