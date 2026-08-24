# PRD: Bound Task Freeze and Handoff (ME-4A)

> **Status**: Draft
> **Slug**: `bound-task-freeze-handoff`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T18:30:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0B and active Contract/Claim/WorkEnvelope; executable takeover additionally requires ME-2B and a later Approved carrier/election revision
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: Session rotation with dirty/unverified bound work cannot safely use release/reacquire or claim lossless handoff.
- **Users**: Human Maintainer, bound Module Engineer and recovery operator.
- **Platform**: claimed worktree inspection, exact Git/inventory digests and immutable freeze receipt.
- **P0 surface**: dirty-bound refusal, `TaskFreezeReceiptV1`, stale detection and Human choices; no execution takeover.
- **Core metric**: silent dirty transfer 0; stale freeze accepted 0.
- **Hard constraint**: untracked inventory digest is not a content carrier; P0 cannot reconstruct or transfer untracked bytes.
- **Key risk**: naming an inventory-only record “handoff” and implying a successor can resume losslessly.
- **Unknowns**: exact untracked/diff carrier and single-successor election remain separate approval blockers.
- **Acceptance scenarios**: clean release path, dirty refusal, exact freeze, stale freeze and explicit Human disposition.
- **Suggested next step**: approve only the freeze/read model; keep takeover route absent.

## Problem

A stale Session may hold dirty files, hypotheses and runtime state. Binding rotation is not task/worktree transfer. P0 must preserve and describe the residual without inventing a successor.

### Product Direction

Inspect under current Claim/Binding fences, freeze exact tracked Git state plus untracked inventory metadata, and present Human choices: keep old Binding, retain frozen candidate, abandon, or manual recovery. Release/reacquire is allowed only for clean/no-unverified work.

### Feasibility Boundary

- **Confirmed**: Git tree/diff/status and inventory digests are observable.
- **[UNKNOWN]**: lossless untracked content carrier and atomic successor election.
- **Fail closed**: no transparent rotation or execution takeover in P0.

## Users

### Primary Users

- Human recovery operator.
- Bound Module Engineer requesting rotation.

### Secondary Users

- Future takeover implementation consuming a newer Approved receipt protocol.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Dirty task transparently moved | 0 | transition fixtures | any |
| Stale freeze accepted | 0 | post-freeze mutation fixture | any |
| Lease/task bytes changed by inspect | 0 | byte comparison | any |

## Acceptance Scenarios

### Scenario 1: Dirty bound refusal

Rotation sees dirty/unverified state and returns typed Human choices without releasing Claim or creating another worktree.

### Scenario 2: Freeze becomes stale

Any HEAD/tree/diff/inventory/Claim/Binding/writer-grant change after freeze invalidates it.

### Scenario 3: Clean task

Clean, verified, no-active-grant work may use existing explicit release/reacquire; no freeze claims transferable dirty content.

## Non-goals

- Execution takeover, successor election or untracked content transport.
- Interface lifecycle, integration, publication or product Acceptance.

## Module Behaviors (P0)

### Module 1: Inspect and Freeze

Under exact fences, observe Git/worktree/grant state twice, reject changed-during-read and persist immutable freeze bytes.

### Module 2: Human Disposition

Render closed choices without mutating Claim/Binding automatically. Any later action revalidates all freeze subjects.

## Data Model

```yaml
TaskFreezeReceiptV1:
  protocol: 1
  task: {task_id: sha256, task_revision: sha256, claim_id: uuid, lease_generation: integer}
  engineer_id: string
  binding_id: uuid
  binding_generation: integer
  worktree: string
  branch: string
  unit_ref: string
  head_sha: sha
  tree_sha: sha
  diff_sha256: sha256
  untracked_inventory_sha256: sha256
  checks_state_sha256: sha256
  unverified_hypotheses_sha256: sha256
  writer_grant_id: uuid|null
  writer_grant_sha256: sha256|null
  observed_at: datetime
  receipt_sha256: sha256
```

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Dirty/untracked content carrier | Blocks takeover | separate migration/security design | Git owner |
| Successor election | Blocks takeover | separate CAS protocol | State owner |

## Developer Handoff

P0 exposes inspect/freeze/refusal only. No command named takeover may ship from this PRD.

### Acceptance Scripts

1. Dirty a bound worktree and assert rotation refusal with unchanged Lease.
2. Freeze, mutate one untracked filename and assert stale refusal.
3. Crash during freeze persistence and assert no current/Claim mutation.
4. Inventory CLI/routes and assert no execution takeover.
