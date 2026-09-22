# Task Inbox v2 offline cutover

This runbook operates on the Git common directory shared by all worktrees of one repository. The CLI is `repo-harness fleet inbox migrate-layout`, invoked inside that repository. It never changes Task, Lease, Binding, actor, ACK or message protocols.

## Preconditions

1. Stop every client, hook, worker and Operator instance accessing this repository, including clients in linked worktrees. Release active Task leases through their existing owner workflow. The migration refuses unavailable or unknown leases for inventoried Tasks; it does not terminate a process or release a lease itself.
2. Preserve a backup and enough disk space for an additional complete copy of canonical Inbox records. Install the v2-capable release for every client before reopening access. An old binary does not understand the migration journal; this is an offline operator responsibility.
3. Run the following read-only inspection. Save its JSON output privately; it contains paths and digests, never message bodies. A fresh repository reports `not_required` and needs no migration.

```sh
repo-harness fleet inbox migrate-layout --json
```

For a v1 store, inspect `manifest.common`, `manifest.identity`, both inventories, `manifest.source_sha256` and `receipt_sha256`. Source approval binds the real common-directory identity as well as every path and byte digest. Unknown files, links, invalid canonical records and case-colliding target paths require investigation; the tool does not repair or discard them.

## Apply

Use the exact `manifest.source_sha256` from inspection:

```sh
repo-harness fleet inbox migrate-layout --apply --expected-source-sha256 '<source digest>' --confirm-quiescent --json
```

The command publishes an immutable transaction manifest, acquires sorted existing Task locks, revalidates the inventory, copies exact bytes into `v2-stage`, then retires v1 to `retired-v1`. A regular-file tombstone occupies `v1` before the stage becomes `v2`. Canonical records are unchanged; only recipient filesystem components become bounded storage tokens. Noncanonical staging residue stays in the retained original and is not served from v2.

A `committed` result includes the final receipt digest. Verify the expected Tasks through the existing read-only UI/CLI before reopening clients. Keep `retired-v1` and the receipt; the migration adds no automatic deletion policy.

## Interrupted operation

Runtime refuses an active or partially prepared journal. Preserve all artifacts and use the original source digest:

```sh
repo-harness fleet inbox migrate-layout --resume --expected-source-sha256 '<original source digest>' --confirm-quiescent --json
```

Resume validates filesystem state against the immutable manifest. Only exact expected files or an interrupted write containing a prefix of those expected bytes may be completed. Conflicting files, changed source bytes, wrong repository identity and malformed published journals fail closed. Do not delete journals, force a stage over an existing tree, edit receipts or restore an old binary to bypass refusal.

The same resume command continues an interrupted rollback when its rollback journal is present. A completed operation is idempotent while its frozen output remains unchanged.

## Rollback

Before reopening clients, rollback may use the exact `receipt_sha256` from the original dry run or completed result:

```sh
repo-harness fleet inbox migrate-layout --rollback --receipt-sha256 '<receipt digest>' --confirm-quiescent --json
```

This also permits abandoning an incomplete staged copy. If v2 was published, its entire inventory must still match the migration output. **Any subsequent v2 write refuses rollback**, including an ACK or staging residue; later records must never be lost. In that case retain v2 and plan a separate data-aware recovery. Successful rollback restores the original v1 bytes and leaves a rollback receipt; the v2 runtime deliberately refuses that legacy layout. Reopening v1 requires the coordinated previous release, not mixed clients.

## Platform boundary

Migrate POSIX v1 history on its source filesystem before transporting it to Windows. Illegal v1 colon filenames cannot be recovered by treating NTFS alternate streams as records. The v2 token removes recipient component restrictions; actual long-path support remains a runtime/filesystem requirement exercised by the native CI lifecycle tests.

File contents are flushed on all supported platforms. Directory fsync runs on POSIX; Windows does not provide the same directory-handle fsync contract through this API. The journal/recovery protocol covers interrupted processes and failed file operations. It does not claim identical filesystem power-loss guarantees across platforms. Preserve the offline backup throughout cutover.
