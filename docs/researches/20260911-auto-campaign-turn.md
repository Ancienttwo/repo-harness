# Auto-campaign conversational turn

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

`auto-campaign` is the explicit conversational entrypoint for one bounded repair
campaign turn. It is included in the full skill installation on Claude and
Codex. A turn may contain multiple model calls and worker steps; it ends at the
first verified group outcome, manual merge, exhausted budget/deadline or blocker.

The default authority is
`standard.json` (retired historical path `assets/skills/auto-campaign/references/standard.json`).
The portable draft helper calls the selected runtime's canonical grant sealer.
It emits JSON without minting a grant, starting a campaign or contacting a model.
Input provenance and operator approval remain prerequisites; a valid digest
alone is not authorization. The existing account-level grant store, budget
ledger, controller and Lease protocols remain the runtime authorities.

Resume preserves the original campaign, grant, operation identities and ledger.
It does not replenish budget or extend expiry. A stopped campaign or successor
grant requires a separate authorization decision. Manual merge returns control
to the user; subsequent explicit continuation may finish audit under the original
valid grant. No automatic next group, merge or background scheduler is introduced.

The entrypoint preserves policy and environment gates. Installation does not
activate campaign mode, enable Refactor Mode or supply host execution containment.
Missing canonical graph, publication policy, browser/worker capability or allowed
execution environment stops before provider expenditure. See the
`execution reference` (retired historical path `assets/skills/auto-campaign/references/execution.md`)
for the current CLI mapping and input authorities.

Verification covers full/minimal managed installation, both host copies,
relocated draft execution, canonical grant mint/read, invalid identity rejection
and preset binding in disposable state. These tests do not establish model
effectiveness, live campaign completion, or BRC14/BRC15 acceptance.
