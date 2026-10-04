# Reconciliation validation and terminal campaign acknowledgment

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

A reconciliation decision must never become immutable before its usage event is known to be valid. `prepareUsageCommit` checks the exact stored reservation, resolution, open-run preconditions and complete event schema. The caller then publishes the reconciliation decision followed by that same validated event. The decision still precedes the charge, so interruption cannot replace an operator's reserved charge with a cheaper observed outcome.

Late settlement does not reactivate an exhausted budget. The next projection retains the original stop receipt and `budget_exhausted` state while adding the event's charge. The original receipt remains the historical stopping observation; it is not rewritten to include a later settlement.

## Recover a previously malformed evidence digest

`automation budget repair-reconciliation` is an explicit operator action for a previously recorded `reconciled_reserved` decision whose evidence digest is malformed. It is not a budget reset or an evidence normalizer. The operator must obtain the digest from the original evidence bytes and supply the exact SHA-256 of the original reconciliation file, including its formatting and newline.

The JSON request contains exactly:

```json
{
  "automation_run_id": "<64 lowercase hex>",
  "reservation_sha256": "<64 lowercase hex>",
  "expected_reconciliation_sha256": "<SHA-256 of original reconciliation file bytes>",
  "outcome": "provider_failure",
  "evidence_refs": [{"ref": "provider-run:<original reference>", "sha256": "<SHA-256 of original evidence bytes>"}],
  "repair_reason": "Why this digest is being corrected and how its original evidence was verified."
}
```

Preview is the default and writes no ledger or lock file:

```bash
repo-harness automation budget repair-reconciliation --repo <repo> --from <request.json>
```

After reviewing the exact original hash, evidence, outcome and full reserved charge, the operator applies the same request:

```bash
repo-harness automation budget repair-reconciliation --repo <repo> --from <request.json> --apply
```

Apply rechecks the request under the existing run lock. It preserves the original reference names, resolution, reason and original file bytes. It refuses a valid original decision, other resolutions, changed evidence reference names, stale original hash, missing reservation, or an existing charge without the same repair receipt. It appends an immutable receipt under `reconciliations/repairs/<reservation>.json`, then the single usage event. That event references the repair receipt as well as the corrected evidence. Receipt replay binds the same request; a crash after its publication can resume without rewriting either the original decision or the repair receipt. Ordinary reconciliation and observed-usage entrypoints do not acquire a bypass.

The new receipt is an audit link, not a second accounting authority. Only usage events charge the ledger. Neither the command nor its preview invokes a provider, creates a reservation/grant, refunds usage, changes caps, or reclassifies an unknown result as observed success. Evidence repairs for cheaper resolutions are outside this command's contract.

## Acknowledge an expired campaign as stopped

An operator may append the existing `stop` operation after `authorization_expired`. The expiry event remains in the contiguous history, and the new event genuinely records a formal stop. All transitions back into execution remain forbidden. Completed and already stopped campaign behavior is unchanged.

This preserves the existing `stop_event_sha256` continuation evidence and the strict replacement gate. Stop itself does not settle a reservation: a successor with open reservations, acquisitions, drift, an active controller step, unverified authoring evidence, adoption/publication, or unresolved provider mutations remains ineligible. Only after the original reservation has a real usage event and its projection is consistent can the normal replacement preflight pass.

## Verification and operational boundaries

The pre-fix artifact at `tasks/evidence/campaign-reconciliation-recovery-pre-fix.log` captures failures for invalid-evidence persistence, loss of terminal projection on late settlement and refusal of a terminal stop acknowledgment. The named budget, campaign and CLI tests exercise no-write rejection/preview, full-reserve exact replay, interruption recovery, immutable history and continuation admission.

Source verification and a live campaign recovery are separate boundaries. Replacing an expired campaign's runtime requires an approved, verified source and current grant/target readback. Historical image or source evidence must not be relabeled as evidence for this patch. If workers are to run, their actual immutable image must have the required source/preflight evidence; an instruction to skip already completed workers does not authorize rerunning them. Never create a new grant or replacement Issue merely because a recovery attempt failed.

The architecture model follows the actual direct caller: `entrypoint.automation-budget.append` binds `prepareUsageCommit` to `sealAutomationUsageEvent` and `publishUsageCommit` to `chainAutomationLedgerDigest`. The reserve-before-act flow retains its IDs and sink contracts with the corresponding source symbols. ArchContext classifies this selector change as `entrypoint-changed` plus `verified-flow-proof-changed`; a fresh exact architecture acceptance is required. Repeated indexing, a proof-only reconciliation, or an invented approval reference cannot replace that acceptance.
