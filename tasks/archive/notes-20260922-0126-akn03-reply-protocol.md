> **Archived**: 2026-09-22 01:26
> **Related Plan**: plans/archive/plan-20260922-0113-akn03-reply-protocol.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260922-0126
> **Archive Projection V1**: `plans/plan-20260922-0113-akn03-reply-protocol.md` => `plans/archive/plan-20260922-0113-akn03-reply-protocol.md`
> **Archive Projection V1**: `tasks/notes/20260922-0113-akn03-reply-protocol.notes.md` => `tasks/archive/notes-20260922-0126-akn03-reply-protocol.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md` => `tasks/archive/contract-20260922-0126-akn03-reply-protocol.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md` => `tasks/archive/review-20260922-0126-akn03-reply-protocol.md`

# AKN-03a decisions

Full snapshots in the immutable intent are frozen recovery input, not editable authorities; the oracle requires separately read parent/ACK/event. Commit binds the intent rather than repeating principal/body fields. This keeps historical attribution separate from live resume permission.

Only a pure contract is introduced before H0. Naming the oracle result `complete` avoids claiming caller authentication; protected storage and MCP integration remain mandatory in AKN-03b. No production consumer is wired yet.

Installed SOURCE_ROOT pointed to symlink helpers and was rejected. Running the existing verified real package with SOURCE_ROOT unset uses regular packaged helper files; no gate or installation was changed.

PR #434 CI run 35629594177 failed in an existing fixture that still matches a removed literal Stop timeout expression. The production authority moved to MANAGED_STOP_TIMEOUT_SECONDS on baseline main. This is outside AKN-03a; no source/test fix is included here and hosted CI must not be claimed green.
