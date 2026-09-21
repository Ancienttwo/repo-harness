# Operator task context and steer evidence

AKN-05b connects existing context/activity GET protocols to the shared task detail. App supplies repository/task/revision and explicit refresh generation. TaskEvidence owns two independent read lifetimes and strict decoders; request scope changes hide obsolete data before effect cleanup, and abort prevents late completion even from a transport that ignores cancellation. Context rejection leaves historical activity readable. Existing Composer and TaskDiff retain their keys and write fences.

Context displays the canonical goal, acceptance text, exact preparation blockers and owners, observed time, registered-worktree plan proof and recorded Claim. Missing proof remains missing. A Claim is not proof of a running native execution or current authority.

Activity renders original untrusted text, historical task revision, sender, provenance, per-recipient receipts and recorded reply chain/actor. Delivered or acknowledged never means adopted. A reply with recorded ClaimActor provenance remains a historical identity, not current authorization. Parent and reply controls query an exact message ID; they do not infer a thread by title or timestamp. Source metadata remains plain text, not arbitrary filesystem links.

The first task page requests50 records. Following the server cursor replaces the page; it never accumulates unbounded history in memory. Scan/bytes/deadline/output limits remain visible as partial coverage, even with zero entries. An exact message lookup only claims its requested message scope. Refresh retains same-query observations with a historical warning; changing task revision resets page selection. All UI reads are observation-only; no deliver, ACK, controller step or message POST is called.

This slice does not implement three-view navigation, target-scoped message admission or periodic refresh. It does not establish native execution admission, complete AKN-05, runtime installation or the full automation journey. Those remain active roadmap requirements.
