# Strategy repository pilot and Host wake contract

Base: 84c225c1ebfe9ce34f4e6268662714241ca0b33b.
Branch: feat/strategy-wake-pilot. Owner: Aimpact.
Authorization: parent next-phase delegation after Required/CI passed on PR 599.
Daily full, matrix and governance jobs were skipped. This is not a full-suite pass.

## P1: Map

README.md states file-backed continuity and authorized program execution.
The approved optional-strategy-memory plan states human intent authority and
export-only strategic proposals. Use those real repository sources for an
explicit pilot document. Do not write the ordinary strategy activation marker.
Host invariants assign wake and scheduling to the host. The existing automation
controller owns acquisition and dispatch, budgets and its execution receipts.
Strategy must not call that writer or create a second execution ledger.

## P2: Trace

Existing context collection binds the document and evidence to revisions and
hashes, confirms current sources and observes canonical state. Its byte quota
is fixed and its subprocess timeout is per command. A wake invocation needs a
smaller request quota and a cooperative whole-observation deadline. File IO
cannot be forcibly interrupted in-process. The host must own any hard deadline.
The controller's idempotency concerns execution. Wake coalescing here concerns
only exports; it must not reserve budgets, claim tasks or dispatch agents.

## P3: Decision

Add a strict pure in-memory wake session and one-shot export adapter. This is an
internal data contract, not an external Bot API or a scheduler. Host supplies an
epoch and monotonic sequence. Coalesce a bounded batch in sorted order, reject
conflicting identities, discard old sequences and deduplicate retained events.
A new epoch starts a new session. Old-epoch events are refused. Replayed events
in a fresh epoch can cause another read-only export; no exactly-once guarantee
survives restart. Persist no dedup cache or second ledger.

The adapter always exports packets. Capability claims remain unverified and
cannot launch an agent. It binds the selected wake to a freshly collected
context digest and validates any supplied proposal against that fresh packet.
Human intent owner and the existing controller remain the only intent/dispatch
authorities. No resume or live host effect is implemented.

Add an explicit repository-pilot CLI export using a separate canonical pilot
document owned by Aimpact. Its evidence pins README and the approved plan at the
base revision. Claims distinguish facts, intended checks and unknown outcomes.
Do not claim business success from CI. No automatic goal or memory edits.

## Steps

1. Add the pilot document and explicit document selection for context validation.
2. Add opt-in byte/deadline bounds to the existing request reader; defaults stay.
3. Add the strict pure wake contract and one-shot export adapter.
4. Test deterministic order/dedup, restart, scope, stale goals/evidence, limits,
   capability claims and no persistent effects in synthetic repositories.
5. Export one real repository pilot packet. Record evidence and limitations.
6. Run bounded affected tests, typecheck and safe projection checks. Commit and
   deliver full/delta evidence for independent review before any push.

## Limits and product decisions

No external host has supplied a sequence/epoch contract or verified read-only
and resume capability. Live integration needs that host choice and separate
approval. The pure fixture contract does not invent host endpoints. The host
owns wakes and any hard process deadline. Current acceptance replay, sparse
checkout and unselected-memory canonical-state limitations still apply.

## Initial pilot observation limit (ae012ae8)

The first canonical-state collection hit the existing byte bound in this real
repository. Do not increase that bound or substitute a partial fingerprint.
The explicit pilot surface therefore collects selected intent evidence with
state unavailable. Its proposals always block. Ordinary context and wake
adapter collection still use the canonical state owner by default. The explicit
export mode remains visible in the packet unknowns and cannot authorize work.

## Approved scoped pilot budget test

Authorization: Sentinel_6e77ef7eb810819199c69efaf45f64be, 2026-10-08 03:34 UTC.
The owner approved 128 KiB per file and 4 MiB per request for this pilot test.
These values are not a sufficiency claim. Keep standard 64 KiB/1 MiB defaults.
Validate an explicit repository-pilot profile and its fixed document path.
Run canonical collection with explicit strategy-boundaries loading. Keep the
same source confirmations, scope checks, accounting and deadline. Do not use
unavailable-state export to claim success. Measure the real context and
proposal cycle; stop and report any further bound rather than raise it.
Add boundary/default/invalid configuration regressions and deliver a local
commit plus measured artifact before another publication decision.

## Scoped-budget result

The approved file ceiling admits the required large subject files. Canonical
collection still exceeds 4 MiB during source confirmation. The command now
attempts canonical collection and fails closed; it does not substitute the
old intent-only mode. No real proposal cycle completes. Synthetic canonical
cycle and exact boundary/default/configuration regressions pass. Preserve the
measured trace in the review artifact and request a separate scope or budget
decision. Do not increase the limit again in this implementation.

## Approved per-pass source reuse

P1 map: the canonical owner reads policy and capability node text, then reads
it again for authority and source hashes. The strategy reader owns byte limits.
P2 trace: three full passes at 04e0b4a each use 206 reads for 92 files. Policy
and 56 node files each occur three times. This repeats 247,526 bytes per pass.
The fourth pass fails the unchanged 4 MiB cap. The external diagnostic plan and
CSV contain exact costs. No source bodies or providers enter that diagnostic.
P3 decision: capture these source texts inside each read-only unlocked pass.
Use the captured text for parsing and hash projection. Each next pass creates
new facts and reopens all sources. Keep four passes, source scope, required
review files, authority comparisons and final strategy checks. Do not cache
mutable files across passes. Keep ordinary writer behavior and default limits.

The owner approved this narrow implementation to complete the pilot. Add
synchronized mutation fixtures. Prove capture/hash agreement and edits between
passes. Run bounded affected checks, then commit and measure the exact real
context/proposal cycle. Do not publish before independent parent review.
