# Repository automation observation

AKN-04d2 adds original automation observations to the repository-scoped snapshot. Repository envelope protocol2 requires automation summary protocol1; Fleet5 and Operator6 remain unchanged. Collector start IPC requires protocol2, and a successful result must carry automation (null for global Fleet, exact repository identity for a selected repository). The server and browser reject missing summaries and old envelope/IPC shapes. No alias or old-shape fallback is retained.

## Original authorities

Policy reports the current registered worktree's original `development_campaign` mode with a digest of the owning reader's policy value. It does not prove mode at an authorized target revision or native execution. An absent policy document is unavailable; the policy owner's default off applies only to an absent field in a valid document.

Grants come from `listStoredProgramAuthorizations` and `readStoredProgramAuthorization`, preserving target, scope, original expiry, merge mode and digest. Stored grant observation is not live authorization. Budgets come from `readAutomationBudgetBoardSlice`, whose original fold owns consumption, reserved/remaining amounts, hard-stop refusal and attention owner. The board reader now accepts and forwards explicit env to the same authority checks. The operator does no budget arithmetic. Budget reads can be unavailable when their original authorization/contract anchor cannot be verified.

Controller observations join the original run, current and head event by run/current/event digests, revision and state; they reobserve current before returning. They expose typed operation, original source attention owner, task/Claim/dispatch/runtime-effect references and source time. Protected paths, principal details, arbitrary free-text blocker/outcome and evidence strings are omitted. A free-text blocker does not become a locally guessed typed reason. Controller `executing` never implies native Agent activity or execution admission.

Campaign discovery uses stored grant Campaign IDs and original IssueBatch intents. Definitions join exact authorization ID/digest, repository, target ref and target revision. An uncreated Campaign is missing; an unreadable or mismatched chain is unavailable. Per-group decisions reuse the owning `readCampaignStepReceipts` validator, exported from the prior private parser and used by all existing call sites. The read performs no journal lock, repair or step. Receipt identity and digest remain authoritative. Different receipts with identical latest source timestamps have no total order and are refused as unavailable rather than picking a synthetic winner. Campaign events have no typed stop reason or attention-owner field, so those observations explicitly remain unavailable.

The native execution/turn observation is unavailable because no generic native admission authority reader exists for this repository scope. Neither policy mode, controller state, notification, grant presence nor budget activity fills that gap.

## Read and resource boundary

Each source reports known, missing or unavailable, its own read time, portable failure reason and original records. No raw diagnostic strings cross the transport. Source lists and receipt reads are bounded to64 returned records, group decisions to3, and the automation DTO to512KiB. Existing readers may enumerate before this count check; the d1 process deadline remains the hard execution/cancellation bound for large stores. Counts beyond the limit refuse the source instead of presenting a complete truncated inventory.

All production reads run inside d1's single provider-capable collector process and retain its same-scope coalescing, bounded queue, original provider cap and process-group/Windows Job exit boundary. The selected registry revision is checked against the Fleet observation and rechecked after automation reads. Each source head/inventory is reobserved where its store exposes a revision; the combined snapshot claims observed consistency, not a cross-store transaction or write authorization. No acquisition, step, provider, notification, ACK, record write, persistent cache or watcher is invoked by this GET.

## Verification and remaining stage gates

A new effects oracle builds actual grants, published budgets, controller runs and Campaign journals. It denies lock calls while reading, compares complete file/directory inventories, and checks original refs, privacy, identity mismatch, source isolation, count limits, missing Campaign and registry drift. Existing Campaign tests read the real persisted step receipt and match it to the repository summary. Existing budget and HTTP/IPC/browser suites cover the original owner behavior and unchanged collector lifecycle. Evidence is under `.ai/harness/runs/akn04-automation-summary/`.

CodeGraph proof and canonical/semantic acceptance remain separate gates for this worktree. This source change does not constitute native execution admission, runtime installation, stage acceptance or completion of the overall roadmap. Rollback removes summary projection and the transport revision together; no durable record migration is required.
