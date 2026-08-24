# PRD: Bound Task Handoff and Integration Plane (ME-4)

> **Status**: Draft
> **Slug**: `bound-task-handoff-integration`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T16:53:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-1A scheduling, ME-2B writer settlement, ME-2C verified context, existing Publication/Acceptance
> **Tier**: standard

## AI Quick-Read Card

- **Problem**: active bound dirty task cannot safely follow a Session rotation；cross-capability changes and green module candidates also lack explicit execution handoff and product-level requirement closure。
- **Users**: Maintainer、Module Engineer、Integration Engineer、Independent Gatekeeper。
- **Platform**: Claim/worktree topology、TaskHandoffReceipt、explicit execution takeover、InterfaceChangeRequest、IntegrationContract/Envelope、AcceptanceMatrix。
- **P0 surface**: first freeze/inspect bound work without transfer；then explicit takeover；separately collect accepted module publications into exact integration candidate and Human Product Gate。
- **Core metric**: unverified dirty work never silently transfers；green module set with missing requirement never reaches product acceptance。
- **Hard constraint**: until takeover protocol is Approved, active bound dirty/unverified work blocks mutation handoff；Publication takeover remains the reviewing-state path。
- **Key risk**: combining dirty-work recovery with task election could leave two worktrees/writers or reuse contaminated candidate state。
- **Unknowns**: exact execution takeover state transition and Git carrier require dedicated fault/race design before approval。
- **Acceptance scenarios**: dirty bound refusal、frozen handoff digest、single successor、interface request projection、requirement closure and final Head fencing。
- **Suggested next step**: keep execution takeover disabled；first approve `TaskHandoffReceiptV1` freeze/read model independently of transfer。

## Problem

Release/reacquire creates a fresh worktree and loses provenance for dirty old work. A safe path needs an exact handoff carrier and a single election transition. Separately, integration must prove the original approved requirement across module candidates, not merely aggregate green PRs.

### Product Direction

Phase A, safe V1 refusal:

```text
active bound claim + dirty/unverified worktree
→ rotation_recommended
→ mutation_handoff_blocked
→ human chooses keep / freeze / abandon / manual recovery
```

Phase B, later explicit takeover:

```text
freeze TaskHandoffReceipt
→ settle writer actor
→ elect one successor under task lock
→ bind exact recoverable worktree/candidate
→ new ClaimActorReceipt
→ reverify before mutation
```

Integration:

```text
accepted module publications
→ IntegrationContract/Envelope
→ exact combined candidate
→ cross-module checks + AcceptanceMatrix closure
→ independent system verifier
→ Human Product Gate
```

### Feasibility Boundary

- **Confirmed**: worktree topology, Claim/Lease fences, Publication takeover/readiness and independent acceptance exist.
- **[UNKNOWN]**: safe execution takeover transition for bound dirty state.
- **[UNVERIFIED]**: untracked-file carrier and large diff handoff performance.

## Users

### Primary Users

- **Maintainer**: chooses recovery/abandon/takeover and final product decision.
- **Integration Engineer**: assembles exact accepted module candidates and requirement closure.

### Secondary Users

- **Module Engineer**: freezes handoff/interface request but cannot self-transfer authority or self-accept.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Transparent dirty bound transfer before protocol | 0 | negative fixtures | any transfer |
| Successor claims/writers after takeover | exactly 1 | race tests | >1 |
| Handoff subject mismatch accepted | 0 | digest matrix | any acceptance |
| Approved requirements mapped once | 100%, no omission/duplicate | AcceptanceMatrix test | any gap |
| Final Head mismatch accepted | 0 | provider movement test | any acceptance |

## Acceptance Scenarios

### Scenario 1: Current V1 blocks unsafe rotation

- **Given**: bound claim, dirty worktree and no TaskHandoffReceipt.
- **When**: operator requests Session mutation handoff.
- **Then**: typed refusal; Lease/worktree remain unchanged; read-only recovery information is shown.
- **Machine-checkable evidence**: Lease/topology digest equality.

### Scenario 2: Frozen handoff is stale

- **Given**: TaskHandoffReceipt binds HEAD/tree/diff/untracked inventory.
- **When**: worktree changes before takeover.
- **Then**: takeover rejects stale subject and cannot elect successor.
- **Machine-checkable evidence**: subject digest mismatch.

### Scenario 3: Product requirement missing

- **Given**: all module candidates pass local gates but one approved requirement has no owning evidence row.
- **When**: Integration Gate runs.
- **Then**: product acceptance remains blocked despite green modules.
- **Machine-checkable evidence**: AcceptanceMatrix omission failure and no final receipt.

## Non-goals

- Transparent background rotation or liveness-triggered Lease steal.
- Reusing Publication takeover for active bound execution.
- Automatic final merge or waiver.
- Multi-machine handoff/claim protocol.
- Message notification as InterfaceChange authority.

## Module Behaviors (P0)

### Module 1: Task Handoff

- receipt binds task/revision/claim/lease generation, worktree/branch/unit, HEAD/tree/diff digest, untracked inventory, checks refs, hypotheses and writer settlement;
- current first release may ship freeze/status/refusal without execution takeover;
- later takeover must be one task-locked state transition with full compensation.

### Module 2: Interface Change

- closed lifecycle: `proposed → acknowledged → accepted|rejected|revision_requested → projected_to_work_package → implemented → integration_verified|closed`;
- accepted request projects a dependent canonical Work Package; message only notifies.

### Module 3: Integration/Product Acceptance

- Module Gate uses existing exact candidate/Contract/Publication evidence;
- Integration Gate checks dependencies, interfaces, combined Head and cross-module oracles;
- Product Gate checks AcceptanceMatrix, residual risks and exact final Head, then Human decides.

## Data Model

```yaml
TaskHandoffReceiptV1:
  task_id: sha256
  task_revision: sha256
  claim_id: uuid
  lease_generation: integer
  binding_id: uuid
  worktree_ref: sha256
  head_sha: gitsha
  tree_sha: gitsha
  diff_sha256: sha256
  untracked_inventory_sha256: sha256
  check_receipt_refs: []
  writer_grant_state: settled|none
  frozen_at: datetime
```

`IntegrationEnvelopeV1` binds the original approved Requirement, Work Package graph revision, exact accepted module publication receipts, interface revisions, combined candidate Head and AcceptanceMatrix revision.

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Handoff freeze, ≤10k changed files | ≤5 s local | fixture benchmark | 30 s |
| Integration graph, 100 Work Packages | ≤5 s excluding checks | benchmark | 30 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Execution takeover state transition | Blocks transfer | state/race/fault design and separate approval | State owner |
| Untracked content carrier | recovery fidelity/security | inventory vs content artifact design | Git owner |
| Combined integration candidate strategy | Head fencing | worktree/merge-tree canary | Integration owner |

## Developer Handoff

Do not implement execution takeover until its state transition is independently approved. Freeze/status/refusal may be split into an earlier work package.

- **Build first after approval**: TaskHandoffReceipt freeze validator, InterfaceChange core, Integration schemas/projections, then exact candidate checks; takeover last.
- **Do not reinterpret**: dirty work never silently moves; interface messages do not approve; green modules do not prove product closure.
- **Verify with**: stale handoff, race/fault injection, interface lifecycle, missing/duplicate requirement and final Head movement.

### Acceptance Scripts

1. Request rotation on dirty bound work without receipt and prove typed refusal.
2. Freeze receipt, mutate worktree and prove stale takeover rejection.
3. Race two successors and prove at most one election if takeover is enabled.
4. Project accepted InterfaceChange into a dependent Work Package.
5. Run green modules with one missing requirement and block Product Gate.
