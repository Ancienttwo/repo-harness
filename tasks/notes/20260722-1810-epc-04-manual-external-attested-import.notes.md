# Implementation Notes: epc-04-manual-external-attested-import

> **Status**: Active
> **Plan**: plans/plan-20260722-1810-epc-04-manual-external-attested-import.md
> **Contract**: tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md
> **Review**: tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md
> **Last Updated**: 2026-07-22 18:10
> **Lifecycle**: notes

## Design Decisions

- **Deployed-helper import resolution (the caution's central question).**
  `scripts/acceptance-receipt.ts` already has one dynamic import
  (`currentSubject`'s `import(pathToFileURL(join(PACKAGE_ROOT, 'src',
  'effects', 'review', 'diff-fingerprint.ts')).href)`) with no safety net
  at all -- it crashes uncaught if that file is missing. Empirically
  confirmed (`bun` probe script, not committed) that Bun's dynamic-import
  resolution failure surfaces as `error.name === "ResolveMessage"` and
  `error.code === "ERR_MODULE_NOT_FOUND"`, while a module that resolves
  but throws at its own top level surfaces as a plain `Error` with
  `code === undefined`. This is a clean, reliable discriminator, so the
  new `importAttestedReceiptIfApplicable` wraps its dynamic import of
  `src/effects/evidence/attested-import.ts` in a `try`/`catch` that treats
  `error.code === 'ERR_MODULE_NOT_FOUND'` as a cannot-bind skip (record
  still succeeds, one stderr notice) and re-throws anything else (a real
  failure in a resolvable context still fails record). This mirrors
  `scripts/verify-sprint.sh`'s `emit_verify_evidence` bash-level
  cannot-bind pattern (EPC-02), adapted to a TS-to-TS import instead of a
  bash-to-TS invocation: EPC-02 checks file existence in bash before ever
  invoking `bun`; this package catches the resolution failure directly in
  the same running TS process, since there is no bash intermediary for a
  same-process dynamic import.
- **Wiring lives at the CLI layer, not inside `recordAcceptance`/
  `recordUserWaiverAcceptance`.** The plan says "at the end of a
  successful record, import the just-recorded receipt." The literal
  reading -- calling the import from inside the two exported functions --
  was tried first and rejected after tracing `tests/acceptance-receipt.test.ts`'s
  `makeFixture`: its `.gitignore` only excludes `.ai/harness/checks/`, not
  `.ai/harness/evidence/`, and `diff-fingerprint.ts`'s
  `isOperationalReviewPath` (read-only, out of this package's scope) does
  not exclude `.ai/harness/evidence/` either. Writing evidence-store files
  inside those functions would make them part of the "implementation
  paths" `buildReviewSubject` hashes, so a *second* record call in the
  same test fixture (e.g. "reuses one owner grant after semantic
  correction...") would see a `review_subject_sha256` computed *after* the
  first import's on-disk writes, while the receipt object captured its
  subject *before* those writes -- the final `verifyAcceptance` assertion
  in that test would then observe a freshly-recomputed subject that no
  longer matches `second.subject_sha256`, breaking a characterization test
  this package is forbidden to edit (`tests/acceptance-receipt.test.ts` is
  outside `allowed_paths`). Moving the import call to the CLI's `record`
  command handler in `runAcceptanceReceiptCli` (after either
  `recordAcceptance` or `recordUserWaiverAcceptance` returns, before the
  receipt is printed) sidesteps this entirely: that test file imports
  `recordAcceptance`/`recordUserWaiverAcceptance` directly and never calls
  `runAcceptanceReceiptCli`, so it never exercises the new code path at
  all. Verified by re-running the full suite: `tests/acceptance-receipt.test.ts`
  (9 tests) and `tests/helper-scripts.test.ts` (121 tests, which also
  never invoke the real `record` subcommand -- only `verify`/`project` --
  confirmed by grep across `scripts/*.sh` before writing this wiring)
  both stayed green.
- **Consequence accepted**: because the import now runs *after*
  `writeReceipt` (inside the two library functions) rather than before it,
  a genuine (non-cannot-bind) ledger-import failure leaves the receipt
  file already written to `~/.repo-harness/gates/<hash>/acceptance.latest.json`
  even though the `record` command exits non-zero. This is judged
  acceptable: every existing consumer of that state (`verify`/`project`,
  and every bash caller in `verify-sprint.sh`/`contract-worktree.sh`/
  `ship-worktrees.sh`) already gates on the *command's exit code*, not
  file existence, so a non-zero `record` exit is still the correct and
  sufficient failure signal. The alternative (moving the import inside
  the exported functions, before `writeReceipt`, for a stronger
  no-orphaned-file guarantee) was rejected because it reintroduces the
  test-breaking risk above, and "characterization suites MUST stay green"
  is an explicit hard constraint that outranks a stronger atomicity
  guarantee nothing in the plan actually asked for.
- **`reject` is skipped by the wiring, not routed through
  `importAttestedEvidence`.** D4's trust mapping has exactly two entries
  (`external_pass`, `user_waiver`); `attested-import.ts`'s own mapping
  function fails closed on any other disposition, including `reject`,
  which is required and tested directly
  (`tests/evidence-attested-import.test.ts`, "a completely bogus
  disposition also fails closed"). But the CLI wiring itself special-cases
  `reject` with an early return *before* calling into the module at all --
  routing it through and letting it fail closed would turn an
  intentional, already-exit-code-1 rejection into a **thrown error**
  (`fail()` in `acceptance-receipt.ts`), which is a behavior change to an
  existing, working code path this package is not asked to touch. Tested
  directly: "real record --disposition reject does not touch the ledger."
- **`command_hash` (D3) has no natural source for an import.** The
  frozen D3 field list this package's Goal enumerates
  (`subject_sha256`->`subject_hash`, `target_revision`->`base_commit`,
  worktree HEAD->`target_commit`, contract hash->`contract_hash`, ordered
  `allowed_paths`->`scope_hash`, last commit touching the contract->
  `authority_commit`, host identity->`env_provider_id`) omits
  `command_hash` entirely, but `SubjectIdentity` (EPC-01, read-only) has
  no optional fields -- `command_hash` must be a non-empty string.
  Unlike `verify-producer.ts` (which hashes the literal verification
  command line), there is no "command" here: this evidence is imported,
  not freshly produced by running something. Resolved as
  `sha256(IMPORT_COMMAND_LABEL)` where `IMPORT_COMMAND_LABEL` is a fixed,
  never-parameterized string constant identifying "the operation that
  always produces this `event_type`." Being constant, it never varies
  call-to-call for the same receipt, so it cannot break idempotency
  (D5's key already varies correctly via `subject_hash`, which does
  change per receipt).
- **Payload field selection follows the plan's Goal text (source of
  truth) over the dispatch's own abbreviated restatement.** The plan's
  Goal item 1 lists the payload as "disposition, reviewer, source,
  summary, findings count, receipt hash reference"; the dispatch's
  restatement of Deliverable B omits `summary`. Since `reason` (a
  required, fail-closed field per the same Goal item) has no field of its
  own on `EvidenceEventRecord` -- the schema has no dedicated `reason` or
  `actor` slot -- and "reason" is explicitly defined as "receipt summary,"
  the only place either can live is the payload, so `summary` stays in and
  `actor` (the receipt's raw, nullable field, not the reviewer) is also
  included alongside `reviewer` as an independent key -- matching the
  receipt's own two-field shape (`reviewer`, `actor`) rather than
  inventing a combined string. Plain-English `summary` text is redaction-safe
  in practice (EPC-01's D6 redaction only matches 32+ char runs with *no*
  spaces, dots, or other punctuation breaking them; natural-language
  sentences virtually never qualify), unlike a raw hash or filename.
- **`receipt_ref` is a 16-hex-char prefix of `subject_sha256`, not the
  full hash.** A full `sha256:<64-hex>` value stored verbatim in the
  payload is exactly the 32+ char dot-free run EPC-01's D6 redaction
  replaces with `sha256:<hash-of-that>` -- the same silent-uselessness bug
  EPC-02's own dogfood run caught for its `run_snapshot_path` field (see
  `tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md`).
  Verified directly in this package's own test ("emits the complete D3
  field set and a redaction-safe short payload": asserts
  `receipt_ref.length < 32` and does not contain the `sha256:` prefix) by
  reading the accepted event back out of the real store (the actual
  post-redaction value), not a pre-redaction copy.
- **`AttestedReceiptInput` is a locally-declared structural type, not an
  import of `scripts/acceptance-receipt.ts`'s `AcceptanceReceipt`.**
  `src/` must not depend on `scripts/`; any object shaped like the
  interface (including a real `AcceptanceReceipt`) satisfies it via
  TypeScript structural typing, so the CLI wiring can pass a real receipt
  object directly with no adapter beyond a field-by-field object literal.
- **`verify-producer.ts`'s small git/parsing helpers
  (`providerCliVersion`, `workspaceId`, `parseContractAllowedPaths`,
  `lastCommitTouching`-equivalent) are necessarily duplicated locally in
  `attested-import.ts`, not imported.** They are private/unexported in
  the read-only `verify-producer.ts`, and that file cannot be modified to
  export them (EPC-02 is out of scope). This mirrors EPC-03's own
  documented choice (its contract's Concurrency section: "a separate,
  non-exported copy from `verify-producer.ts`'s equivalents ... per R4's
  'no shared' wave-qualification requirement") -- duplication here is the
  R4-mandated shape, not a style preference.
- **No "contract must be clean/committed" check distinct from the
  generic subject-missing fail-closed path.** `verify-producer.ts` has a
  dedicated `contract_not_committed` failure reason with its own dirty-vs-untracked
  git-status check. This package does not replicate that machinery: the
  plan's own required fixtures only name "missing actor/reason/subject
  fail closed" and "unknown disposition fail closed," not a dirty-contract
  case. Instead, `lastCommitTouching` returning null (which happens
  whenever the contract was never committed) naturally falls under the
  existing `missing_subject` fail-closed reason already required, tested
  directly ("an uncommitted contract file fails closed"), without adding
  a second git-status call or a new reason code the plan never asked for.

## Deviations From Plan Or Spec

- None. The dispatch's Deliverable B payload-field list (omitting
  `summary`) is treated as an abbreviation of the plan's own Goal text,
  not a deviation from it -- see the payload-selection decision above.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Import inside `recordAcceptance`/`recordUserWaiverAcceptance` (stronger atomicity: no orphaned receipt file on ledger-import failure) vs. CLI-level only | CLI-level only | The former perturbs `buildReviewSubject`'s working-tree scan in `tests/acceptance-receipt.test.ts`'s fixture (no `.ai/harness/evidence/` gitignore there), breaking a characterization test outside this package's `allowed_paths`; the latter is fully invisible to that test file |
| Route `reject` through `importAttestedEvidence` and let it fail closed vs. skip it in the wiring | Skip it | Routing through would turn an intentional exit-code-1 rejection into a thrown crash, an unrequested behavior change to an existing working path |
| Bash-level file-existence check (EPC-02's exact mechanism) vs. TS-level dynamic-import try/catch for the deployed-helper cannot-bind case | TS-level try/catch | This is a TS-to-TS import inside the same process (no bash intermediary), so catching the resolution error directly is the equivalent mechanism for this call shape, per the dispatch's own suggestion |
| Full `sha256:<64-hex>` receipt reference in the payload vs. a short prefix | Short (16-hex-char) prefix | The full value is a 32+ char dot-free run that EPC-01's D6 redaction silently re-hashes into a useless value (EPC-02 hit the identical bug with `run_snapshot_path`) |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Red-first: `bun test tests/evidence-attested-import.test.ts` failed with
  `error: Cannot find module '../src/effects/evidence/attested-import'`
  before the implementation existed (verified directly: the finished
  implementation file was moved aside, the suite re-run to confirm the
  failure, then restored and re-run to confirm all 14 [later 16, after
  adding the CLI-wiring integration tests] pass).
- Dogfood: a standalone live invocation of `importAttestedEvidence`
  against this worktree's own committed contract (commit
  `248f970e29a84c25370867caec7c1dbdf2eb9162`) appended
  `evt-01KY4QT0HY6FC3V0G0BF9VT4V1` (`external_attested`,
  `acceptance_receipt.attested_import`) to
  `.ai/harness/evidence/events/log.jsonl`, genesis
  `ledger_epoch_start_sha = 5228d4ea0d7987cf6fb73be216d5b9cc638817c3`;
  see the review file's Manual Check Evidence for the full field
  readback. This package's own `acceptance-receipt.ts record` invocation
  (recorded at closeout) additionally exercises the real CLI wiring,
  appending a second accepted `external_attested` event referencing the
  actual recorded receipt -- see the review file's Acceptance Receipt
  Projection and the verification command tail for that event.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
