# Shadow ledger fixture timing

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Shadow-budget tests exercise the real issue observer and durable reservation/usage stores around a modeled GitHub runner. The shared adoption fixture's1000ms GitHub deadline also measures filesystem-backed ledger work. CI34381786394 failed on the initial observation before the stale-terminal regression reached its assertions; this was unrelated to the corrected C7 assertion, which passed.

The shared fixture now accepts an optional GitHub deadline with its1000ms default unchanged. Only the shadow ledger suite selects20000ms, bounded by its existing20-second test timeout. Its stale-terminal case injects one1100ms modeled read: the original fixture fails with `GitHub refresh exceeded deadline_ms`, while the corrected case reaches the assertions that a later read invalidates the prior terminal and consumes no additional provider calls during rejection.

This adjusts fixture timing only. Product deadline arithmetic, real campaign policies and grants are untouched. The external-source GitHub adapter tests continue to verify actual deadline failures. Focused evidence is captured in `tasks/evidence/shadow-fixture-deadline-pre-fix.log`; all other adoption fixture consumers retain their original policy.
