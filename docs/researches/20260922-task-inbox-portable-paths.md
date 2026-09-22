# Task Inbox portable storage layout: migration design

Status: approved implementation in progress in the isolated portable-paths worktree. Migration execution is limited to disposable fixtures; real repository data has not been migrated.

## Observed failure and ownership

Source baseline: `12518117e610007b34b9d10c94b5d92404a09ae3`, Draft PR #442. Manual CI [35710331815](https://github.com/Ancienttwo/repo-harness/actions/runs/35710331815) completed FAILURE: full Test, Governance and Ubuntu matrix passed; macOS and Windows matrices failed.

- Windows: 11 Activity tests failed creating `delivery/<message>/claim:<claim UUID>:g1.json`. Both native Windows Job cleanup variants passed. This is independent of the corrected process cancellation behavior.
- macOS: Context fixture's recursive byte snapshot opened a vanished `.git/objects/maintenance.lock`; both real blocked-Git cancellation cases passed. Keep this fixture isolation correction separate from the storage protocol.
- `src/core/fleet/task-message.ts:255` owns semantic recipient keys: claim UUID/generation, orchestrator ID, or user ID. Non-claim IDs allow upper/lowercase ASCII, digits, period, underscore and hyphen, up to 128 characters.
- `src/effects/fleet/task-inbox.ts:220,614,1076,1094,1306` uses that semantic key in delivery filenames, temporary filenames, reply-effect directories and strict historical path validation. Changing only a test fixture would disagree with production.
- Writes use the existing Task lock; historical Activity intentionally reads without a Lease/Binding lock. Some reads construct paths directly from the Git common directory, bypassing `taskInboxRoot`; all must participate in the cutover.
- Canonical messages, receipts, intents and commits have existing validators and byte serializers. Migration must reuse these authorities and never reconstruct an ACK, actor, intent or commit.

Microsoft documents `:` as a reserved filename character, warns against assuming case sensitivity and prohibits trailing periods/spaces and device names. [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file). Long path support is a separate runtime/API constraint; replacing a colon does not prove it. [Maximum Path Length Limitation](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation).

## Decision

Use one storage layout v2 on every platform. Keep all semantic recipient keys and every canonical record byte unchanged. The storage-only recipient token is:

`r-` followed by the 64 lowercase hex digits of SHA-256 over UTF-8 bytes of `repo-harness-task-inbox-recipient-path/v2`, a NUL byte, then the exact validated semantic recipient key.

Do not lowercase or normalize the semantic key. Two case-distinct identities must retain distinct storage tokens. Validate every loaded record against its expected token; a digest collision or duplicate target with different identity/bytes fails closed. No token decoding, index or semantic fallback is needed: receipt/intent fields already own identity.

The layout is rooted at `<git-common>/repo-harness/task-inbox/v2/<task ID>`:

| Surface | v2 path within the task directory |
|---|---|
| Message event | `events/<message UUID>.json` (unchanged relative name) |
| Delivery receipt | `delivery/<message UUID>/<recipient token>.json` |
| Reply intent/commit | `reply-effects/<parent UUID>/<recipient token>/{intent,commit}.json` |
| Temporary files | Existing staging subdirectories; receipt temporaries use token, never semantic key |

This changes on-disk layout only. Event/receipt/reply protocol versions, digests, IDs, ACK state, authentication fences, HTTP DTOs, read budgets and recipient sort order remain their existing authorities. Sorting by opaque filename must not replace semantic ordering.

Minimal rejected option: replace `:` with `-` in `deriveTaskMessageRecipientKey`. That changes semantic identity, leaves case-sensitive identities exposed to case-insensitive filesystems and does not bound non-claim identifier components. Percent encoding similarly leaves case collisions; per-platform encoding would create two storage contracts.

## One-shot operator surface

Extend the existing CLI owner `fleet inbox` with `migrate-layout`; repository selection remains the command's current working directory. No top-level command, global configuration, MCP mutation tool or automatic startup migration is added.

- `repo-harness fleet inbox migrate-layout --json`: read-only dry run, returning the exact source/target inventory digest, record count, byte count, target paths, preconditions and refusals. It creates no lock, directory, journal or receipt.
- `... --apply --expected-source-sha256 <dry-run digest> --confirm-quiescent --json`: explicit mutation; revalidate the entire source under locks before writing.
- `... --resume --expected-source-sha256 <original digest> --confirm-quiescent --json`: recover only the same recorded transaction after validating current files against its manifest.
- `... --rollback --receipt-sha256 <receipt digest> --confirm-quiescent --json`: offline inverse only if the serving v2 inventory is still byte-for-byte equal to the committed migration output. Any subsequent write refuses rollback; it must never drop later ACKs or replies.

Apply, resume and rollback are mutually exclusive. Quiescence confirmation records an operator prerequisite, not machine proof that every old binary has stopped. Stop all repository clients and hooks before migration and update all clients before reopening; the tool must not terminate sessions itself.

## Transaction and runtime fence

1. Resolve the real Git common directory, reject symlinks/reparse redirections and malformed layout state. Obtain one migration lock through the existing exclusive-directory-lock primitive. Publish a fixed active migration journal before waiting for sorted existing Task locks. Revalidate the task inventory after lock acquisition; a new/changed task fails before cutover.
2. Runtime v2 reads and writes reject an active migration journal. Writers check inside their existing Task lock and immediately before persistence; reads check before and after observation. Existing v1 directories produce `task_inbox_migration_required`, never an empty inbox. The public transport maps this to its existing unavailable result; the local operator error names the migration command.
3. Build a sibling v2 staging tree on the same filesystem. Validate canonical record bytes and original path-to-record identity; copy exact bytes with exclusive creation, fsync files/directories, and record source path, target path and digest in the migration manifest. Validate original partial reply chains without fabricating missing records. Preserve staging residue only in the retired backup, never promote it into serving records. Unknown files, unsafe links, conflicting identities, invalid canonical bytes or target case collisions refuse migration.
4. Verify the staged tree and recheck the source digest. Rename v1 into an operator-only retired backup, create an exclusive regular-file tombstone at the old `v1` path, then rename staged v2 to its final location. An immutable manifest binds the entire transaction; recovery validates filesystem states rather than trusting a mutable phase counter. Metadata is prepared in an exclusive sibling file before atomic publication, so partial preparation is recoverable against the exact approved source. POSIX flushes parent directories; Windows flushes file contents and uses the same process-interruption recovery protocol without claiming POSIX-equivalent directory durability. The tombstone prevents an old path-based writer from recreating v1; it is a rejection marker, not an alias or a second data source.
5. Before admitting runtime, validate the final v2 inventory and publish the receipt by completing the journal. An interrupted transaction remains unavailable until explicit resume/rollback. Resume infers nothing from a phase label alone: every source/backup/stage/target/tombstone state must match recorded digests and the allowed transition. It must not silently overwrite an existing tree or discard a conflicting record.
6. Keep the retired backup and immutable receipt outside the serving v2 tree. No automatic deletion or retention policy is added. Fresh repositories can create only v2; v1-directory reappearance or a malformed retirement marker fails closed. Ordinary GETs never initialize layout or acquire the migration lock.

Old-format parsing exists only in the explicitly invoked migration implementation. Runtime has one v2 authoring/read path plus a fail-closed legacy-presence check; no dual reads/writes, translator, fallback or in-process auto-migration remains.

Runtime layout decisions are exhaustive:

| Observed state | Runtime result |
|---|---|
| Neither v1 nor v2 nor active transaction exists | Existing valid empty-history result; a later authorized writer creates only v2 |
| Valid v2 exists, with no v1 or with the exact retirement tombstone | Read/write v2 through existing authority checks |
| v1 directory exists, regardless of v2 presence | Migration required; do not read either layout |
| Active transaction exists | Migration incomplete; explicit recovery required |
| Tombstone without v2, malformed marker, unsafe root or inconsistent transaction artifacts | Unavailable; never classify as fresh empty history |

The migration manifest binds the resolved Git common-directory identity, source and target layout versions, exact ordered path/byte-digest inventories, source digest, target digest and completed transition. The final receipt binds that manifest and output inventory. Neither artifact grants Task/Lease/ACK authority. Migration dry-run and recovery output must avoid dumping message bodies or principal credentials.

The fragile assumption is operator quiescence of old clients: their binaries do not understand the new migration fence. Task locks drain known in-flight writes and the tombstone blocks subsequent old-path writes, but cannot retroactively fence a hostile or still-running legacy process during the rename gap. Therefore this is an offline release contract, never a live migration claim.

Publication may leave a hard-linked staging file if the process exits after linking a canonical record but before unlinking its temporary name. Inventory accepts that residue only when every hard link is contained inside the same inventoried tree. External links and symbolic links are refused. The retained backup preserves the original bytes and links; v2 contains independent copies of canonical records only.

Focused implementation evidence: the migration suite covers 27 passing transaction/refusal cases, including actual process exit and injected write/rename/fsync failures. Existing reply fixtures independently prove byte/observation preservation for intent-only, event-uncommitted and complete chains without an active sprint. Native deep-path and case-distinct delivery/ACK tests pass locally; exact-head Windows CI remains the required platform proof.

## Preservation and rollback

Migration does not require an active sprint, live Lease/Binding or reauthorization of a historical actor. Those facts cannot be prerequisites for preserving old history. Existing active Task/Lease state must be quiescent for mutation; historical claims inside records are not evidence of a currently live lease. The transaction refuses live execution rather than terminating it.

Before serving v2, rollback restores the exact preserved v1 tree under the same offline fence. After v2 has served writes, automatic rollback is refused by output-digest comparison. Retaining the new runtime or preparing a separately approved data-aware inverse is then necessary. No lossy rollback, reverse semantic derivation or old/new merge is allowed.

For a Windows import of a POSIX v1 store, migrate on the source filesystem before copying the v2 store. Do not claim to recover illegal filenames from NTFS alternate streams. Native Windows tests must cover fresh v2 history and the migration states representable on Windows.

At 10x history, migration remains a complete offline inventory/copy, O(record count + bytes); normal readers retain their current scan/byte/deadline limits. Staging needs space for one additional copy of canonical records, while the original becomes the retained backup. Disk-full or permission failure leaves the original/backup intact and the active journal closed to runtime. Long-path tests must cover actual supported Bun/Windows file operations; do not shorten only fixtures or silently truncate identities to obtain green CI.

## Verification and integration

One work-package must deliver layout helper, all runtime consumers, legacy refusal, operator migration, recovery/rollback, tests and runbook together. A runtime cutover without its migration tool is not an independently shippable phase.

Use existing task-message, task-inbox, task-reply, CLI inbox, hook, Activity and MCP suites. Add one migration effects suite because interruption/recovery is a separate behavioral boundary. Assertions include all recipient kinds, case-distinct IDs, maximum legal IDs/generations, reserved-looking IDs, Windows path components, unchanged semantic keys/digests, live-lock refusal, exact empty/partial/complete history preservation, forged paths, conflicting targets, every durable interruption boundary, rollback-after-write refusal, and GET no-mutation under legacy/active/committed state.

Native Windows must run real delivery/ACK/reply and Activity reads, including 8.3/long-form Git identity and a deep path. The current Windows Job tests remain required and do not substitute for storage tests. The macOS Context fixture fix disables Git auto-maintenance at the fixture's Git invocation boundary; it must keep the byte snapshot strict rather than ignoring transient filesystem errors. The #441 task-reply deadline test issue remains separate; #442's final full Test passed and does not retroactively change #441's failed status.

Integrate the accepted package back into the #442 source branch, then into automation-summary, and only then narrow/reverify #439. New source changes require fresh canonical evidence and native CI; do not reuse `12518117` acceptance subjects. #442's consumed semantic review remains consumed and closes via exact owner acceptance after correction. The new storage work-package has its own one-review boundary. No main merge, global installation, real data migration, Host admission or canary is authorized by planning approval.

## Final inventory cross-check

A source scan at12518117 found the literal v1 root and filesystem recipient-key construction only in src/effects/fleet/task-inbox.ts; semantic key derivation remains in src/core/fleet/task-message.ts. The explicit test literals are Activity fixture setup and the no-store-write assertion in tests/cli/operator-serve.test.ts:579; the latter must move to the v2 root or its negative assertion becomes vacuous. This is a source inventory, not native migration execution evidence.

Record limits remain owned by each existing canonical validator. Ordinary events permit metadata exceeding the separate 64 KiB reply-record limit; migration preserves such valid bytes rather than importing the reply limit into another protocol. A 70,677-byte valid-event fixture exposed and guards this distinction.
