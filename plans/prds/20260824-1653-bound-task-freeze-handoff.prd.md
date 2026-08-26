# PRD: Bound Task Freeze and Handoff (ME-4A)

> **Status**: Approved
> **Slug**: `bound-task-freeze-handoff`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-26T13:50:00+0800
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
  binding_current_sha256: sha256
  claim_actor_receipt_sha256: sha256
  work_envelope_sha256: sha256
  work_envelope_bytes_sha256: sha256
  lease_state_sha256: sha256
  worktree: string
  worktree_topology_sha256: sha256
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

### Approved Source Boundary

- Exact WorkEnvelope bytes come from the existing `.ai/harness/handoff/work-envelope.json` resource and must validate against both the immutable ClaimActorReceipt digest and the live bound Lease. Missing bytes fail closed; narrower Lease/Claim fields cannot reconstruct the envelope.
- `checks_state_sha256` binds exact `.ai/harness/checks/latest.json` bytes. It is clean only when the record is `pass` and names the exact task Contract derived from `unit_ref`.
- `unverified_hypotheses_sha256` binds the exact task-local notes `## Open Questions` bytes. Exact `- None.` is the only empty state; any other shape remains unverified.
- Before ME-2B installs its writer-grant current reader, the writer-grant observation is null by construction. ME-4A creates no grant registry or fallback authority.
- Binding replace and retire reject every live Claim. A clean freeze only proves the existing explicit Lease release path is safe; it never authorizes an implicit release/reacquire.

### Architecture Acceptance

- Human acceptance event: `event.user-approval-20260826-me4a-architecture`.
- Applied change set: `changeset.docs-projection-f46a5e9fd9412be0`.
- Accepted major reasons: `node-added,relation-changed`; affected nodes are `capability.runtime-harness.bound-task-freezes` and `capability.runtime-harness.engineer-bindings` only.
- ArchContext proves P1 and P2 for the new capability; the required flow selectors are `5/5` and the projection receipt is `sha256:ce46adc4efad598098223e0d7485650786750e376b0b2ad73bb450e29590d394`.
- Acceptance does not authorize takeover, successor election, untracked-content transport, implicit release/reacquire, writable delegation, Parent freeze or ME-4B/ME-2B scope.

### Acceptance Scripts

1. Dirty a bound worktree and assert rotation refusal with unchanged Lease.
2. Freeze, mutate one untracked filename and assert stale refusal.
3. Crash during freeze persistence and assert no current/Claim mutation.
4. Inventory CLI/routes and assert no execution takeover.
