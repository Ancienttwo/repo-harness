# Windows persistence in the protected Task reply chain

Status: user-approved bounded repair, implemented in an isolated worktree; integrated native CI passed on `e3d86d48`, while canonical verification and acceptance remain pending. This extends the full agent-first Kanban refactor only enough to unblock its existing real Task Inbox lifecycle.

## Evidence and source ownership

At baseline49c5f9dc, [CI35749499343](https://github.com/Ancienttwo/repo-harness/actions/runs/35749499343) passed full Test, Governance, Linux and macOS. Windows job106819723526 failed31 cases:30 entered binding-store directory fsync from withEngineerLock during Task reply fixture setup;1 entered coordination-lease-store from createLeaseDirectory. Neither source was modified by the portable Inbox package. This failure is a real production dependency, not an illegal-filename fixture to omit.

The owning fixture creates real authorities and calls real effects:

```text
Binding -> Principal enrollment -> Lease creation/owner -> ClaimActor receipt
    -> send -> protected consume -> ACK -> reply intent/event/commit -> readback
```

Bindings and claim actor receipts are rooted in the Git common directory; Principal mappings are in the configured runtime home; Lease records share the Git common directory. Existing exclusive locks and canonical record validators own identity and authorization. The repair does not add another identity or persistence authority.

Four stores had the same unconditional directory fsync shape. Following the chain also found Principal publication writing exclusively by path, closing, then reopening the file O_RDONLY for fsync. [Microsoft FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers) requires a write-capable handle. The pre-fix regression applies these syscall restrictions to real Principal enrollment: a zero-byte write to the descriptor fails EBADF on the old read-only handle, without changing any stored bytes. This simulated restriction is a local regression oracle; actual Windows CI remains required.

## Repair and invariants

The existing low-level evidence/atomic-append owner now supplies syncDirectoryDurably to Binding, Principal, Lease and ClaimActor. It selects the platform before making a syscall: POSIX opens the directory with O_NOFOLLOW, flushes and closes; Windows omits the unsupported directory operation. All actual file flushes remain mandatory. POSIX errors propagate; Windows file errors propagate. There is no catch-and-ignore EPERM behavior.

Principal publication holds the exclusive O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW descriptor through canonical write and fsync, then closes before the existing atomic rename. Failed file flush preserves the prior mapping; the existing cleanup removes its temporary file. Mode0600, canonical bytes, idempotency, store locks, symlink checks, auth revocation and exact Lease/ClaimActor pairing retain their owners.

The shared helper has four observed consumers and protects the same platform syscall invariant. It adds no command, setting, dependency, data format or migration. The already compliant Inbox and checkpoint owners remain unchanged. This is not a whole-repository storage redesign.

Windows file flushing and the existing exclusive/atomic publication patterns do not establish POSIX-equivalent directory power-loss durability. This is the same explicit platform boundary already documented for Task Inbox cutover. No volume flush, elevated privilege, filesystem rewrite or invented fallback is introduced. At10x load, existing synchronous file writes and per-authority locks remain the first throughput constraint; this change adds no scans or retained state.

## Verification boundary

The existing Principal suite covers the pre-fix writable-handle regression, real enroll/revoke readback and failure before replacing an authority. The existing Lease suite injects a POSIX directory-flush failure while retaining real mkdir/write operations, requiring the error to propagate and the incomplete lease to remain unknown. Binding and protected Task reply suites exercise the cross-module owners; Inbox/migration suites retain upstream regression coverage. No new test file is introduced.

Existing native CI must prove actual delivery/ACK/reply, migration refusal/recovery, and revocation behavior on Windows, macOS and Linux. Local simulations or a Linux full-suite result do not substitute for this evidence. Capture canonical verification once the source is frozen; perform one independent semantic review on that subject and preserve any subsequent finding rather than requesting another review.

## Authorization and delivery

The owner approved this separate persistence repair after the Windows blocker was reported under the out-of-scope stop rule. It is stacked on PR443. Acceptance of this package permits continued PR443/reader integration; it does not authorize main merge, global installation, real data migration, Host admission, Campaign activation or a canary. The package rollback is a code revert; stored schemas and canonical bytes do not change.

## Native fixture corrections

[Run 35755604887](https://github.com/Ancienttwo/repo-harness/actions/runs/35755604887), source head `eb8195e3`, passed full Test, Governance, Linux and macOS. Windows completed with 200 pass, 6 skip and 4 fail. The original directory-flush failures were gone and the native deep-path delivery/ACK/reply case passed. Three expiry tests never injected expiry because their descriptor spy compared native paths against a directory plus literal `/`; using `dirname` preserves the exact staging-directory match on each platform. The scan-budget test reached the independent 250ms deadline before its 1,000-entry limit on Windows. Its synchronous scan/byte assertion now fixes `Date.now`, restoring it before the actual MCP recovery. This isolates the intended budget without changing the production deadline, reducing history, replacing real effects or loosening assertions. Native CI on the corrected fixture remains required.

## Sibling scan boundary

Native follow-up [run 35756978653](https://github.com/Ancienttwo/repo-harness/actions/runs/35756978653), source head `ec1b2e74`, passed full Test, Governance, Linux and macOS. Windows confirmed all three corrected expiry injections and both exact-parent budget-recovery cases, but finished with 190 pass, 6 skip and 14 fail. Ten failures came from the upstream migration inventory's hard-link check; their cause requires separate evidence in the existing PR443 package. One remaining sibling scan/byte assertion raced the deadline, and three process-recovery cases were killed by their explicit 20-second test limit. The former receives the same assertion-local clock control; the latter receive a 60-second test limit with their actual child exit, stored state and recovery checks retained. No product deadline changes. That run remains a recorded failure; the subsequent corrected-source result is recorded below.

The named directory-flush scan found16 remaining unguarded helpers outside this observed reply chain: external-sources/store; fs-transaction; automation/development-campaign-store, issue-batch-store and budget-store; engineers/module-inbox, verified-context-store, task-freeze-store, interface-change-store, delegated-run-store and agent-runtime-effect-store; publication/feedback-store and publication-receipt; state/coordination-claim-token; integration/product-acceptance; collaboration/record-store. Engineers/work-demand-store and automation-attempt-store additionally inline the same operation. These18 sites are deferred Windows mutation risks, not proof that this package makes every Windows workflow writable. They require their own owner/runtime trace before changing semantics. The current real reply chain does not invoke those writes; claim acquisition, Campaign and other mutation workflows are separate boundaries. Inbox layout and checkpoint stores already select the Windows syscall boundary explicitly and are safe to leave for this repair.

## Integrated native result

[Run 35759847282](https://github.com/Ancienttwo/repo-harness/actions/runs/35759847282) passed on exact integrated source `e3d86d480fb09a96a670243fd1a3aa8b018e97c3`, including upstream exact-stat repair `6167e895`. Governance, full Test, Windows, macOS, Linux and Required / CI succeeded. Windows ran 212 cases across 15 files: 206 passed, 6 existing platform-specific cases skipped, none failed. Both precision regressions, actual deep-path delivery/ACK/reply, all staging-expiry tests, scan/byte limits and process recovery passed. One process-recovery case took 22.85 seconds, exceeding the old 20-second test limit while completing correctly under the bounded replacement.

This proves the combined candidate's covered native behavior, not standalone acceptance of upstream PR443 without its persistence dependency, Host admission, real data migration or the full Kanban program. It also does not reveal the earlier runner's raw stat values. Canonical architecture/verification evidence and this package's one independent review remain prerequisites to acceptance. Later evidence-only publication commits must cite this CI-tested source and identify their documentation delta rather than claim a new exact-head full run.

## Review disposition and upstream correction

The single independent codex-plugin review of subject `c34055e0e40205783e955c94f78760c72a39d510ad30bf8eb1b7ef8e0309d7ff` returned one P2 in the upstream migration: rollback retained a prepared forward receipt, blocking a fresh migration after new v1 history. The provider's advisory PASS mapping was not recorded as acceptance. A real-filesystem regression reproduced the conflict. PR443 correction `271f4d31` now removes only a validated single-link exact receipt or prefix before rollback changes either tree; conflicting and multiply linked preparations remain untouched. The owning 48/48 tests passed. The correction is integrated here, and becomes the source verification/rollback base retained by this Windows package.

The earlier canonical 16/16 and native `e3d86d48` results predate that correction. Corrected-source canonical and native verification, followed by exact owner acceptance, are required before integration continues. Neither package's consumed independent review is repeated. This does not expand the Windows persistence claim beyond the four documented stores.

## Later migration recovery correction

An independent review of the stacked Task Evidence candidate found a separate one-shot Inbox migration durability gap. After a complete staged write but failed file fsync, `writeOwned` treated readable equal bytes as complete on resume; the forward transaction could then publish a receipt after only directory flushes. The pre-fix fault injection in `tests/effects/task-inbox-layout-migration.test.ts` returned committed without retrying the failed file flush (`PRE_FIX_EXIT=1`). The bounded repair in the independent `task-inbox-migration-reflush` work-package reopens only the exact single-link transaction file with a writable handle, rechecks inode and bytes, and requires successful fsync before receipt publication. Complete prepared metadata and a published-but-receiptless tree receive the same recovery fence. This does not retroactively establish durability for already issued receipts and does not change the other deferred Windows mutation stores listed above. The package's current canonical and hosted evidence must be read from its own contract/PR before claiming acceptance.
