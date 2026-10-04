# Campaign supervised Lease renewal

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

This BRC10 slice connects standalone campaign execution to the existing Lease liveness authority. It does not complete the Sprint's controller recovery/reclaim requirements.

New active acquisition and dispatch require an explicitly granted controller `liveness_policy`. Historical grants remain readable without adding a default. The grant validator preserves the policy's closed fields and builder-owned digest across canonical JSON key ordering.

Each admitted child has a durable dispatch/role/Claim/generation/binding identity before its first renewal and spawn. The asynchronous bounded runner allows current-owner renewal throughout the child lifetime. Every renewal rechecks parent authorization, Engineer binding, ClaimActor and live Lease before consuming the existing liveness current CAS. A failed renewal cancels the bounded supervisor, persists the observed child result, leaves the launch and reservation unresolved, and suppresses the verifier. A completed final replay creates neither another child nor another renewal.

The supervisor reports `process_group_quiescence` with scope and state. A POSIX process-group absence observation is evidence for that owned group only. A surviving group remains active; unsupported platform observation remains unknown. Deadline expiry or sending a kill signal is not a positive termination observation. This evidence cannot prove remote-provider inactivity or the state of descendants that escaped the owned group.

No automatic reclaim consumes these observations. The current arbitrary standalone command does not register its internal provider operations with a terminal-effect authority. Full BRC10 must preserve attention for that missing evidence and separately implement exact journal-based recovery and reclaimed-worktree re-entry. Existing GitHub adapter outcome receipts and notify/wake AgentRuntimeEffect records cannot be promoted into standalone provider completion evidence.

The implementation reuses the existing bounded runner, Task lock, renewal journal, campaign planning records and budget settlement. It adds no dependency, command, daemon or persistence root. The dedicated test file covers supervisor lifetime and the policy transport regression; campaign worker integration tests use real local acquisition and child processes.
