# BRC failure, observation and cleanup recovery boundaries

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## Scope and authority

The audit repair work targets issues #342–#351 against `33c5012e1185a695fdaf54a7bb84fc613cfb653b`. It preserves BRC6a's trusted revision admission fence. Native fixtures below establish controller behavior from persisted evidence; they do not prove a real paid campaign or trusted active admission.

## Failure and supervision

- Controller settlement can record a known nonzero exit or pre-spawn deadline refusal without a worker final. Exact invocation, claim, lease, role and supervised stream evidence bind the failure. Settlement does not grant inactivity or a new writer.
- Failed verifier acceptance projects otherwise successful execution into `permanent_failure`. There is no automatic transient retry policy for rejected verification.
- An expired deadline refuses before spawn. The supervisor records `started:false` and complete empty stream digests for accounting. SIGINT/SIGTERM/SIGHUP remain cancellation even if the child exits zero.
- Result files use exclusive creation and logs use no-follow opens; the caller checks the regular result file and wrapper/result exit consistency.
- JSONL operation identities reject orphan updates, type drift and terminal reuse. Unknown operation evidence cannot establish inactivity.
- The version probe runs asynchronously under the same absolute deadline and a 64 KiB output limit.

## Read recovery

`runCampaignProviderRead` in `budget-store.ts` owns durable shared read observation generations. A separate run-level read lock excludes concurrent read recovery while existing budget locks continue to own accounting.

A stable logical request identifies the operation. Each generation separately persists its exact observation request before reservation and start. This distinction matters for Git fetch: its temporary destination ref changes between closeout invocations. Neither a reservation nor its exact request may be rewritten.

Known failed observations retain their outcome and charge. Interrupted observations are reconciled at the original reserved upper bound before another generation can reserve the single open budget slot. A new caller invocation performs at most one fresh read. Budget, deadline, transient retry and stop rules remain authoritative.

Snapshot consumers replay a successful observation without new I/O or charge. Closeout and not-planned consumers explicitly request fresh observations until their semantic proof is persisted. A successful HTTP response saying a PR is still open must not permanently freeze closeout. Fresh fetches populate their new temporary refs; cached command success cannot stand in for that local effect.

The persisted mutation/readback transaction remains separate. It never resends the original mutation. An unresolved original two-call reservation is charged at its upper bound before independently metered readback recovery. This can exhaust a small failure budget; recovery does not reset that budget.

## Cleanup replay

Cleanup prerequisites are persisted outside the worktree under topology exclusion before deletion. They bind dispatch, work envelope, final, head and terminal evidence. Missing logs are permitted only when this exact prerequisite exists and the corresponding worktree is absent. Directory absence alone is not proof, and a replacement owner/worktree must still be rejected.

A frozen cleanup target is retained as historical evidence. Legitimate descendant main advancement receives a separately budgeted fresh observation and append-only target record, with remote/local equality and merge ancestry checked again.

## Verification surfaces and remaining boundary

Native regression cases cover malformed operation streams, cancelled cooperative children, expired admission, failed-child settlement replay, deletion-before-receipt crash, main advancement, mutation/readback interruption, shared read failure, read budget exhaustion, and open-then-merged closeout observation. Canonical run identities and final verification disposition belong to the task review and contract artifacts, not this document.

#342 remains unsupported: the current host does not produce trusted revocation evidence for detached command effects. Gatekeeper commands and version-probe descendants cannot gain inactivity merely from process-group quiescence. Closeout reports `cleanup_unsupported_command_inactivity` with operator attention; this work does not claim #342 is resolved. Full trusted-admission failure/cancellation matrices and a real campaign remain unverified.

No dependency was added. The shared read implementation serves GitHub and Git consumers and keeps accounting in the existing budget authority. No provider result, permission, or revision is synthesized from a semantic fallback.
