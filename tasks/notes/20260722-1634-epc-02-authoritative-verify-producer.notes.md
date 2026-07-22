# Implementation Notes: epc-02-authoritative-verify-producer

> **Status**: Active
> **Plan**: plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md
> **Contract**: tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md
> **Review**: tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md
> **Last Updated**: 2026-07-22 16:34
> **Lifecycle**: notes

## Design Decisions

- **Contract resolution is a hybrid, not a re-derivation of `verify-sprint.sh`'s
  chain.** `verify-sprint.sh` already resolves "which contract is active for
  this run" through its own logic (`--contract` override, `workflow_active_contract`,
  or a sorted fallback). Re-implementing that whole chain in TypeScript
  purely for this producer would be a second, potentially divergent
  authority for the same datum -- exactly the "shadow parser" pattern the
  repo forbids. `emitAuthoritativeVerifyEvidence` instead takes an optional
  `contractPath` input: the `verify-sprint.sh` wiring always passes its own
  already-resolved `$contract_file`, so production has exactly one
  resolution. When omitted, the function falls back to the repo's own
  `.ai/harness/active-plan` -> `plans/plan-<slug>.md` -> `tasks/contracts/<slug>.contract.md`
  convention (the same one `src/cli/hook/subagent-handler.ts`'s private,
  unexported `activeContractPath` uses) so direct/standalone/test callers
  still work without needing bash. `contractPath` is a pointer, not an
  identity field -- the function still computes `contract_hash`,
  `scope_hash`, and `authority_commit` from it itself, so "callers cannot
  inject identity fields" still holds.
- **`authority_commit` resolution**: `git log -1 --format=%H -- <contract>`,
  only reached after confirming `git status --porcelain -- <contract>` is
  empty (tracked and clean). A non-empty porcelain status already covers
  both "untracked" (`?? path`) and "dirty" (`M `/`A `/etc.) in one check, so
  both fail-closed conditions share one git call.
- **`base_commit`/`target_commit` come from the same `buildReviewSubject`
  call already needed for `subject_hash`, not extra git calls.**
  `buildReviewSubject(repoRoot, { targetRef: reviewBaseRef }).target_rev` is
  `base_commit`; `.head_rev` is `target_commit`. `reviewBaseRef` is read from
  `.ai/harness/policy.json#worktree_strategy.review_base` (pattern reference:
  `scripts/acceptance-receipt.ts`'s private, unexported `reviewBase`/
  `currentSubject`, reimplemented locally since they are not exported).
  Unlike `acceptance-receipt.ts`, a missing policy file or missing
  `review_base` value falls back to `"HEAD"` instead of failing closed --
  the real target repo always has this file, so the fallback only matters
  for a fixture/standalone repo that never created one, and "no active
  contract" / "dirty contract" / "subject mismatch" already cover every
  fail-closed condition this package was asked to prove; a fifth reason
  for a scenario that cannot occur in production was not added.
- **`env_provider_id` composition**: `repo-harness/<this module's own package.json version>/<ws-hash>`.
  The version is read from `PACKAGE_ROOT/package.json` resolved from
  `import.meta.url` (three levels up from `src/effects/evidence/`) --
  i.e. the repo-harness tool's own version, never the target `repoRoot`'s
  `package.json` (which does not exist in a bare test fixture and would be
  the wrong datum anyway: this field identifies the verifying tool, not the
  repo being verified). `ws-<12 hex chars>` is `sha256(git rev-parse --show-toplevel)`
  truncated -- deterministic per worktree (needed for idempotent
  re-emission: this field feeds `subject_identity`, which feeds the
  idempotency key, so it must not vary call-to-call for the same repo).
- **`scope_hash`**: `sha256(JSON.stringify(uniqueSorted(allowedPaths)))`,
  reusing `diff-fingerprint.ts`'s own exported `uniqueSorted` (byte-order
  sort + dedup) for the same "ordered set" semantics the rest of the
  identity already uses, instead of inventing a second sort convention.
  `allowedPaths` is extracted from the contract's fenced ` ```yaml ` block
  by a small local parser mirroring `verify-sprint.sh`'s `contract_allowed_paths`
  awk function (find the block containing `allowed_paths:`, read `  - item`
  lines until dedent). No existing TS parser for this existed to import.
- **`event_type`/`producer` naming**: `"verify_sprint.result"` /
  `"verify-sprint"`. No existing convention or consumer to match yet (D7's
  materializers are future rows); named for clarity. Both feed the D5
  idempotency key, so they must stay constant across calls for the same
  logical run -- they are fixed constants, not caller inputs.
- **`verify-sprint.sh` wiring**: one new bash function, `emit_verify_evidence`,
  called from both sites (rather than duplicating the invocation inline
  twice). It reads `review_subject_sha256`, the run-snapshot path, and guard
  counts back out of `$checks_file` -- never from an in-scope bash variable
  -- because `$review_subject_sha256` is only set as a global in the
  `--prepare-acceptance` branch and is not in scope inside
  `finalize_prepared_acceptance`. Reading everything from `$checks_file`
  also means the emitted evidence is always bound to exactly what that file
  already asserts passed, rather than a second in-memory notion of "the
  subject" that could drift from it. Insertion points: the freeze path's
  existing `if [[ "$exit_code" -eq 0 ]]` success-echo block (narrowest
  point after the success determination), and `finalize_prepared_acceptance`'s
  tail, right after its own two success echoes and before the function
  closes. Both are additive; no existing line was changed, moved, or
  removed (`git diff --stat` on the file shows insertions only).
- **Payload shape**: `{ status, counts, run_snapshot_id }`. `counts` is
  computed by the bash wiring from `$checks_file`'s own `guards` array
  (`guards_total`, `guards_passed`) rather than inventing new
  instrumentation -- it is data the script already has. `run_snapshot_id`
  is **not** the full path (see the dogfood-caught redaction bug under
  Evidence Links below): it is the run-id prefix only, with the redundant
  `-<worktree_id>` suffix and `.json` extension stripped by
  `shortRunSnapshotId`. A reader reconstructs the real path as
  `.ai/harness/runs/<run_snapshot_id>-<worktree_id>.json` (`worktree_id` is
  already in the event envelope). The producer's public input,
  `VerifyProducerInput.runSnapshotPath` (and the CLI's `--run-snapshot`),
  still take the full repo-relative path unchanged -- only the internal
  payload construction shortens it, so the wiring in `verify-sprint.sh`
  needed no change for this fix.

## Orchestrator Ruling (2026-07-22, post-implementation follow-up)

Full `bun test` after the orchestrator widened `allowed_paths` to include
`assets/templates/helpers/verify-sprint.sh` and ran `bun run sync:helpers`
exposed 6 real failures in `tests/helper-scripts.test.ts`: those fixtures
deploy the repo's declared `.sh`/`.ts` helpers into a bare temp dir (no
`src/` tree, no `scripts/emit-verify-evidence.ts` -- it is not a declared
helper) and then run `bash scripts/verify-sprint.sh`, which now hit my new
wiring. Two rulings applied:

- **Companion-script resolution.** `emit-verify-evidence.ts` is *not* made
  a declared helper (unlike `acceptance-receipt.ts`): its entry point
  imports `src/effects/evidence/verify-producer.ts`, which in turn needs
  the whole EPC-01 evidence store and `diff-fingerprint.ts` -- making it
  standalone would mean duplicating that logic inline, which is exactly
  the kind of new resolution mechanism the ruling said not to invent.
  Instead, `emit_verify_evidence()` in `scripts/verify-sprint.sh` resolves
  the TS entry the same way `acceptance-receipt.ts` is resolved today
  (`$helper_dir/acceptance-receipt.ts`, a plain sibling-file lookup -- it
  is a declared helper deployed alongside `verify-sprint.sh` by the same
  `copyHelpers()`/`sync:helpers` mechanism), with one addition: when
  `$helper_dir/emit-verify-evidence.ts` does not exist locally (a
  deployed-helper context), it falls back to
  `${REPO_HARNESS_SOURCE_ROOT}/scripts/emit-verify-evidence.ts` if that env
  var is set and the file exists there -- the exact same
  `REPO_HARNESS_SOURCE_ROOT` fallback `workflow_source_authority_call`
  already uses a few lines above in this same script for hook-CLI
  resolution (`PR #111`, `codex/helper-source-path-env-leak`), not a new
  mechanism. `tests/helper-scripts.test.ts`'s `sandboxEnv()` deliberately
  strips `REPO_HARNESS_SOURCE_ROOT`, so in those specific fixtures neither
  path resolves -- which is exactly the "indistinguishable from cannot-bind"
  case named in the ruling, and is handled identically (return 3, one
  stderr notice, no crash).
- **Cannot-bind => skip, not fail.** `scripts/emit-verify-evidence.ts` now
  maps the producer's typed refusal to exit `3` (cannot-bind:
  `no_active_contract` / `contract_not_committed`) versus exit `1` (real
  failure: `subject_mismatch` / `genesis_epoch_conflict`); exit `2` stays
  CLI usage errors. `verify-sprint.sh`'s two call sites now `case` on the
  captured exit code: `0`/`3` continue (verify result unchanged; `3` prints
  one stderr notice), any other non-zero fails the run. The producer
  module (`verify-producer.ts`) is untouched by this ruling -- it still
  returns one typed `{ ok: false, reason, message }` for every fail-closed
  condition; only the wrapper's mapping of that `reason` to an exit code
  changed. This is refusal-to-fabricate, not a fallback: nothing reads the
  ledger yet, so a cannot-bind skip changes no gate's outcome.
- **Real bug found applying this**: both call sites originally wrote
  `emit_verify_evidence "..."; case $? in ...` as two separate statements.
  Under `set -e` (`set -euo pipefail` at the top of the script), a
  standalone command returning non-zero (exit `3`, the very case being
  added) aborts the *entire script* immediately -- the `case` statement
  handling that exit code is never reached, and the whole `verify-sprint`
  process exits with code `3` instead of continuing. Caught by re-running
  `tests/helper-scripts.test.ts` after the first pass of this fix (still
  6 failing, now with `Expected: 0, Received: 3` instead of `Received: 1`
  -- a regression in the fix itself, not a pre-existing one). Fixed with
  this script's own established idiom (already used for
  `contract_output`/`acceptance_row` elsewhere in this file):
  `set +e; emit_verify_evidence "..."; emit_exit=$?; set -e; case
  "$emit_exit" in ...`. Re-ran `tests/helper-scripts.test.ts` +
  `tests/capability-resolver.test.ts`: 127/127 pass.

## Deviations From Plan Or Spec

- The plan's payload description says "run snapshot repo-relative path."
  The shipped payload field is `run_snapshot_id` (a short id, not the
  literal path) -- see the dogfood-caught redaction bug under Evidence
  Links. The literal path would have been silently hashed into a useless
  `sha256:...` value on every real invocation (the plan's own P1 section
  separately warned this redaction risk exists), so storing it verbatim
  would not have satisfied the plan's actual intent ("run-snapshot ...
  path" as a *useful, dereferenceable* payload element) even though it
  matched the literal field name. The full path is still available to
  every caller via `VerifyProducerInput.runSnapshotPath` / the CLI's
  `--run-snapshot`; only the payload's internal representation changed.
- Otherwise none. The plan's Goal/P1-P3 sections did not pin an
  `event_type` string, an exact `env_provider_id` composition, or the
  contract-resolution mechanism at the wiring boundary; all three were left
  as implementation latitude and are recorded above rather than being
  deviations.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Re-derive "active contract" independently in TS vs. accept it as an optional input from `verify-sprint.sh` | Accept as optional input, fall back to `.ai/harness/active-plan` only when omitted | A second independent resolver risks silently diverging from what `verify-sprint.sh` actually verified; the repo's no-dual-authority principle argues for consuming the one resolution that already exists in production while keeping the fallback for direct/test callers |
| Fail closed if `.ai/harness/policy.json#worktree_strategy.review_base` is missing (mirroring `acceptance-receipt.ts`) vs. default to `HEAD` | Default to `HEAD` | The real repo always has this file; a fifth fail-closed reason for an unreachable-in-production scenario was not part of the four named fail-closed conditions and was not added |
| Shared `emit_verify_evidence` bash helper vs. duplicating the wrapper invocation inline at both call sites | Shared helper, one definition | Smaller total diff than duplicating ~10 lines twice; both call sites already differ enough (finalize has no `review_subject_sha256` in scope) that reading from `$checks_file` in one place avoids two subtly different implementations drifting apart |
| Test fixtures as real git repos (init/commit/tag) vs. plain temp dirs like EPC-01's fixtures | Real git repos | The producer reads git state (`status`, `log`, `rev-parse`) that EPC-01's own store never touched; a plain temp dir could not exercise the dirty/untracked/subject-mismatch fail-closed paths at all |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- **Dogfood-caught bug (real production run, not a fixture)**: after the
  implementation and tests were green, `bun scripts/emit-verify-evidence.ts`
  was run directly against this worktree's own (now-committed) contract --
  exactly as `verify-sprint.sh`'s wiring would invoke it. The event appended
  successfully (`evt-01KY4H2...`), but `payload.run_snapshot_path` came back
  as `.sha256:a3a43bf...json` instead of the real path. Root cause: EPC-01's
  D6 redaction (`src/core/evidence/redaction.ts`, read-only) replaces any
  32+ char run of `[A-Za-z0-9+/_-]` (dots break a run; slashes and hyphens
  do not) with `sha256:<hash>`; the real run-snapshot filename
  (`run-<timestamp>-<pid>-<contract-slug>.json`, `scripts/verify-sprint.sh`'s
  `run_file`) is always such a run for any realistic contract slug, so the
  field would have come back hashed on every real invocation, not just this
  one -- a payload field that is unconditionally useless in production. This
  is exactly the risk the dispatch's "Payload discipline" note warned about
  in advance; the first implementation still walked into it because the
  test fixture's own `run_snapshot_path` fixture value ("fixture-run.json")
  happened to be short enough to dodge the redaction, so the unit test
  suite alone did not catch it. Fixed as described above
  (`run_snapshot_id`, short-id-only payload field); the test fixture was
  then changed to a realistic-length filename
  (`run-20260722T170215-94226-fixture.json`) specifically so the suffix-
  stripping path is genuinely exercised, not just accidentally passed
  through the no-op fallback branch. Re-ran the same direct dogfood
  invocation after the fix: `payload.run_snapshot_id` came back as
  `"run-20260722T170215-94226"`, fully readable. `bun test`,
  `bun run check:type`, and the full root required-checks list were all
  re-verified green after this fix, and the single commit was amended
  (not a second commit) since nothing had been pushed and the dispatch's
  own instruction was to land this package as one commit.
- Red-first: the idempotency test (`tests/evidence-verify-producer.test.ts`)
  failed on its first real run against the completed implementation because
  the test fixture had no `.gitignore` for `.ai/harness/evidence/` -- the
  producer's own first-call write showed up as untracked churn in the
  second call's review-subject scan, changing `subject_hash` and therefore
  the idempotency key between the two calls. Fixed by giving the fixture
  the same `.gitignore` line the real target repo already carries from
  EPC-01 (`.ai/harness/evidence/`), committed in the fixture's base commit
  before any evidence is written. This is a genuine, repo-general finding,
  not a producer bug: **a repo that does not gitignore the evidence store
  cannot get idempotent re-emission from this producer**, because the store
  becomes part of the diff surface `buildReviewSubject` measures. Recorded
  here rather than promoted, since it is a one-time observation about this
  fixture, not (yet) a repeated correction.
- "No active contract" is a required fail-closed behavior of the function
  (goal item 2) but is not one of the five red-first fixtures enumerated by
  the plan's own Goal-6 or by the dispatch's deliverable C; no dedicated
  producer-level test was added for it, matching that enumeration exactly.
  It is now covered at the wrapper level instead, by the orchestrator
  ruling's exit-code tests ("exit 3 (cannot-bind), not 1, when no active
  contract resolves", `tests/evidence-verify-producer.test.ts`).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
