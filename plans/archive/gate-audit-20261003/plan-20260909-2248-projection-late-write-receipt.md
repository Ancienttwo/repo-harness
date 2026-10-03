# Plan: Receipt declares prior committed projection writes

> **Status**: Executing
> **Created**: 20260909-2248
> **Slug**: projection-late-write-receipt
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Late-write receipt guard plus focused projection/restamp tests and repository-integrity checks verified together
> **Rollback Surface**: Single-commit revert of the optional provider field, the receipt declaredWrites projection, and the reader updates
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md`
> **Task Review**: `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md`
> **Implementation Notes**: `tasks/notes/20260909-2248-projection-late-write-receipt.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260909-2248-projection-late-write-receipt.md`
- Sprint contract: `tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md`
- Sprint review: `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md`
- Implementation notes: `tasks/notes/20260909-2248-projection-late-write-receipt.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-2248-projection-late-write-receipt.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-2248-projection-late-write-receipt.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md`
- Review file: `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md`
- Implementation notes file: `tasks/notes/20260909-2248-projection-late-write-receipt.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-2248-projection-late-write-receipt.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single-commit revert of the optional provider field, the receipt declaredWrites projection, and the reader updates
- **Verification boundary**: Late-write receipt guard plus focused projection/restamp tests and repository-integrity checks verified together
- **Review/acceptance boundary**: `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-2248-projection-late-write-receipt.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md`, `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md`, and `tasks/notes/20260909-2248-projection-late-write-receipt.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-2248-projection-late-write-receipt.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single-commit revert of the optional provider field, the receipt declaredWrites projection, and the reader updates

## Captured Planning Output

## Context

A projection attempt whose repo-harness owner dies (host kill, provider timeout, or a
recovery reclaim) can still have committed its ChangeSet inside the archctx daemon: the
CLI child is a short-lived RPC client, `applyUpdate` runs in the resident `archctxd`.
The retry of the same jobId then reaches the provider's fixed point and answers
`noop` with `files: []`, and `completeArchitectureProjectionJob`
(`src/effects/architecture/projection-jobs.ts:382`) mints the durable receipt from that
last attempt's `ProjectionResultV1` alone. The receipt therefore claims nothing was
written under a jobId whose earlier attempt did write.

Durable evidence: job-ca58d5a7da32ca18d1e23f15 has an archctx journal entry committed at
2026-09-09T09:29:58.858Z that wrote `docs/architecture/.projection-manifest.json`, against
a repo-harness receipt for the same jobId recording attempt 2, status noop, files [].
See `docs/researches/20260909-projection-manifest-late-writer.md` section 9.

The only existing carrier for a prior apply is `result.applyReceipt`, gated by
`request.acceptedChange !== undefined` in `src/effects/architecture/archctx-provider.ts:559`
and rejected by `assertProjectionResultAuthority` at `:515-518`. The drift lane
(`src/cli/hook/stop-handler.ts:717`, `src/cli/commands/architecture-projection.ts:56`)
never passes `acceptedChange`, so that channel can never carry this evidence.

## Decision

Consume a new optional provider field and make the durable receipt declare it. The
upstream archctx contract (branch `codex/projection-prior-committed-applies`) adds to
`ProjectionResultV1`:

```
priorCommittedApplies?: Array<{
  applyId: string; lookupKey: string; requestId: string; changeSetId: string;
  committedAt: string;
  files: Array<{ path: string; operation: 'write' | 'delete'; hash: string }>;
}>
```

listing ChangeSets committed under the same `requestId` by earlier attempts, included in
`receiptDigest`.

- `src/core/architecture/projection.ts`: add the optional field to `ProjectionResultV1`,
  decode it strictly in `assertProjectionResult` (array shape, non-empty identity strings,
  ISO-8601 `committedAt`, repo-relative POSIX paths, `write|delete` operation, non-empty
  hash) and add its invariants to `projectionResultIssues` (unique `applyId`, unique paths
  within one apply). Malformed entries fail closed as one contract error. `receiptDigest`
  covers the field automatically because `projectionResultReceiptDigest` digests the whole
  result body.
- `src/core/architecture/projection.ts`: add the single mapping
  `projectionDeclaredWrites(result, attempt)` that projects the result into declared
  writes. One mapping site, so an upstream shape change has exactly one consumer edit.
- `src/effects/architecture/archctx-provider.ts`: `assertProjectionResultAuthority`
  accepts `priorCommittedApplies` without `acceptedChange` (it is not an `applyReceipt`),
  and holds it to the same target-escape check as `result.files`; each entry's `requestId`
  must equal the request's own `requestId`. The `applyReceipt` gate is untouched.
- `src/effects/architecture/projection-jobs.ts`: `ArchitectureProjectionReceiptV1` gains
  `declaredWrites: ArchitectureProjectionDeclaredWriteV1[]`. All three receipt writers
  populate it. `result` stays the provider's verbatim answer.
- Readers that gate on "nothing was written" consult the declared writes:
  `src/effects/refactor/materialization.ts` (architecture write/delete transaction) and
  `src/effects/architecture/projection-acceptance.ts` `assertCleanCurrentProof` plus
  `src/core/architecture/restamp-publication.ts` `isManifestRestampOnly` fail closed when
  prior committed applies exist.

Receipt representation: `result` verbatim plus a receipt-level `declaredWrites`. Merging
prior applies into `result.files` would forge the provider's answer (and break
`assertProjectionResult(receipt.result)` in `restamp-publication.ts`, which re-validates
`receiptDigest` over that body). `declaredWrites` is a deterministic projection of
`result`, so the receipt keeps one source of truth with a recomputable drift check.

## Non-goals

- No archctx version-pin change and no new required capability feature. The
  `projection-prior-committed-applies-v1` handshake lands in a later slice once the
  upstream version is pinned; until then the field is optional and absent under 0.5.8.
- No sticky/fence/ignore-set change and no worktree-diff inference. A declared write comes
  from provider authority only; repo-harness never re-derives it from the working tree.

## Task Breakdown

- [x] Land the regression guard `tests/architecture-projection-late-write-receipt.test.ts`
      and capture the pre-fix failing run into
      `.ai/harness/failures/projection-late-write-receipt-pre-fix.log`
- [x] Add `priorCommittedApplies` to `ProjectionResultV1`, its strict decoder, invariants,
      and the `projectionDeclaredWrites` mapping
- [x] Accept `priorCommittedApplies` in `assertProjectionResultAuthority` under the
      existing target-escape and request-identity rules
- [x] Add `declaredWrites` to the durable receipt in all three receipt writers
- [x] Point the "nothing written" readers at the declared writes
- [x] Record the deferred feature-flag handshake in `tasks/notes/`

## Verification

- `bun test --timeout 60000 tests/architecture-projection-late-write-receipt.test.ts`
- `bun test --timeout 60000 tests/architecture-projection-orchestration.test.ts tests/architecture-projection-provider.test.ts tests/architecture-restamp-classifier.test.ts tests/architecture-restamp-publication.test.ts tests/architecture-projection-restamp-cli.test.ts tests/stop-handler-restamp-publication.test.ts`
- `bunx tsc --noEmit`
- repository-integrity checks from CLAUDE.md Required Checks

## Rollback

Single-commit revert. The optional field, the receipt's `declaredWrites`, and the reader
updates land together; reverting returns every receipt to the last attempt's verbatim
result and no consumer keeps a dangling reference.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Land the regression guard `tests/architecture-projection-late-write-receipt.test.ts`
- [x] Add `priorCommittedApplies` to `ProjectionResultV1`, its strict decoder, invariants,
- [x] Accept `priorCommittedApplies` in `assertProjectionResultAuthority` under the
- [x] Add `declaredWrites` to the durable receipt in all three receipt writers
- [x] Point the "nothing written" readers at the declared writes
- [x] Record the deferred feature-flag handshake in `tasks/notes/`
