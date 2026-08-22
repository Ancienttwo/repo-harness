# Plan: Merge Readiness V1

> **Status**: Archived
> **Created**: 20260822-2240
> **Slug**: merge-readiness-v1
> **Planning Source**: codex-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: prd:fleet-acquire-publication-readiness#module-4
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260822-2240-merge-readiness-v1.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260822-2240-merge-readiness-v1.md`; after execution revert branch `codex/merge-readiness-v1` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260822-2240-merge-readiness-v1.contract.md`
> **Task Review**: `tasks/reviews/20260822-2240-merge-readiness-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260822-2240-merge-readiness-v1.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: prd:fleet-acquire-publication-readiness#module-4
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260822-2240-merge-readiness-v1.md`
- Sprint contract: `tasks/contracts/20260822-2240-merge-readiness-v1.contract.md`
- Sprint review: `tasks/reviews/20260822-2240-merge-readiness-v1.review.md`
- Implementation notes: `tasks/notes/20260822-2240-merge-readiness-v1.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260822-2240-merge-readiness-v1.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260822-2240-merge-readiness-v1.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260822-2240-merge-readiness-v1.md`.

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
- Contract file: `tasks/contracts/20260822-2240-merge-readiness-v1.contract.md`
- Review file: `tasks/reviews/20260822-2240-merge-readiness-v1.review.md`
- Implementation notes file: `tasks/notes/20260822-2240-merge-readiness-v1.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260822-2240-merge-readiness-v1.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260822-2240-merge-readiness-v1.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260822-2240-merge-readiness-v1.md`; after execution revert branch `codex/merge-readiness-v1` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260822-2240-merge-readiness-v1.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260822-2240-merge-readiness-v1.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260822-2240-merge-readiness-v1.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260822-2240-merge-readiness-v1.contract.md`, `tasks/reviews/20260822-2240-merge-readiness-v1.review.md`, and `tasks/notes/20260822-2240-merge-readiness-v1.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260822-2240-merge-readiness-v1.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260822-2240-merge-readiness-v1.md`; after execution revert branch `codex/merge-readiness-v1` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria

Implement PRD v3 WP1 `MergeReadinessV1` as one read-only, per-invocation publication verdict keyed by `publication_id`. The command joins the immutable receipt and current reviewing pointer with local effective workflow evidence, live GitHub PR/check/review/thread facts, integration mode, and canonical task revision. It emits `ready:true` only when every frozen predicate passes and otherwise emits typed blockers with `attention_owner`.

Success means:

- Draft, closed, head-moved, base-moved-since-verification, review-subject drift, stale/failed checks, missing acceptance, missing required reviews, unresolved changes-requested/thread state, non-mergeable state, task-revision drift, and pointer/claim mismatch can never produce `ready:true`.
- `expected_head_sha` and `expected_base_sha` are always present in a successful verdict envelope, including blocked verdicts.
- Provider observations use a bounded torn-read protocol: mutation-relevant identity is observed before and after the joined facts; one change retries, a second change yields `changed_during_read` without mutating repository or lease state.
- Provider unavailable and malformed provider data fail closed with typed output.
- `publication readiness --publication-id ... --json` is the single-publication entrypoint and `fleet ready --json` aggregates current reviewing publications without persisting readiness authority.

## Scope

- A strict pure `MergeReadinessV1` contract, blocker codes, ownership classification, canonical validation, and deterministic projection.
- GitHub read adapter for PR identity/state/draft/base/head, head-specific checks, review decision, unresolved review threads/changes-requested state, and mergeability.
- Effect orchestration resolving receipt cache/marker, current reviewing pointer, canonical sprint revision, effective workflow evidence, integration mode, and the bounded provider double-read.
- Publication and fleet CLI JSON surfaces for single and aggregate readiness.
- Focused pure/effect/CLI tests, negative fencing cases, full repository verification, independent review, and AcceptanceReceipt closeout.

## Out of scope

- WP2 `TaskOfferV1`, `fleet offers`, `fleet acquire`, worktree creation/bind, MCP mirroring, authorization envelopes, and race retries.
- Provider feedback persistence, Task Inbox, board columns, daemon polling, auto-merge, remote claim refs, or any lease mutation.
- A persisted `ready` flag, provider cache authority, heuristic adoption, compatibility aliases, or changes to `COORDINATION_PROTOCOL` and task digest inputs.
- Provider merge-queue delegation for base movement unless an existing explicit repo policy field is found and proven authoritative; absent that evidence, base movement fails closed.

## P1 architecture map

- `src/core/publication/` owns the pure readiness contract and deterministic verdict projection.
- `src/effects/publication/` owns receipt/pointer resolution, canonical task/effective-state evidence, GitHub observations, integration classification, and torn-read orchestration.
- `src/cli/commands/publication.ts` owns the exact-publication JSON command; a narrow fleet command module may own aggregate read-only output if no existing owner exists.
- `src/effects/state/coordination-lease-store.ts` and canonical sprint readers remain the only lease/task authorities and are read only.
- `src/effects/state/resolve-effective-state.ts`, verification evidence, review subject, merge seal, and publication receipt remain authoritative inputs; WP1 does not synthesize missing evidence.

## P2 concrete traces

1. Single readiness: `publication_id` -> resolve the canonical cached receipt (or decode the live full-payload marker in memory for explicit `--pr`) -> read reviewing lease and exact `current_publication` -> first provider identity snapshot -> collect live provider checks/reviews/threads/mergeability -> resolve canonical task/effective-state/integration facts -> second provider identity snapshot -> retry once if identity changed -> project verdict/blockers -> emit JSON, with zero writes.
2. Head fence: receipt head differs from either stable provider identity snapshot -> `head_moved`, `ready:false`, `attention_owner=agent`.
3. Base fence: stable provider base differs from receipt verified base -> `base_moved_since_verification`, `ready:false`; no local target ref or mergeability claim overrides this.
4. Torn read: first/second mutation-relevant provider identity differs twice -> `changed_during_read`, `ready:false`, exact expected head/base still reported.
5. Aggregate: enumerate current reviewing pointers in deterministic canonical order -> evaluate each independently -> preserve typed per-publication failures instead of allowing one unreadable publication to invent readiness for another.

## P3 decision rationale

- Readiness is an ephemeral proof, not authority: every invocation reconstructs it from canonical immutable/local/provider inputs and writes nothing.
- Receipt head/base are the verification fence. Provider mergeability or a locally advanced ref cannot silently refresh that proof.
- Keep pure projection separate from effects so every blocker combination is exhaustively testable and provider torn reads remain visible at the boundary.
- At 10x scale the first pressure is serial GitHub latency; bounded aggregation and deterministic ordering are sufficient for WP1, while caching/daemon work remains deferred.
- This is the smallest coherent slice because WP2 can consume one stable readiness contract without mixing acquisition mutation or MCP transport into its proof boundary.

## Failure and rollback

- Missing/malformed receipt, pointer, canonical task, local evidence, or provider fact returns a typed fail-closed result and performs zero lease/task/provider mutation.
- Unsupported provider states are blockers, never inferred as safe.
- Revert WP1 as one unit; WP0-A/B/C publication identity, lifecycle, and reconcile remain intact.

## Task Breakdown

- [x] Add strict pure MergeReadinessV1 contracts, blocker vocabulary, attention ownership, and deterministic projection.
- [x] Add bounded GitHub observation and joined receipt/pointer/canonical/effective/integration readiness effect with one retry on torn reads.
- [x] Wire exact-publication and aggregate JSON CLI surfaces without adding WP2 offers/acquire or MCP.
- [x] Add draft/head/base/check/review/thread/mergeability/revision/pointer/provider/torn-read regression tests.
- [x] Run focused tests, root required checks, Change Assessment, independent review, and AcceptanceReceipt finalization.

## Verification

- Focused readiness pure/effect/CLI tests created by this package.
- Existing publication receipt/lifecycle/reconcile, effective-state, coordination lease, and CLI contract tests.
- `bun run check:type`, `bun test --timeout 60000`, and all root required checks from `AGENTS.md`.
- Independent gatekeeper review and exact-subject AcceptanceReceipt.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add strict pure MergeReadinessV1 contracts, blocker vocabulary, attention ownership, and deterministic projection.
- [x] Add bounded GitHub observation and joined receipt/pointer/canonical/effective/integration readiness effect with one retry on torn reads.
- [x] Wire exact-publication and aggregate JSON CLI surfaces without adding WP2 offers/acquire or MCP.
- [x] Add draft/head/base/check/review/thread/mergeability/revision/pointer/provider/torn-read regression tests.
- [x] Run focused tests, root required checks, Change Assessment, independent review, and AcceptanceReceipt finalization.
