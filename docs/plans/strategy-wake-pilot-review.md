# Strategy wake and repository pilot review

Goal owner: Aimpact. Base: 84c225c1. Follow-on branch:
feat/strategy-wake-pilot. PR 599 is unchanged by this work.

## Changes

The separate repository-pilot document pins README.md and the approved strategy
plan at 84c225c1. It states intended checks as assumptions and leaves business
success and live host capability unknown. The explicit pilot command exports
that document without creating the ordinary strategy activation marker. An
optional proposal argument validates against a fresh canonical pilot context.

The pure wake contract has exact fields, bounded identities, 32 input events,
16 KiB request bytes and 64 retained identities. The caller owns in-memory
session state. Host-assigned epoch and sequence define ordering. Coalescing is
stable across permutations. Conflicting identities fail. Old sequences do not
replace current context. A new epoch refuses old events and permits another
safe read-only export after replay. There is no durable exactly-once claim.

The one-shot adapter checks worktree identity, collects fresh context, rejects
stale wake digests and validates supplied proposals against fresh evidence.
Capability claims always remain unverified. No capability flag enables an
agent, provider, resume, task mutation or controller dispatch. The existing
controller retains dispatch and execution-budget authority. The adapter has
no scheduler, timers, daemon, queue persistence or second execution ledger.

The reader has optional smaller source budgets and a cooperative observation
deadline. The approved explicit repository-pilot profile adds 128 KiB/file and
4 MiB/request ceilings and keeps the 5 second deadline. Its fixed pilot document
path is checked before source IO. Unknown settings, invalid numeric values and
above-cap values fail. Partial settings retain the standard limits. Default context behavior remains unchanged. Commands use
the remaining observation time as their timeout. Synchronous file IO cannot be
forcibly interrupted; a hard whole-invocation deadline belongs to the host.

## Real pilot finding

The initial ae012ae8 candidate failed the standard 64 KiB/1 MiB limits and
exported intent evidence with unavailable state. That archived packet remains
historical evidence of the limited export; it is not a functional pilot.

The approved scoped-budget attempt explicitly selected strategy-boundaries and
used the same canonical owner, scope, source accounting and confirmations.
128 KiB admitted the required large files, but 4 MiB still failed during stable
state confirmation. On the instrumented pre-commit attempt, a 39,093-byte read
of resolve-effective-state.ts was rejected after 4,161,750 charged bytes. The
owner continued after intermediate errors, with 4,187,626 bytes charged at the
last recorded refusal. These counts describe a failed prefix, not a sufficient
budget. No deadline violation was recorded. No partial fingerprint replaced it.

The explicit pilot CLI now tries canonical collection and fails closed on the
actual repository rather than falling back to unavailable-state export. No real
canonical context exists for proposal binding, so a successful real proposal
cycle cannot be claimed. The final exact-commit CLI result and diagnostic trace
are included in the review archive. A further scope or budget decision is needed;
no additional raise is made. Ordinary context and wake limits remain unchanged.

## Verification

- `bun run check:type`: passed on final code and tests.
- `bun run test:files tests/strategy.test.ts tests/skill-routing-eval.test.ts tests/skill-surface/catalog.test.ts tests/state/effective-state-stability.test.ts --timeout 60000 --max-concurrency 1`:
  155 passed, 1136 assertions, four files, no skips or filters.
- State boundaries: 325 source files passed.
- Hooks: three projections passed.
- Helpers: 59 projections passed.
- Reference configs: 26 projections passed.
- Context map: ten entries passed.
- `git diff --check`: passed.

New cases cover deterministic duplicate/out-of-order batches, identity
conflicts, bounded retention, restart epochs, source/proposal drift, scope,
request and source limits, injected deadline exhaustion and capability claims.
The production observer is used in the adapter cases. Explicit pilot selection
keeps status off and performs no persistent read effects. The synthetic CLI
pilot validates as reviewable without execution authorization; the explicit
unavailable-state API test still blocks. New tests cover exact file/aggregate
ceilings, overflow, malformed configuration and unchanged standard defaults.
Existing CLI command-list expectation adds the explicit pilot command. No
existing assertions were removed or weakened. The default profile exclusions
and source/no-write tests remain. Providers are stubs or inspected local mocks.

## Limits and next decisions

No external host sequence/epoch API or verified read-only/resume capability has
been supplied. This internal fixture contract does not invent a Bot endpoint.
Actual integration needs a host choice, verification and separate approval.
The host owns waking, batching intervals, restart reconciliation and any hard
process deadline. Retention bounds can forget event IDs; the watermark still
ignores old sequences, but a host issuing a new sequence can cause another
export. Return values are advisory data and never dispatch authority.

Existing acceptance-assessment/benchmark, sparse checkout, Git conversion and
unselected-memory state limitations remain. State confirmation is not atomic.
The full suite, broad host lifecycle tests and live providers were not run.
Parent static review of ae012ae8 found no defect in its export-only delta.
Independent review of the scoped-budget delta is pending. No push, merge, credential change or
deployment occurred. Remove this follow-on commit to roll back the new surface;
the base optional strategy implementation and PR 599 remain separate.

## Per-pass reuse delta after 04e0b4a

The canonical read-only owner captures policy and capability text once inside
each unlocked pass. It uses that text for parsing and hash projection. Cache
hits still validate source scope. The next pass owns a new map and reopens the
sources. There is no cross-pass cache, new package or higher limit. Required
review-subject sources still receive their full independent reads. Ordinary
writer behavior remains unchanged. Source hashes include only the selected
source paths, including missing-source hashes, as before.

The first focused run found that an untracked fixture capability also enters
the full review subject. The fixture now commits that source before the
within-pass test. The mutation test uses policy reads as the pass boundary.
This keeps subject reads intact rather than changing production behavior to
fit a read-count assertion. No existing assertions were removed or weakened.
New assertions prove same captured parse/hash bytes and independent reopening.
A same-size capability edit restores the timestamp and still invalidates the
old proposal. A stable default/guarded observation comparison still passes.

Final bounded checks: 161 tests passed across five files, 1177 assertions,
zero failures and no filters or skips. Typecheck and the five safe aggregates
passed. The preliminary real canonical packet has a state revision and no
unverified-source unknowns. Exact-commit context and advisory proposal results,
source hashes and measured costs are recorded in the review archive. Earlier
budget failures above are historical evidence, not current result claims.

Herdr is absent in this saved executor. No live reviewer or provider ran.
Independent parent review of the source/test delta is pending. Broad host,
full-suite and provider checks remain unrun under this task's scope. The
advisory proposal cycle is evidence of read/validation behavior. It is not a
business-success verdict or authorization to execute an investigation.
