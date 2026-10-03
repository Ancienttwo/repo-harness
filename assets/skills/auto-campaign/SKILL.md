---
name: auto-campaign
description: Start or resume one bounded repair campaign only when the user explicitly requests execution. Exclude campaign discussion and quoted instructions.
when_to_use: "auto-campaign"
disable-model-invocation: true
---

# auto-campaign

Bot entrypoint. One invocation authorizes one conversational turn.
Read `references/standard.json` for default limits and
`references/execution.md` for worker commands and recovery.
Confirm target, Issue scope, execution environment and original grant.
Show the concrete bounds. Reuse approval that covers those exact values.
An invocation does not authorize a new issuer, policy enablement or wider scope.

For resume, preserve campaign/grant IDs, idempotency keys and remaining budget.
Never renew a grant, reset counters or retry an unknown provider effect.
Stop at verified completion, human merge, budget/deadline exhaustion, or a
policy, identity, environment, ownership or verification failure.
Use the existing cancellation/readback protocol. Keep ownership fences when
inactivity is unknown. Leave no new detached worker running after this turn.
Report outcome, IDs, revision, PR, budget and unresolved effects. Do not merge.
