# PRD: Integration and Product Acceptance (ME-4C)

> **Status**: Approved
> **Slug**: `integration-product-acceptance`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-26T01:15:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-1A and existing Publication/Acceptance; interface-driven work additionally references ME-4B. ME-2C assertions may be consumed as optional evidence but are not authority or an approval prerequisite.
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: green module publications do not prove the original approved product requirement across one exact combined candidate.
- **Users**: Integration Engineer, independent system Gatekeeper, Product Human and Program Orchestrator.
- **Platform**: approved PRD/Source Spec requirement subject, exact publication selection, combined Git candidate and existing Acceptance Plane.
- **P0 surface**: `IntegrationContractV1`, `IntegrationEnvelopeV1`, `AcceptanceMatrixV1`, combined candidate strategy and product receipt.
- **Core metric**: product acceptance without exact requirement/candidate 0; module evidence reused across wrong candidate 0.
- **Hard constraint**: module Acceptance, integration verification and product Acceptance are distinct receipts; Human merge remains final.
- **Key risk**: selecting “current” module publications without frozen revisions/base/head.
- **Closed decisions**: the combined candidate is one existing exact Git commit/tree in the integration worktree; product verdict remains the existing verified `AcceptanceReceipt`, projected but never re-issued by ME-4C.
- **Acceptance scenarios**: requirement closure, publication selection, stale candidate, missing matrix row and independent product gate.
- **Build first**: pure closed schemas, exact Git/publication revalidation, immutable content-addressed projections and CLI JSON; no merge builder or new Acceptance authority.

## Problem

Integration must prove an Approved requirement against exact module publications and final combined state. “All PRs green” is neither a requirement authority nor a combined candidate.

### Product Direction

The original requirement subject is an existing Approved work-package PRD plus its exact Source Spec revision/digest; no new Requirement database is created. Integration selects exact accepted publication receipts, constructs one content-addressed candidate, verifies a closed matrix, and asks the existing independent Acceptance Plane to issue a product-level receipt.

This control-plane capability is independent of how implementation was executed. A candidate produced by a Human、persistent Codex Thread、native child or future Provider adapter enters the same exact-subject gate；ME-3 runtime receipts and ME-2C semantic assertions may supply evidence refs but cannot become prerequisites or acceptance authority。

The P0 combined-candidate carrier is an already-existing Git commit in the current integration worktree. `base_sha` must be an ancestor of `final_head_sha`; every selected publication `head_sha` must also be an ancestor of that final head; `final_tree_sha` is resolved from the commit. ME-4C does not synthesize a merge commit or choose merge order. Candidate construction remains Git/operator authority.

The product verdict is the existing protocol-2 `AcceptanceReceipt` verified by the installed acceptance helper against the same current repository, target revision and normalized final content. ME-4C emits only `ProductAcceptanceProjectionV1`, a content-addressed projection of that already-verified receipt plus the exact envelope/matrix. It cannot sign, waive, replace or reinterpret Acceptance.

### Feasibility Boundary

- **Confirmed**: exact Git subjects, Publication and Acceptance receipts exist; an exact existing commit/tree is sufficient as the combined candidate carrier; the existing Acceptance helper is the only verdict authority.
- **Fail closed**: missing Approved requirement, stale publication, base/head drift or matrix gap blocks product gate.

## Users

### Primary Users

- Integration Engineer constructing one candidate.
- Independent Gatekeeper verifying system behavior.

### Secondary Users

- Product Human deciding final merge/release.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Acceptance without exact requirement | 0 | requirement fixture | any |
| Stale publication selected | 0 | revision race | any |
| Missing matrix constraint accepted | 0 | matrix fixture | any |
| Human merge automated | 0 | route inventory | any |

## Acceptance Scenarios

### Scenario 1: Exact requirement

Envelope binds Approved PRD digest/status revision and Source Spec digest. Draft/changed requirement fails closed.

### Scenario 2: Stale module publication

One selected publication is superseded after envelope creation. Candidate validation refuses before verification.

### Scenario 3: Product gate

All matrix constraints pass for exact final head/tree. Independent Acceptance Plane issues a typed product receipt; Human still decides merge.

## Non-goals

- Module implementation, interface-request transitions, automatic merge/release or new Kanban state.
- Treating Worker/Verifier prose as Acceptance.
- Depending on Provider Session、Worker Host、runtime lifecycle or model-routing state to define the combined candidate or product verdict。

## Module Behaviors (P0)

### Module 1: Contract and Candidate

Freeze requirement subject, dependencies, selected publications, base/head strategy and expected system constraints before candidate construction.

### Module 2: Matrix and Gate

Evaluate every requirement/dependency/integrity row against exact combined candidate and submit immutable evidence to the existing independent Acceptance Plane.

## Data Model

```yaml
IntegrationContractV1:
  protocol: 1
  requirement: {approved_prd_ref: string, approved_prd_sha256: sha256, source_spec_ref: string, source_spec_sha256: sha256}
  repository_id: string
  integration_group: string
  required_work_packages: [{work_package_id: task-digest, work_package_revision: task-digest}]
  required_constraints: [closed-id]
  contract_sha256: sha256

IntegrationEnvelopeV1:
  protocol: 1
  integration_contract_sha256: sha256
  selected_publications: [{publication_id: string, receipt_sha256: sha256, current_publication_pointer_digest: sha256, publication_status_observation_digest: sha256, head_sha: sha, tree_sha: sha}]
  base_sha: sha
  final_head_sha: sha
  final_tree_sha: sha
  combined_candidate_sha256: sha256
  envelope_sha256: sha256

AcceptanceMatrixV1:
  protocol: 1
  envelope_sha256: sha256
  rows: [{constraint_id: string, evidence_ref: string, evidence_sha256: sha256, result: pass|fail|blocked}]
  verifier_receipt_ref: string
  verifier_receipt_sha256: sha256
  matrix_sha256: sha256

ProductAcceptanceProjectionV1:
  protocol: 1
  kind: repo-harness-product-acceptance-projection
  envelope_sha256: sha256
  matrix_sha256: sha256
  acceptance_receipt_sha256: sha256
  acceptance_subject_sha256: sha256
  acceptance_target_revision: sha
  acceptance_disposition: external_pass|user_waiver
  projection_sha256: sha256
```

`current_publication_pointer_digest` is the canonical digest of the exact lease-owned `CurrentPublicationPointerV1` observed for the selected task. `publication_status_observation_digest` is the digest of the exact canonical lease bytes containing that pointer and status at freeze time. Both are re-read before product projection. ME-4C does not invent a `publication_revision`, infer a pointer from branch/PR facts or translate a missing current pointer into an older publication.

Contracts, envelopes, matrices and product projections are immutable content-addressed evidence under the existing git-common-dir `repo-harness` authority root. They have no mutable `current` pointer and cannot transition Task, Lease, Publication or Acceptance state.

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Combined candidate strategy | Resolved | existing exact integration-worktree commit/tree; ancestor checks only | Git owner |
| Product Acceptance receipt hook | Resolved | verify and project the existing protocol-2 `AcceptanceReceipt`; no new verdict | Acceptance owner |

## Developer Handoff

Implement only the approved existing-commit carrier and non-authoritative product projection. No merge builder, requirement database or acceptance authority is allowed.

### Acceptance Scripts

1. Change Approved PRD/Source Spec digest and assert stale requirement refusal.
2. Supersede one publication and assert candidate refusal.
3. Omit one matrix constraint and assert product gate blocked.
4. Change final Head after verification and assert receipt mismatch.
5. Inventory routes and assert no automatic Human merge.
6. Change the current-publication pointer or status observation without changing immutable receipt bytes; assert envelope refusal.
