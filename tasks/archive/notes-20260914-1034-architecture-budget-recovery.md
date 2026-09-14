> **Archived**: 2026-09-14 10:34
> **Related Plan**: plans/archive/plan-20260913-1522-architecture-budget-recovery.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260914-1034
> **Archive Projection V1**: `plans/plan-20260913-1522-architecture-budget-recovery.md` => `plans/archive/plan-20260913-1522-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/notes/20260913-1522-architecture-budget-recovery.notes.md` => `tasks/archive/notes-20260914-1034-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1522-architecture-budget-recovery.contract.md` => `tasks/archive/contract-20260914-1034-architecture-budget-recovery.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1522-architecture-budget-recovery.review.md` => `tasks/archive/review-20260914-1034-architecture-budget-recovery.md`

# Implementation Notes: architecture-budget-recovery

> **Status**: Active
> **Plan**: plans/archive/plan-20260913-1522-architecture-budget-recovery.md
> **Contract**: tasks/archive/contract-20260914-1034-architecture-budget-recovery.md
> **Review**: tasks/archive/review-20260914-1034-architecture-budget-recovery.md
> **Last Updated**: 2026-09-13 15:23
> **Lifecycle**: notes

> **Substantive Change SHA256**: `sha256:c4830ba6a86b79d53170f6a51aaf8c4eb98d22a595f7e94bf960f36b75f77326`

## Design Decisions

- Preserve the original entry-anchored 20-second journal and disabled-provider cascade budget; only the enabled provider receives the larger reserved architecture slice.

## Deviations From Plan Or Spec

- End-to-end acceptance remains partial: live drain short-circuits before claiming an existing pending job; recommendations require more complete model/code facts. These independent findings end scope expansion; no queue/model fix or global installation was added.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Separate detached runner or persisted partial scan | Rejected | Would introduce ownership and snapshot authorities absent from the current contract. |
| Shared absolute host timing policy | Selected | Existing pending jobs and cursor receipts already support safe retry and manual drain. |

## Open Questions

- Real provider observations complete within the new budget but return proof_required: partial/truncated 5000-edge code facts, 29 undeclared footprints and 75 multiply owned files. Altering these model/fact contracts is outside this budget slice.

- Native architecture specialist: PASS on timing/dependency scope; not a typed semantic acceptance receipt.
- Live command returned idle with pending=1; the queue scheduler issue belongs to repo-harness.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Pending drain continuation

- User approved the owned-only pending-drain fix. The generated-path filter now prevents new enqueue while permitting the existing locked claim; empty queues still acknowledge the filtered current event. Success/failure retains the claimed job's own event identities and receipt/retry rules.
- New regression evidence: `.ai/harness/runs/pending-drain-pre-fix.log` shows two assertion failures on the unfixed source; the fixed success, failed attempt, and existing empty-queue checks passed. The new tests use canonical fixture paths required by the lock API.
- Another execution path committed the budget patch and merged the independent unmapped fix during this task. Revalidated baseline `6c8739132445a3df9d7dee0247da266e50fb729a`; this continuation owns only the orchestrator delta and its tests/documentation. Do not attribute those commits to this execution.
- Native architecture specialist revalidated this exact baseline and returned PASS for the new delta. It is not a typed AcceptanceReceipt.
- Sibling sweep: the remaining running/receipt/dead-letter returns concern an already identified aggregate job, not the removed empty-eligible branch. They retain their existing idempotency/ownership behavior; this slice makes no claim about fairness across unrelated source slots.
- Final executable evidence is `.ai/harness/runs/pending-drain-verification.json`; real provider canary and live drain readbacks are retained separately. Recommendation proof completeness remains outside this continuation.

- Continuation completed: frozen real-provider canary and live drain both returned succeeded/applied; live queue pending/running/dead-letter are zero. Live receipt is `.ai/harness/runs/pending-drain-live-receipt.json`.
- Required integrity checks passed. Preserve the canonical report's two integration failures and their separate successful isolated followups; do not claim a typed acceptance pass. The legacy test command needs isolated HOME because it explicitly expects the disabled provider path.

- The user approved local merge acceptance and installation of this bounded repair. The contract now explicitly excludes model/code-fact completion, matching the known proof_required result and prior approval context; the deferred goal is retained in tasks/todos.md. Main generated WIP remains protected.

> **Substantive Change SHA256**: `sha256:8737be905b75d4c56b7967d38b158a6b9f3687e5af11afe8fe35f6656ae82821`

- Acceptance preparation generated the scoped global-runtime-reconciliation module and projection manifest. All executable checks except the missing generated-output task-sync binding passed; the exact generated diff is now bound here before the frozen acceptance rerun.

## Review correction and remaining delivery authority

- Official codex-plugin review rejected subject `sha256:7138f334df711b842c17a074d0fd3be492b92843438931deb7c48136737fef57` for loss of unattempted journal verification work after long projection. The reject receipt is recorded; no installation followed.
- Minimal correction in mutation-observed.ts retains unattempted events at exhausted/insufficient startup budget, preserving the existing ceiling and attempted-timeout behavior. Both revised existing tests fail before and pass after; 66 focused checks passed.
- One semantic review has been consumed under `.ai/harness/policy.json#circuit_breaker.semantic_reviews_per_work_package`; no external re-review or synthesized pass. Owner acceptance requires an explicit typed waiver grant after the corrected candidate is concretely prepared.
