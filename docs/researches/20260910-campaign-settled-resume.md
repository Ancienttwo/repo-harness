# Settled failed campaign continuation

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

A stopped adopted campaign can author one fresh continuation using its original Issue identities after every successful acquisition has complete settled failure evidence. The stopped grant, counters, dispatches and claims are never revived or rewritten.

## Authority and admission

`campaign-authoring-resume.ts` owns the shared predicate used by `campaign prepare-resume` and actual author admission. Existing never-acquired resume and never-adopted replacement remain separate paths. For acquired sources, `campaign-worker.ts` reads the canonical planning store inventory, requires its handoff count to equal successful acquisitions, and validates each handoff against its canonical key and repository.

Every dispatch must be retired with its original host/session, have an available lease, have no recovery record, and carry an external-blocked or permanent-failure final with verifier rejection whose exact result is charged to the predecessor budget. Its task attempt must be settled. Both native worker and verifier invocation identities must match the acquisition; terminal observations are re-read from original runtime journals and output files and must match stored terminal receipts and prove inactive effects. Missing records, altered output, incomplete counts, successful finals and task closeout publication fail closed.

The acquired-source budget must have no drift, reconciliation, open reservations, active provider step or reserved provider calls. Expired runs require the existing `automation budget repair` command before admission. This does not renew their authority. A fresh grant supplies the continuation's separate bounded budget. Admission retains the existing exclusive continuation binding and original Issue identity checks.

## Operator path

After canonical dispatch retirement, lease release and campaign stop, run `campaign prepare-resume` with the stopped adopted campaign as the source, without a superseded campaign. Use its exact intent and the canonical target revision. This is a read-only source eligibility check and request projection; it does not start a provider. Bind the output through normal fresh authoring with a separately authorized grant. Keep predecessor runtime journals and output files available until admission is complete.

## Verification boundary

`tests/effects/campaign-settled-resume.test.ts` exercises modeled native container receipts, real canonical budget/lease stores, actual author admission, immutable counters and Issue identities, and exclusive competing continuations. Its admission regression fails against the previous acquisition gate; the captured failure is `tasks/evidence/campaign-settled-resume-pre-fix.log`. Existing authoring-resume and BRC10 lifecycle tests cover unchanged replacement/recovery paths. These tests do not claim a real campaign or Docker delivery pass.

The inventory is read through the existing digest-validating planning store; there is no second mutable acquisition index. At larger group counts admission reads more retained evidence, bounded by the authorized acquisition budget. Unknown or pruned evidence rejects rather than synthesizing quiescence.
