# Historical Task activity read contract

AKN-04b exposes stored Task messages, recipient receipts and reply-chain observations through `GET /api/v1/fleet/tasks/:repository_id/:task_id/activity`. It is an independent protocol 1 `operator_task_activity` response; Fleet 5 and Operator 6 remain unchanged.

## Authority and trace

The Operator effect resolves the repository through the strict registry, including read-only registrations, reads the existing Git-common TaskInbox, then rechecks registry authorization and repository path. The historical reader reuses canonical event/receipt validation and the reply-chain oracle. It does not require a current Task revision, Claim, Lease, Engineer Binding or active sprint. No read creates a directory or lock, delivers or acknowledges a message, invokes a provider, or changes execution state.

An exact old message therefore remains inspectable after execution authority rotates. Its recorded Task revision remains in the event. `consistency: observed` means a bounded observation of independently stored records, not an atomic snapshot or current permission to act.

The browser receives an explicit allowlist. Raw WorkEnvelopes, principal mappings, actor worktree/session paths and reply intents are not transported. `recorded_claim_actor` requires the original reply chain and matching immutable ClaimActor receipt. A missing actor or chain is `unverified`; no current Binding is substituted. Reply-chain completion records the stored protocol state and does not prove adoption or successful runtime execution. Bodies remain opaque untrusted text.

## Selectors and coverage

The request accepts `limit` (1–100, default 50), exclusive UUID `after`, or exact UUID `message_id`. Exact selection excludes both pagination parameters and normalizes to limit 1. Unknown or duplicate query keys fail. Responses echo the normalized selector and are strictly decoded in both server and browser transport.

List order is lexicographic message UUID, not timestamp chronology. A complete page discovery may return `reason: page` with the last returned ID as its cursor. Discovery budget exhaustion returns explicit partial coverage without a cursor that falsely implies progress. Exact known-message reads bypass unrelated directory history. A missing task history or exact message returns `history_unavailable`; malformed or unsafe records return `unavailable`.

Budgets are 1,000 scanned directory entries including nested recipients, 2 MiB total input, 64 KiB per record, 250 ms reader elapsed time after registry/Git identity resolution, and 1 MiB serialized output. Nested reply/actor reads share the budget. Exhaustion reports `scan`, `bytes`, `deadline` or `output`. At tenfold history volume, list discovery reaches this explicit ceiling first; exact known IDs remain accessible subject to their own nested budgets. There is no secondary history index or journal.

## HTTP and process lifecycle

The GET reuses loopback Host/Origin and method guards. A Node worker isolates synchronous filesystem reads. Admission is held until actual worker exit, including after timeout or disconnect. Server shutdown cancels reads and awaits native worker completion. Injected asynchronous readers receive AbortSignal and retain admission until their promise settles. The browser transport uses `no-store`, propagates AbortSignal and rejects mismatched response identities. Failures expose typed codes without internal paths.

## Verification and rollback

`tests/effects/operator-task-activity.test.ts` covers historical exact reads with no live execution authority, completed/interrupted/missing provenance, unchanged store bytes, registry isolation, unsafe paths, pagination and nested scan/input/output ceilings, strict decoding, and a real HTTP worker. Existing Operator server tests cover method/Host/Origin/query guards, cancellation and held admission. Existing Inbox/reply/actor and browser/write-inventory suites protect the owning boundaries. Canonical execution is declared only in the stage contract's Verification Plan.

Rollback removes the new GET, transport and historical reader together. It preserves all existing event, delivery, intent, commit and ClaimActor bytes. Activity UI presentation and live Task context are subsequent roadmap slices.

## Empty canonical bodies

TaskMessage and authenticated TaskReply allow an empty UTF-8 body. Activity transport validation preserves this exact contract, including the8KiB ceiling, while metadata fields retain their nonempty requirement. An authentic persisted empty reply previously returned503 through the production HTTP worker; the regression now requires200, unchanged body digest and recorded ClaimActor provenance, with unchanged store bytes. The boundary also accepts an8192-byte multibyte body and rejects8193 bytes.
