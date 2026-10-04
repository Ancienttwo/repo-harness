# Pipeline observer

The pipeline CLI owns one SQLite ledger on the authority host.
Its key is `(source_host, repository_id, task)`.
Record CAS uses `state_version`. Snapshot publication uses `(epoch, commit_seq)`.
Every committed ledger mutation updates the store commit sequence in the same transaction.

The original source-host APIs own request, result and verification facts.
The ledger invokes them before a write transaction.
An unavailable source produces an explicit telemetry gap.
A caller cannot grant verified status with a payload label.

The writer copies a complete generation with `VACUUM INTO`.
It reads the watermark from that copy.
It checks integrity and digest before publication.
SQLite serializes the publication guard and the atomic pointer rename.
A published file never changes. The writer retains published and crash-orphan generations.
It removes only its own failed or losing unpublished copy.
An unchanged watermark creates no copy.

All read paths use the published copy with SQLite `immutable=1`.
They never open the live WAL store.
The operator API exposes GET and HEAD only.
The organization view shows the CLI projection and bounded details.
The pure board wire decoder has no Node or record-schema dependency.

The observer has no imports in live dispatch, notice, merge or cleanup consumers.
It does not suppress delivery. It does not run checks, merge, remove worktrees or delete branches.
Its gates describe ledger admission only.
