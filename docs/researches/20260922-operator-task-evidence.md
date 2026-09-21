# Operator task context and steer evidence

AKN-05b connects existing context/activity GET protocols to the shared task detail. App supplies repository/task/revision and explicit refresh generation. TaskEvidence owns two independent read lifetimes and strict decoders; request scope changes hide obsolete data before effect cleanup, and abort prevents late completion even from a transport that ignores cancellation. Context rejection leaves historical activity readable. Existing Composer and TaskDiff retain their keys and write fences.

Context displays the canonical goal, acceptance text, exact preparation blockers and owners, observed time, registered-worktree plan proof and recorded Claim. Missing proof remains missing. A Claim is not proof of a running native execution or current authority.

Activity renders original untrusted text, historical task revision, sender, provenance, per-recipient receipts and recorded reply chain/actor. Delivered or acknowledged never means adopted. A reply with recorded ClaimActor provenance remains a historical identity, not current authorization. Parent and reply controls query an exact message ID; they do not infer a thread by title or timestamp. Source metadata remains plain text, not arbitrary filesystem links.

The first task page requests50 records. Following the server cursor replaces the page; it never accumulates unbounded history in memory. Scan/bytes/deadline/output limits remain visible as partial coverage, even with zero entries. An exact message lookup only claims its requested message scope. Refresh retains same-query observations with a historical warning; changing task revision resets page selection. All UI reads are observation-only; no deliver, ACK, controller step or message POST is called.

This slice does not implement three-view navigation, target-scoped message admission or periodic refresh. It does not establish native execution admission, complete AKN-05, runtime installation or the full automation journey. Those remain active roadmap requirements.

## Shared overlay detail

The same modal exists only while a Task is selected:720px wide on a desktop viewport and full-screen below900px. CSS owns resizing; no responsive JavaScript remount or modality change can replace Composer or its draft identity. The main content keeps the former repository stage/health overview and idle collaboration context in a secondary disclosure. The selected Task still owns the original collaboration read and its cancellation.

The detail header includes observation refresh because the background refresh control is covered by the modal. Focus starts at Close, Tab stays inside, closing returns focus and body scrolling to their prior state. Escape while IME is composing or while the composer holds a draft leaves the pane mounted. Stale desaturation applies to main content only, avoiding a filtered ancestor changing the fixed overlay containing block. No new write action or admission path is added.

## Verified next data boundary

The current repository snapshot envelope contains Fleet and automation observations, while collaboration is a WorkExchange projection; neither supplies Engineer/Binding or formal Human Decision authority. Organization must redact the existing `collectEngineeringBoard` output (`src/effects/engineers/engineering-overlay.ts:245`), preserving its owner vocabulary and withholding host/thread/worktree identities.

Planning can reuse `readProjectedWorkGraphAt` / `readTrackedWorkGraphProjectionAt` (`src/effects/engineers/scheduling.ts:169`) for a graph tied to the canonical Sprint commit. `resolveDependencyObservation` (`src/effects/engineers/dependency-authority.ts:599`) owns satisfied/unsatisfied/authority_unavailable semantics. Current `OperatorTaskContext` has no graph revision, dependency observations, acceptance/rollback references or Decision data (`src/core/operator/task-context.ts:12`); these need an explicit read protocol before the three views can be complete.

Formal Decision has an exact-ID bounded reader, `readDecisionStatus` (`src/effects/engineers/verified-context-store.ts:437`), returning validated immutable request and current state. Its nearby transition method writes and must not be used by observation routes. Only a human can answer the formal Decision (`src/core/engineers/verified-context.ts:492`); an acceptance UserWaiverGrant is a separate authority. An inventory/discovery path for Decision IDs remains to be established before designing organization aggregation. These source observations do not establish native runtime admission.
