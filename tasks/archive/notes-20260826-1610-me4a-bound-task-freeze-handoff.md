> **Archived**: 2026-08-26 16:10
> **Related Plan**: plans/archive/plan-20260826-1247-me4a-bound-task-freeze-handoff.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260826-1610

# Implementation Notes: me4a-bound-task-freeze-handoff

> **Status**: Active
> **Plan**: plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md
> **Contract**: tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md
> **Review**: tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md
> **Last Updated**: 2026-08-26 15:32
> **Lifecycle**: notes

## Design Decisions

- The exact WorkEnvelope is read from `.ai/harness/handoff/work-envelope.json` and revalidated against ClaimActorReceipt plus the live Lease. The ClaimActor digest alone is not used to reconstruct missing envelope semantics.
- Binding replace/retire rejects every live Claim. A clean freeze is evidence that explicit release is safe; it is not permission for Binding code to synthesize release/reacquire.
- Unverified hypotheses are the exact `## Open Questions` bytes in the task-local notes file. Exact `- None.` means none; any other shape remains unverified.
- `.ai/harness/checks/latest.json` is observation evidence only. A pass is usable only when it names the exact task Contract and its top-level plus Change Assessment subject/target fields match a fresh `buildReviewSubject` observation against the policy-owned review base.
- Binding rotation consults both immutable ClaimActorReceipt evidence and canonical Lease records whose `claimed_by.session_id` is exactly `engineer:<binding-id>`. This closes the receipt-publication rollback gap without adding a second acquisition registry.
- An orphaned replace/retire event rechecks the live-Claim guard immediately before publishing `current.json`; only an already-published identical current returns idempotently without a new guard read.
- ME-2B owns the future writer-grant current reader. ME-4A exposes a typed dependency and records null while that authority is not installed; it does not create a shadow grant store.
- Architecture Acceptance is bound to `changeset.docs-projection-f46a5e9fd9412be0` / `event.user-approval-20260826-me4a-architecture`; ArchContext proves P1/P2 with required selectors `5/5` and receipt `sha256:ce46adc4efad598098223e0d7485650786750e376b0b2ad73bb450e29590d394`.
- The Binding observation lives in the uniquely named `readCurrentTaskFreezeBinding` boundary. This keeps the real direct `readEngineerBindingStatus` evidence edge explicit while preventing CodeGraph result truncation from making the architecture proof unprovable.

## Deviations From Plan Or Spec

- The first approved projection write completed, but the provider rejected its write-after snapshot because a concurrent workflow projection changed the non-architecture worktree digest. The generated manifest and module were retained only after the canonical strict architecture sync reported `pending=0`, `running=0`, `dead_letters=0`, `human_actions=0`, `blocking=0`; no semantic fallback or manual architecture-doc edit was used.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Inventory names/types plus file bytes | Reject | P0 has no approved untracked content carrier; receipt hashes sorted pathname bytes and a closed `lstat` type enum only. |
| Automatic clean release/reacquire | Reject | Lease remains the sole task execution authority and rotation must not transfer it implicitly. |
| Reconstruct WorkEnvelope from Lease/Claim fields | Reject | The complete envelope digest includes canonical plan/target/token facts that narrower state cannot recreate. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Official Codex Plugin Review

- Frozen subject `sha256:c8f2daee7e10f268fb04d3d7d12892ed7831231fb9358bb96f9ceaf45af7edc8` received `needs-attention` from `reviewer=Codex`, `source=codex-plugin`: three P1 findings and one P2 finding.
- P1 stale checks: fixed by recomputing the policy-bound normalized review subject and matching both subject digest and target revision; a post-check commit regression now classifies `checks_unverified`.
- P1 crash replay: fixed by re-running the live-Claim rotation guard before an orphaned replace/retire event may publish `current.json`; both replay paths have regression coverage.
- P1 missing ClaimActorReceipt: fixed by scanning canonical binding-linked Lease records in addition to receipts; the `receipt publish failure + rollback_failed` path now blocks rotation.
- P2 untracked type fence: fixed by hashing raw pathname bytes plus a closed `lstat` type enum; file-to-symlink replacement now stales the receipt.
- The stronger Lease guard exposed an ME-3A fixture that used deliberately malformed sentinel Lease bytes. The fixture now carries a canonical Lease owned by an unrelated session, preserving its bytes-unchanged assertion while keeping unknown Lease state fail closed; the ME-3A suite passes `5/5`.
- The external semantic review is single-use by policy and is not rerun. After the corrected subject passes deterministic gates, closeout requires the contract's explicit Human `user_waiver` acceptance rather than fabricating an external pass.

## Verification Closeout

- Focused review regressions: `bun test tests/unit/me4a-bound-task-freeze-handoff.test.ts tests/unit/engineer-binding-store.test.ts tests/unit/me0b-engineer-acquire.test.ts --timeout 60000` — `22 pass, 0 fail`.
- Adjacent Lease/Provider regressions: `tests/coordination-lease-store.test.ts` — `50 pass, 0 fail`; `tests/unit/me3a-provider-thread-effect.test.ts` — `5 pass, 0 fail`; `tests/unit/me2a-me3b-readonly-delegation.test.ts` — `9 pass, 0 fail` when rerun without concurrent full-suite load.
- Root checks passed: typecheck, deploy SQL order, architecture sync (`blocking=0`, `dead_letters=0`), task sync, strict workflow, project-state inspection, init dry-run and `git diff --check`.
- Full repository run reached `3140 pass, 2 skip, 3 fail`. One ME-3A failure was corrected as described above; one ME-2A failure was a concurrent Codex version-probe timeout and passed alone. The remaining `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts` completes 234 assertions but times out at its fixed 120-second child-process cleanup boundary both in the full run and alone. It does not import or exercise the ME-4A TaskFreeze/Binding/Lease additions and remains a pre-existing repository-wide timing gate outside this work-package.

## Upstream ArchContext Handoff

### 1. Exact selector evidence is falsely rejected when unrelated call trails are truncated

- **Environment**: `archctx@0.4.4`, `@colbymchenry/codegraph@1.5.0`.
- **Observed path**: `loadCapabilityCodeGraphProjectionInputs` → `exactSelectorEvidence` → `entrypointTrailCalls` in `node_modules/archctx/bin/archctx.mjs`; `validateStep` then rejects any `evidence.truncated` before accepting an exact matched call site.
- **Reproduction**: `readTaskFreezeSnapshot` directly called `readEngineerBindingStatus`, and CodeGraph returned the exact sink call site, but its overall `**Calls →**` display also ended in `+ N more`. ArchContext therefore emitted `selector-evidence-truncated` and P2 remained `unprovable`. Extracting the same Binding invariant into the uniquely named, low-fanout `readCurrentTaskFreezeBinding` changed no behavior and immediately moved the capability to P2 `proven`, selectors `5/5`.
- **Root cause**: truncation is attached to the whole source-symbol call display, not to the exact `(source path, source symbol, sink path, sink symbol)` selector answer. Unrelated calls therefore poison an otherwise exact positive proof.
- **Requested contract**: add a selector-specific CodeGraph query/result, or make ArchContext distinguish `complete exact positive match` from `possibly incomplete negative/ambiguous result`. Do not raise display limits as the authority.
- **Acceptance tests**:
  1. An exact unique direct sink remains proven when unrelated source calls exceed the display cap.
  2. A missing sink with a truncated search remains unprovable.
  3. Multiple exact sink identities remain ambiguous and fail closed.
  4. Adding unrelated calls beyond the display cap does not change the selector evidence digest.

### 2. Projection apply can commit owned files before the adapter reports a post-write snapshot failure

- **Observed path**: `runArchitectureProjection` invokes `archctx projection run`; ArchContext applied the accepted docs change set and wrote a manifest containing P1/P2 `proven` plus the accepted refresh signal. Before the caller could receive the result and call `consumeArchitectureRefreshSignals`, the repo-harness provider's post-projection `assertExpectedSnapshot` observed a concurrent non-owned worktree digest change and threw `architecture projection expected snapshot mismatch after projection: worktreeDigest`.
- **Observed end state**: projection-owned files were already updated and strict `check-architecture-sync.sh` subsequently reported `pending=0 running=0 dead_letters=0 human_actions=0 blocking=0`, but the original caller had no successful result object and therefore could not consume the returned refresh signal through its normal path.
- **Root cause**: the API exposes no durable, recoverable distinction between `failed before apply`, `apply committed but postcondition observation raced`, and `apply committed plus refresh consumed`.
- **Requested contract**: expose an idempotent projection reconciliation operation keyed by the accepted change-set/event and a durable apply receipt. A retry must be able to recover the exact already-written result and refresh signals without replaying Human acceptance or applying the semantic delta twice. The receipt should bind owned-path pre/post digests and the commit point; non-owned concurrent mutation must remain visible, not be ignored.
- **Acceptance tests**:
  1. Inject a non-owned worktree mutation after projection-owned writes but before adapter post-check.
  2. First caller receives an explicit `applied-reconcile-required` shape carrying the durable apply identity, not an undifferentiated exception.
  3. Retry performs zero second writes, requires no second Human acceptance, and returns the original refresh signal exactly once.
  4. A pre-write stale snapshot still fails closed with no apply receipt.

### Priority and non-goals

- **Priority**: selector false-negative is Medium (architecture proof availability and code-shape pressure); ambiguous post-apply acknowledgement is High (governance recovery and exactly-once refresh semantics).
- **Non-goals**: do not weaken P1/P2 proof, accept truncated negative evidence, ignore concurrent mutation, infer Human acceptance, or add a compatibility fallback. The improvement is a more precise proof/reconciliation protocol.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
