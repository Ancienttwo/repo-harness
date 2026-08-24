# PRD: Integration and Product Acceptance (ME-4C)

> **Status**: Draft
> **Slug**: `integration-product-acceptance`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T19:49:19+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-1A, ME-2C, ME-3 and existing Publication/Acceptance; interface-driven work additionally references ME-4B
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: green module publications do not prove the original approved product requirement across one exact combined candidate.
- **Users**: Integration Engineer, independent system Gatekeeper, Product Human and Program Orchestrator.
- **Platform**: approved PRD/Source Spec requirement subject, exact publication selection, combined Git candidate and existing Acceptance Plane.
- **P0 surface**: `IntegrationContractV1`, `IntegrationEnvelopeV1`, `AcceptanceMatrixV1`, combined candidate strategy and product receipt.
- **Core metric**: product acceptance without exact requirement/candidate 0; module evidence reused across wrong candidate 0.
- **Hard constraint**: module Acceptance, integration verification and product Acceptance are distinct receipts; Human merge remains final.
- **Key risk**: selecting “current” module publications without frozen revisions/base/head.
- **Unknowns**: exact combined candidate carrier and product receipt integration with the existing Acceptance Plane remain blockers.
- **Acceptance scenarios**: requirement closure, publication selection, stale candidate, missing matrix row and independent product gate.
- **Suggested next step**: freeze one two-module combined candidate fixture before approval.

## Problem

Integration must prove an Approved requirement against exact module publications and final combined state. “All PRs green” is neither a requirement authority nor a combined candidate.

### Product Direction

The original requirement subject is an existing Approved work-package PRD plus its exact Source Spec revision/digest; no new Requirement database is created. Integration selects exact accepted publication receipts, constructs one content-addressed candidate, verifies a closed matrix, and asks the existing independent Acceptance Plane to issue a product-level receipt.

### Feasibility Boundary

- **Confirmed**: exact Git subjects, Publication and Acceptance receipts exist.
- **[UNKNOWN]**: combined candidate carrier/worktree strategy and existing Acceptance Plane extension point.
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
  required_work_packages: [{work_package_id: string, work_package_revision: sha256}]
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
  verifier_receipt_sha256: sha256
  matrix_sha256: sha256
```

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Combined candidate strategy | Blocks approval | compare integration worktree/merge-tree carriers | Git owner |
| Product Acceptance receipt hook | Blocks approval | extend existing exact-subject plane, no parallel authority | Acceptance owner |

## Developer Handoff

Do not implement until candidate carrier and Acceptance extension are Approved. No new requirement or acceptance authority is allowed.

### Acceptance Scripts

1. Change Approved PRD/Source Spec digest and assert stale requirement refusal.
2. Supersede one publication and assert candidate refusal.
3. Omit one matrix constraint and assert product gate blocked.
4. Change final Head after verification and assert receipt mismatch.
5. Inventory routes and assert no automatic Human merge.
6. Change the current-publication pointer or status observation without changing immutable receipt bytes; assert envelope refusal.
