# Plan: Resume architecture projection after Stop budget

> **Status**: Executing
> **Created**: 20260916-0233
> **Slug**: projection-continuation
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Detached source and bundled hook consumer with durable queue receipt
> **Rollback Surface**: Isolated continuation code tests and docs
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260916-0233-projection-continuation.contract.md`
> **Task Review**: `tasks/reviews/20260916-0233-projection-continuation.review.md`
> **Implementation Notes**: `tasks/notes/20260916-0233-projection-continuation.notes.md`

## P1: Architecture Map

Current base d52f9a9b owns 110 seconds of architecture work inside the 140-second Stop work and 150-second managed host budgets. projection-jobs owns the queue/claims/receipts; archctx owns model and document semantics.

## P2: Concrete Trace

Host deadline -> typed host-budget yield -> pending with refunded attempt -> Stop finishes recovery writes and gates -> detached one-shot drain with its own configured provider budget -> exact durable receipt.

## P3: Decision

Reuse existing queue ownership and provider contracts. No daemon, second retry state, semantic authoring, publication or budget changes. Strict Stop remains strict. Drift cursor remains with the original Stop/explicit-drain CAS. Process failure remains observable; this is not an always-on scheduler.

## Task Breakdown

- [x] Prove the missing consumer with a current-base failing regression.
- [x] Implement source and bundled continuation, preserving policy/claim/gate behavior.
- [x] Verify parent-exit survival, duplicate consumers, failure/manual policy and actual archctx receipt in a disposable fortune-algo copy.
- [x] Prepare canonical verification evidence and finish the existing evidence-only review.
- [ ] Complete the approved formal AcceptanceReceipt and local integration/archive boundary.

## Evidence Contract

- State/progress path: this Task Breakdown.
- Verification evidence: contract, notes and `.ai/harness/runs/projection-continuation/`.
- Evaluator rubric: real detached source/bundle process completion and provider receipt; no new authority or publication.
- Stop condition: local source implementation plus canonical checks and the existing review complete; report install/release boundary.
- Rollback surface: this isolated worktree's continuation code, tests and documents.

## Promotion Gate

- Merge/PR unit: one cross-process continuation slice; local integration approved on 2026-09-16; publication/install outside this boundary.
- Rollback surface: hook wrapper, typed yield and standalone consumer.
- Verification boundary: detached lifecycle and exact queue receipt.
- Review/acceptance boundary: one read-only review, then evidence-only resolution.
- High-risk surface: process lifetime and queue ownership.
- Why not checklist row: independent process acceptance and rollback boundary.

## Base and scope

Worktree was fast-forwarded to concurrently completed d52f9a9b before final verification. Prior 20-second budget results are historical. Current process tests inject host-only clock expiry and let children use the real policy deadline, avoiding long artificial sleeps. Product code is frozen. No dependency change; local candidate commit and formal closeout are approved. Push, publication and global installation remain outside this version boundary.

## Local completion boundary

Implementation and local verification are complete. The user approved formal closeout and local integration on 2026-09-16. Complete canonical acceptance and archive using the frozen product/test evidence. Publication and installation remain a separate version boundary. No installed runtime update is claimed.
