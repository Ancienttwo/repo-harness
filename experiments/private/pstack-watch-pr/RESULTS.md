# Offline result: keep the small baseline

## Decision

Do not import the full watcher into production now. Keep this private comparison
as evidence. The tested watcher is real upstream code. Its queue, retry, and
render features work in these fixtures. The measured increment does not yet pay
for 2,101 runtime source lines and the adapters needed to preserve our contract.
The comparison baseline adds a 25-line poller to the existing collector.

This is a stop at the experiment stage. It is not a claim that source reuse has no
value. A future retry or render adapter needs a concrete consumer, measured need,
and its own review. No production adapter, gate, dispatch, or merge action was
added. Do not turn this result into an automatic third stage.

## Fixed subjects and evidence

- Harness main was read through the provider on 2026-10-06.
  Its SHA was `ef695fb9f964f29342ee6c98ce150601006eb40f`.
- Upstream was `cursor/plugins@df581122cde17e6e27686b5a448bde23e4ad4318`.
- `PROVENANCE.json` records full source paths, Git blob hashes, SHA-256 hashes,
  byte counts, and copy status. The four source modules and two test files plus
  their helper are byte-exact. `vendor/LICENSE` retains the full MIT notice.
- `results.json` is the detailed machine-readable result. `comparison.test.ts`
  produces the comparison fields as a single JSON log line.
- The parent plan is
  [document handoff and reuse](../../../plans/plan-20261006-0910-document-handoff-pstack-reuse.md).
  It is a separate change and can be absent on this branch.

The source review found no module-load process or network call in these four
modules. `github.ts` imports process creation for its default reader. Tests never
construct that reader. The preload replaces process and network APIs with deny
functions before imports. A test checks the process import identity. The
collector uses its existing injected runner. No bootstrap or new dependency ran.

## Readiness semantics, not one failure score

There are 21 hand-selected facts fixtures: 20 observer comparisons and one
decoder-only probe. They are not a random sample, a rate estimate, or a full
provider conformance suite.

- Ten fixtures test shared scope. Eight are non-ready cases. Neither candidate
  misses those eight. This includes pending, failed, and unknown check buckets;
  unresolved threads; draft; change requests; conflict; and a supplied complete
  list with its 101st thread unresolved. The two clean cases stay ready.
- Ten observer comparisons produce upstream `ready` while the harness says not
  ready. One additional decoder-only probe does so. These counts describe misuse
  as a gate. They are not a default-watcher defect rate.
- One observer difference is intentional policy: pending Code Review Gate
  does not keep the watcher waiting on a person.
- Three are harness authority scope: required CI membership and exact expected
  head/base identity. The observer was not given the harness receipt contract.
- Four are observation consistency: head or base changes across reads, or review
  data bound to another head or base. The harness fences those reads.
- One is unknown mergeability. The observer can report ready on UNKNOWN.
- One is an incomplete observation: a truncated review connection can leave an
  empty thread list.
- The extra decoder-only probe supplies a GraphQL partial error with data directly
  to the parser. Its transport is unverified. The default reader rejects nonzero
  gh exits before parsing, so this probe does not establish a default-watcher
  partial-error gap. We did not test that transport or assume exit zero.

The demonstrated observation-quality gaps matter even for a status consumer. They need
an adapter if the consumer expects a complete, current report. They do not justify
replacing the existing readiness authority. No actual acceptance decision was
made in the experiment. A separate failed-check fixture returns status-only exit
zero. It confirms that zero is not acceptance.

Both exact head and exact base mismatch are tested. Both head and base changing
between reads are tested. Both review head and review base binding are tested.
For cross-read changes, both adapters independently replay the same frozen
provider timeline. Its identity moves after the final facts response is captured
and before the observation returns. The watcher and collector have equal initial
identities and first transitions. The watcher reads identity once; the collector
reads four times across its two attempts. Assertions also verify that the watcher
source has changed when its snapshot returns. This is an event-driven fixture,
not a measured live-provider timing result.

The review tests cover `hasNextPage: false`, `hasNextPage: true`, 100 resolved
visible rows with a missing page, and 101 supplied rows with the last unresolved.

## Pagination boundary

The upstream review query asks for the first 100 threads and omits pageInfo.
Its parser ignores pageInfo even when a fixture supplies it. The harness refuses
an incomplete connection. Neither experiment fetches live pages.

The check fallback consumes 100 checks on page one and a failed 101st check on
page two. It stops at a null terminal cursor. This exercises the reader cursor
contract, not the default reader's live GraphQL transport. A repeated-cursor
fixture also shows no upstream duplicate-cursor guard. The fixture cancels it on
the third page call, so the test remains bounded. A live adapter would need a page
budget, cursor validation, and completeness evidence.

## Polling and notification measurements

All times are logical seconds. Read counts are injected provider commands or
reader calls. They are not actual HTTP request counts. No external API request
was made. The two candidates do different validation work, so raw endpoint totals
are not a production efficiency comparison.

1. Three unchanged pending polls:
   - Simple watcher: three WAITING messages, two duplicates.
   - Minimal baseline: one message, zero duplicates.
   - Logical reads: watcher 12, collector 24. The collector performs identity,
     check-run, rollback activation, and review binding checks the observer lacks.
2. Service becomes available at second 120:
   - Upstream exponential retry: attempts at 0, 60, and 180. Three attempts.
   - Fixed baseline poller: thirteen attempts. It recovers at 120.
   - Upstream saves attempts but recovers 60 seconds later. This fixture does not
     establish a good production interval or a lower real API cost.
3. Three-row queue, with one row merging each ten seconds:
   - Upstream queue: eight snapshot reads, two ADVANCE messages.
   - Full-active-set baseline: nine snapshot reads.
   - One saved read is a tiny fixture result. Upper rows are cached until a sweep;
     the configured next sweep is second 300. Freshness is part of that tradeoff.
4. Queue dedup suppresses identical waits. Its key also suppresses a changed
   pending check when the frontier and pending count stay the same. A useful
   notification adapter must key meaningful content and exact subject identity.
   The minimal baseline has the same changed-content limitation: it keys blocker
   codes, so build-to-security while pending also emits no new message. This
   shared limit is tested; duplicate suppression is not richer change reporting.
5. Both loops stop when the injected clock throws cancellation. No later reads
   occur. Upstream has no AbortSignal contract here. This is not evidence for
   cancellation of live child processes or an in-flight network request.

The three-row identity fixture has a ready bottom, a pending middle, and a moved
upper base. The existing pure predicate yields only a one-row ready prefix.
The observer reports its per-row statuses. Neither a ready prefix nor those
statuses grants permission to merge. The main-only public collector remains
main-only; the stack test uses its existing pure predicate and explicit per-row
identities. It does not bend the collector to accept another target.

## Maintenance and adoption criteria

The copied runtime has four files, 2,101 lines, and 68,646 bytes. Selected upstream
tests and their helper add 844 lines. No upstream file was patched. No manifest,
lock file, installed dependency, or production source changed. Installed Bun and
existing TypeScript types are sufficient for this lane. Commander is not used.
The added fixture, guard, and comparison code are test infrastructure, not a
proposed production adapter.

- Adopt a runtime part only if a real consumer needs its behavior, the benefit
  exceeds its integration cost, and exact identity/completeness remain with the
  harness. These fixtures do not meet that threshold for the full watcher.
- Consider a small adapter for retry or rendering only if later evidence shows
  repeated rate-limit pressure or a real demand for this event format. Do not
  copy 2,101 lines solely to get the few-line backoff function.
- Keep none in production now. The existing collector and small poller already
  cover this lane's authority and simple notifications. This conclusion stops
  extra integration work rather than committing to a blanket rewrite.

## Verification and limits

Corrected final test run: 63 passed, zero failed, 216 assertions across three files.
There are 29 selected upstream tests and 34 comparison/integrity tests.
The private TypeScript project passes. The unchanged repository root typecheck
also passes. Source hashes and license checks pass inside the test suite.
`git diff --check` passes. Only files under this private experiment are added.

From this directory, with installed Bun 1.4.0 on PATH:

    bun test ./comparison.test.ts ./vendor/github.test.ts ./vendor/policy.test.ts --timeout 60000 --max-concurrency 1

From the repository root, with installed Node 24.19.0:

    node node_modules/typescript/bin/tsc --noEmit -p experiments/private/pstack-watch-pr/tsconfig.json
    bun run check:type

The normal test wrapper is not used because its preload creates a child process.
This lane uses its own Bun config and deny preload. Default test discovery and
package exports exclude this directory. No full security scan, full suite, real
GitHub request inside tests, live PR mutation, real agent, installation, or
publication was run. Initial setup caught an unsupported Bun config argument;
the explicit file command above is the verified command. Type errors in new
fixture annotations were fixed before the final run. Assertions were preserved. Independent review then found that the initial two
cross-read probes gave only the collector an identity script. The corrected
candidate replaces that setup with the shared replay above. Review also prompted
the decoder-only label and the shared notification-key limitation. The final
counts and saved output come from the corrected run.
