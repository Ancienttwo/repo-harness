# Implementation Notes: epc-01-evidence-event-store

> **Status**: Active
> **Plan**: plans/plan-20260722-1151-epc-01-evidence-event-store.md
> **Contract**: tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md
> **Review**: tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md
> **Last Updated**: 2026-07-22 11:51
> **Lifecycle**: notes

## Design Decisions

- **Vendored ULID, split pure/impure.** D5 asks for a lexicographically
  sortable, time-embedding `event_id`. `src/core/evidence/ulid.ts` exports
  `encodeUlid(timeMs, randomness: Uint8Array)` as a fully pure function of
  its two explicit inputs, plus `generateUlid()`/`generateEventId()` as thin
  impure wrappers around `Date.now()` and `crypto.randomBytes`. This keeps
  the "no fs/process imports" constraint on `src/core/evidence/` literal
  (only `crypto` is imported, never `fs`/`process`) while still letting
  tests exercise the encoding deterministically (fixed timestamp + fixed
  randomness) without needing to fake wall-clock time. The 5-bit
  sliding-window bit-packer in `encodeRandomness` matters: a naive
  `(bitBuffer << 8) | byte` accumulated across all 10 input bytes would
  overflow JS's 32-bit bitwise-op range; masking `bitBuffer` down to its
  unconsumed remainder after every drain keeps it under ~12 bits at all
  times.
- **Single log file, not file-per-event.** D5's total order is "append
  position in the per-worktree log" (singular). A directory of one file per
  event would reintroduce mtime/filename-based ordering, which D5/D7
  explicitly forbid. `src/effects/evidence/paths.ts` fixes the layout to
  `.ai/harness/evidence/events/log.jsonl`.
- **Redaction is construction-invariant by removing the bypass, not by
  convention.** `src/effects/evidence/event-log.ts`'s `appendEvidenceEvent`
  only accepts the raw `EvidenceEventInput` descriptor and always calls
  `buildEvidenceEvent` (the construction path in `event-writer.ts`) before
  writing. There is no exported function that accepts a pre-built
  `EvidenceEventRecord` and appends it directly, so a caller cannot
  construct a record by hand and skip redaction/path-safety/inline-cap --
  the only way to get a record onto disk is through construction.
- **Redaction must be a single pass over the *original* text, not two
  sequential passes.** An initial design ran the denylist substring-replace
  first, then the high-entropy regex second. That double-redacts: the
  denylist pass's own output (`sha256:<64-hex>`) is itself a 64-char run of
  `[A-Za-z0-9]`, so the entropy pass re-matches and re-hashes it, producing
  `sha256:sha256:<hash-of-a-hash>`. Fixed by computing spans from *both*
  sources against the original string, merging overlapping/adjacent spans,
  and slicing the original text exactly once (`src/core/evidence/redaction.ts`).
  This was caught by reasoning through the pipeline before it ever reached a
  test, but is exactly the kind of thing D6's "not a skippable sanitize
  step" phrasing is protecting against -- worth flagging since it is not
  obvious from the frozen decision's one-line description.
- **Path-field convention.** D6 says "absolute paths in payload path fields
  rejected fail-closed" but does not define which fields are "path fields"
  for an arbitrary, caller-defined JSON payload. This package defines the
  convention locally (`isPathFieldKey` in `event-writer.ts`): any object key
  literally `path`, or ending in `_path` or `Path`, at any depth. Every
  string value at such a key is validated via the existing
  `ensureRepoRelativePath` (`src/effects/path-safety.ts`, imported, not
  modified). This is a choice within D6's letter, not a re-decision of it;
  a later row that needs a different convention should amend it explicitly
  rather than each producer inventing its own.
- **`payload_hash` vs `blob_sha256` naming/prefix asymmetry is deliberate.**
  D6 states the repo-wide convention is "sha256, hex, `sha256:`-prefixed".
  Fields whose name already encodes the algorithm (`blob_sha256`) store
  plain 64-char hex, because that value is also used verbatim as the blob's
  on-disk filename (portable, no colon in a filename). Generic hash fields
  that do not name the algorithm (`payload_hash`, `idempotency_key`, and the
  redaction replacement token) use the `sha256:` prefix. Both are "the
  repo's hash convention" applied consistently at their respective call
  sites.
- **Corrupt-tail recovery is a returned result, not a thrown exception.**
  D5 says the policy is "fail-closed -- never skip a corrupt middle record
  and continue"; genesis-before-append is separately and explicitly
  specified as "fails closed (throws)". Read this as: genesis absence is a
  precondition violation on a *write* (throw is right), while corrupt-tail
  discovery on a *read* is an expected, self-healing recovery path a future
  materializer needs to keep functioning past (truncate the accepted view,
  quarantine the tail, return both facts in the result). `readAcceptedEvents`
  therefore never throws for corruption; `quarantinedPath` in its result
  signals that recovery happened.
- **Quarantine also truncates the live log file, not just the returned
  view.** "Quarantine the invalid tail" is read as removing it from the live
  location, not merely ignoring it while leaving garbage bytes on disk that
  a future append would then be appended after. `readAcceptedEvents`
  recomputes the exact valid byte offset from the valid lines themselves
  (never assumes uniform line length) and calls `truncateSync` to that
  offset after the quarantine file is durably written.
- **Blob mismatch check runs on every write, not only when a collision is
  "detected" some other way.** Since the blob's name *is* its content hash,
  a real SHA-256 collision is not the realistic failure mode; on-disk
  corruption or a partial/aborted prior write is. `writeBlob` always reads
  and byte-compares existing content before treating an existing file as a
  hit, so a corrupted blob fails closed on the next write attempt instead of
  silently being treated as already-correct.
- **Symlink safety is enforced by never calling `readFileSync` on a path
  until after `lstatSync` confirms it is not a symlink.** `ingestFileAsBlob`
  branches on `lstatSync(...).isSymbolicLink()` before any content read; for
  a symlink it hashes the raw `readlinkSync` target string and returns a
  `{ kind: 'symlink', linkTarget, sha256 }` descriptor with no blob write at
  all -- the target file's bytes are never opened, so there is no path by
  which they could be ingested as a side effect.

## Deviations From Plan Or Spec

- None. All D1-D6 invariants named in the plan's Goal section are
  implemented as specified; the choices above are within D1-D6's letter
  (concrete mechanics the frozen decisions left to the implementer), not
  deviations from them.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Use `src/effects/locking/exclusive-directory-lock.ts` for append safety | Not used | D5 asks for "atomic whole-line append + fsync", which a single bounded `O_APPEND` write already provides for this per-worktree, effectively-single-writer use case; the lock module solves cross-process mutual exclusion across crashes, a different and heavier problem than what D5 specifies. Revisit if a later row adds genuinely concurrent multi-process writers to the same store. |
| Reuse `src/effects/fs-transaction.ts`'s internal `writeFileDurably` | Not possible | It is a private, unexported helper (only `atomicWriteFile` and the `apply*Operation` functions are exported). Implemented an equivalent open/write-loop/fsync helper locally in `src/effects/evidence/atomic-append.ts` in append (`O_APPEND`), exclusive-create (`O_EXCL`, for write-once blobs), and truncating (`O_TRUNC`, for quarantine dumps) variants. |
| ULID as an npm dependency (e.g. `ulid`/`ulidx`) | Not used | Plan P3 explicitly calls out that adding a package for ~40 lines fails the smallest-change rule; vendored a minimal Crockford base32 encoder instead. |
| Import `src/effects/path-safety.ts` directly into `src/core/evidence/` (it has no `fs`/`process` imports itself, so it is transitively pure) | Not done | No existing `core/*` module imports from `effects/*`, even a pure one; path-field validation lives in `src/effects/evidence/event-writer.ts` instead, preserving the repo's existing core-never-imports-effects direction. |

## Open Questions

- None. This package deliberately does not decide anything D1-D6 left open
  for a later row (materializer wiring, `checks/latest` selection, recovery
  view retirement) -- those stay with EPC-05/06/07/09 as scoped by the plan.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- New test files (red confirmed before implementation, then implemented to
  green): `tests/evidence-event-store.test.ts`,
  `tests/evidence-blob-store.test.ts`, `tests/evidence-replay-recovery.test.ts`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness
asset files only when all three hold: hard to reverse, surprising without
local context, and a real trade-off existed. If any one is missing, keep it
in this notes file instead.

## Promotion Candidates

- None yet. The redaction single-pass/double-hash pitfall is a reusable
  pattern (any "denylist then generic pattern" redaction pipeline over the
  same string is vulnerable to re-matching its own hash output), but it has
  only been observed once in this package; promote to `tasks/lessons.md`
  only if a second, independent occurrence surfaces elsewhere in the repo.
