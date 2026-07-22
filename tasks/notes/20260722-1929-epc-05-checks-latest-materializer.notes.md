# Implementation Notes: epc-05-checks-latest-materializer

> **Status**: Active
> **Plan**: plans/plan-20260722-1929-epc-05-checks-latest-materializer.md
> **Contract**: tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md
> **Review**: tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md
> **Last Updated**: 2026-07-22 21:45
> **Lifecycle**: notes

## Gatekeeper CRITICAL fix (2026-07-22, mid-package, orchestrator ruling)

**Finding**: the gatekeeper ran this package's own dogfood
(`bash scripts/verify-sprint.sh --prepare-acceptance` against this
contract, now committed-clean) and found the materialized
`checks/latest.json` was NOT consumer-equivalent:
`review_subject_sha256` came back double-prefixed
(`sha256:sha256:...`), and every long-slug path field
(`run_file`, `lifecycle.snapshot`, `contract.file`, `active_plan`,
`allowed_paths`/`files_changed` array entries, `diff_base`'s 40-char git
SHAs) came back partially hashed. Live repro preserved as evidence:
`evt-01KY4YMNNF0BFAPHV968AX04J6` in this worktree's own ledger
(`.ai/harness/evidence/events/log.jsonl` + its blob).

**Root cause**: `src/core/evidence/redaction.ts`'s D6 high-entropy pattern
(`[A-Za-z0-9+/_-]{32,}`) has no notion of "this value is already a hash" or
"this value is a path" -- it blindly matches any 32+ char run of that
character class anywhere in any string leaf. `.` is not in the character
class (it breaks a run), but `/` and `-` ARE, so a realistic contract slug
like `tasks/contracts/20260722-1929-epc-05-checks-latest-materializer` (no
dots until the final `.contract.md`) is one continuous 60+ char run and
gets replaced wholesale. This package's OWN payload upgrade (Goal 2) was
the first caller to ever push a large, structurally rich object (the full
verify-sprint run-trace) through this pre-existing, previously
low-stakes pass -- every prior caller's payloads were small structured
summaries (`{status, counts, run_snapshot_id}`) that never happened to
contain a long dot-free run, so the bug was latent, not new to this
package, but this package is what first triggered it in practice.

**Fix -- typed-field exemption at the construction boundary ("Option B"),
implemented in `src/core/evidence/redaction.ts`** (see that module's own
doc comment for the full design writeup): two typed exemptions from
entropy redaction, applied structurally BEFORE the entropy pass runs
(classify first, redact the rest -- never a post-hoc unhash):

1. **Declared hash**: a whole string value matching
   `^(sha256:)?[0-9a-f]{40,64}$` (a bare 40-char git SHA, a bare 64-char
   sha256 hex digest, or a `sha256:`-prefixed one) is exempt. Whole-value
   match only -- a hash or SHA embedded inside a longer free-text string
   (e.g. `"contract sha256:<hash> failed"`, or a full command line
   embedding a contract path) is NOT exempted and keeps the entropy
   pattern for that embedded span.
2. **Declared or inferred path**: a field whose KEY follows the existing
   `path`/`_path`/`Path` suffix convention (mirroring
   `event-writer.ts`'s `isPathFieldKey`, duplicated as a one-line
   convention check rather than imported, since `redaction.ts` is a core
   module and must not depend on the effects layer) is exempt, AND a value
   that whole-value parses as a safe repo-relative path (contains `/`, no
   leading `/`, no `..` segment, ends in a file extension) is exempt too --
   covering `run_file`, `lifecycle.snapshot`, `contract.file`,
   `active_plan`, and every path-shaped array entry in `allowed_paths`/
   `files_changed` WITHOUT renaming any of these established
   consumer-facing field names.

The secret-value denylist check is unconditional -- it still runs over
every field, exempted or not (a literal secret sitting in a hash-shaped or
path-shaped position still gets replaced; two new tests prove this for
both exemption categories). Free-text fields with no matching exemption
(a command line embedding a path inside other words, `branch` -- a bare
identifier with a `/` but no file extension, so it does not qualify as a
path -- or any other bare long identifier) are UNCHANGED by this fix and
remain subject to entropy redaction exactly as before. This is an
accepted, out-of-ruling-scope residual: no consumer gates on `branch`'s
(or any other free-text field's) exact value, only on the named
consumer-facing fields the ruling scoped this fix to. Recorded here rather
than silently expanding the exemption criteria beyond what was authorized.

**D6 framing**: this is a within-letter refinement, not a re-decision of
D6. D6's frozen text (EPC-00) pins the invariant -- deny-by-construction,
secrets never appear raw -- not this specific character-class regex; the
EPC-01 acceptance record for D6 did not pin the pattern either. The fix
changes WHICH values are subject to the entropy pattern, never removes the
denylist-secret-value check, and preserves "classify first, redact the
rest" as a structural (not post-hoc) property.

**Regression coverage**: confirmed genuine red-then-green directly --
temporarily reverted `redaction.ts` to its pre-fix content and re-ran the
two strengthened end-to-end tests in `tests/evidence-checks-materializer.test.ts`;
both failed showing the exact double-prefix and path-mangling symptoms
byte-for-byte; restored the fix and both passed again (18/18 in that file,
28/28 in `tests/evidence-event-store.test.ts` including 11 new redaction
unit tests: declared-hash whole-value exemption, hash-embedded-in-free-text
non-exemption, double-prefix regression, path-key-convention exemption,
whole-value safe-path exemption for the four named non-conventional
fields, array-entry exemption, `..`-traversal non-exemption, denylist
firing inside both exemption categories, free-text entropy redaction
unchanged, and one end-to-end `appendEvidenceEvent` proof).

## Finding 3 (documentation only, EPC-09 carry-forward)

Two more pre-existing, non-ledger `{}`-shaped first-writers were found
during this ruling's review, distinct from both the two EPC-00-named
sites and the mutation-observed.ts residual (2b), and are NOT touched by
this package (no code change authorized or needed -- fail-closed content,
cannot clobber a real materialization):

- `scripts/plan-to-todo.sh:1090` and `scripts/ensure-task-workflow.sh:899`
  (plus their `assets/templates/helpers/` mirrors): both write
  `echo "{}" > .ai/harness/checks/latest.json` guarded by
  `if [[ ! -f ... ]]`, i.e. only-if-absent. These are project-genesis
  scaffolding (already documented as out-of-scope allowlist entries in
  `tests/evidence-checks-materializer.test.ts`'s no-independent-authoring
  sweep), not this worktree's own live authority path -- they seed a
  BRAND NEW repo/worktree's placeholder before any ledger exists there.
  Carried forward for EPC-09's deprecation-residue scan to decide whether
  these guarded seeds should eventually retire too, once every consumer of
  a freshly-scaffolded repo can tolerate `checks/latest.json` being
  genuinely absent instead of `{}`.
- **The globally installed `repo-harness` binary on this machine is
  version 0.10.1 and still carries the pre-cutover direct `cp` authoring**
  (confirmed directly: the live repro event `evt-01KY4YMNNF0BFAPHV968AX04J6`'s
  `env_provider_id` reads `repo-harness/0.10.1/ws-...`, and `command -v
  repo-harness` resolves to that global install, not this worktree's
  in-progress source). Until the next release publishes this cutover,
  the global CLI is a live legacy writer -- any acceptance/dogfood
  activity in THIS worktree must invoke `bash scripts/verify-sprint.sh`
  directly (which resolves `emit-verify-evidence.ts` from the worktree's
  own `scripts/` via `$helper_dir`, not the global install), never
  `repo-harness run verify-sprint`, or the global binary's OWN legacy `cp`
  would silently re-clobber the materialized file with old-schema content
  and defeat the whole cutover being tested. This is purely an
  operational/dogfood-discipline note for this package and does not change
  any shipped code.

## Design Decisions

- **D7's "worktree_id == current AND contract_id == active contract" collapses
  to one filter.** `EvidenceEventRecord.worktree_id` is already populated with
  the active contract's own slug at emission time (`verify-producer.ts`'s
  `worktreeIdFor`, unchanged, EPC-02). The materializer filters on that single
  field (via the same helper, now exported and reused, not re-implemented) plus
  `subject_hash` exact equality plus trust-class admission; it does not
  introduce a second, separate `contract_id` filter, since none exists on the
  event schema and D3/D5 are frozen/read-only.
- **`content_hash` excludes the provenance block itself.** D8 says
  "content_hash (sha256 of the projection payload itself)". The provenance
  block embeds `content_hash` and a volatile `generated_at`, so hashing the
  whole rendered file would make `content_hash` un-reproducible on replay.
  `content_hash` is computed over the consumer-facing content only
  (`canonicalize()`, EPC-01's own deterministic serializer), so re-materializing
  from the identical accepted event set always reproduces the identical
  `content_hash` (required for EPC-09's drift check to mean anything).
- **Trust-class admission mirrors EPC-04's exact table, re-derived locally.**
  `authoritative_machine` always admitted. `external_attested` admitted
  whenever a syntactically valid Acceptance Policy JSON block exists (the
  schema has no separate "external_pass forbidden" toggle -- `reviewer` is a
  mandatory field). `human_acceptance` admitted only when
  `user_waiver: "allowed"`. `observed` never admitted. Absent/invalid policy
  admits neither of the gated two (default-deny, D4). This is a **local,
  duplicated, structural re-parse** of the same `## Acceptance Policy` fenced
  JSON block `scripts/acceptance-receipt.ts`'s `parseAcceptancePolicy` reads --
  not an import, per the `src/` must-not-depend-on-`scripts/` precedent EPC-04
  set for `attested-import.ts`.
- **The payload upgrade is optional and purely additive, not a breaking
  change to `VerifyProducerInput`.** `runTrace?: JsonValue` is threaded into
  the existing "json" payload's `run_trace` field only when the caller
  supplies it; when omitted, the payload object literal is byte-identical to
  before (verified: `tests/evidence-verify-producer.test.ts`, which is **not**
  in this package's `allowed_paths`, passes unmodified -- 11/11 green). This
  was a deliberate design choice to resolve a real tension: any unconditional
  shape change to the payload would have broken that test's exact
  `toEqual({status, counts, run_snapshot_id})` assertion, and that file is a
  characterization of a module this package legitimately extends but was not
  listed as touchable. Making the extension additive-only resolves the
  tension without silently widening scope or stopping the task.
- **Emission is now attempted for both a passing and a failing verify-sprint
  run**, not only a passing one (the pre-EPC-05 code hardcoded `--status
  pass` and only called `emit_verify_evidence` inside the `exit_code -eq 0`
  branch). This is a necessary, in-scope extension of Goal 3's "verify ->
  emit -> materialize" flow, not scope creep: without it, a failing verify
  run would leave `checks/latest.json` stale (still showing the last
  passing run's content) once direct authoring is gone, since nothing would
  ever emit/materialize a `status: "fail"` projection. `authoritative_machine`
  trust already covers this correctly -- it is a real, subject-bound,
  machine-produced fact regardless of whether the fact is "passed" or
  "failed"; consumers (`workflow_checks_pass`) already read the payload's own
  `status` field, not the event's trust class, to distinguish pass from fail.
- **`checks-materializer.ts` and `emit-verify-evidence.ts` are, and remain,
  source-repo-only tooling.** Neither is listed in
  `assets/workflow-contract.v1.json`'s helper inventory, so `bun run
  sync:helpers` never tries to deploy them -- confirmed identical to the
  pre-existing precedent for `attested-import.ts`/`post-bash-importer.ts`
  (EPC-03/04). This was not a new decision this package made; it surfaced an
  existing, load-bearing consequence of that precedent (see Open Questions).

## Deviations From Plan Or Spec

- **Scope correction, discovered by the full `bun test` run, not silent**:
  the dispatch named `.ai/hooks/lib/workflow-state.sh` as the sole file for
  Goal 4's bootstrap deletion. That file turned out to be a generated
  projection of `assets/hooks/lib/workflow-state.sh`
  (`scripts/sync-hook-sources.ts`: `canonical_root: assets/hooks`,
  `projection_target: .ai/hooks`) -- editing only the projected copy is not
  durable, proven directly: `tests/hook-source-projection.test.ts`'s own
  drift/idempotency checks regenerated `.ai/hooks/` from the canonical
  source mid-run and silently reverted the deletion (caught by re-running
  the full suite, not missed). The fix applies the identical one-line
  deletion to `assets/hooks/lib/workflow-state.sh` as well, then runs `bun
  run sync:hooks` to regenerate the projected copy from it (now
  byte-identical, confirmed via `bun run check:hooks`). Both files are now
  in the contract's `allowed_paths`. This is the same category of
  necessary-not-discretionary widening as `verify-producer.ts`'s payload
  upgrade needing to be additive-only for `tests/evidence-verify-producer.test.ts`
  -- a fact discovered by running the goal's own verification, not a
  unilateral scope decision.
- Otherwise none: the plan's Goals 1-6, D7/D8 predicate, and Genesis note
  were followed as written; the two design points below (fail-path
  emission, additive-only payload) were left as open judgment calls by the
  plan ("decide ... and document") and are recorded here rather than being
  silent.

## Touched Characterization Assertions

Every existing test assertion changed by this package, with before/after
rationale. No assertion outside this list was modified in
`tests/helper-scripts.test.ts`, `tests/prompt-handler.test.ts`, or
`tests/acceptance-receipt.test.ts`.

`tests/prompt-handler.test.ts` and `tests/acceptance-receipt.test.ts`: **zero
assertions touched** -- both construct their own synthetic
`checks/latest.json` fixture content directly (never invoke
`verify-sprint.sh` or `workflow_ensure_harness_surface`), so neither
characterizes the deleted authoring mechanics. Verified green, unmodified.

`tests/helper-scripts.test.ts` (8 `verify-sprint` fixtures; all 8 are
non-git or, where git-backed, still never set `REPO_HARNESS_SOURCE_ROOT` nor
have `scripts/emit-verify-evidence.ts` deployed into the fixture's `scripts/`
-- so emission cannot-binds in every one of them, exit 3, and
`checks/latest.json` is genuinely absent after the cutover):

1. **"verify-sprint should write passing structured checks for the active
   sprint"** -- before: read rich content from `.ai/harness/checks/latest.json`.
   After: assert `checks/latest.json` is absent; read the identical rich
   content from the run snapshot file instead (`.ai/harness/runs/*.json`,
   unchanged -- still directly written by `verify-sprint.sh`, since only
   `checks/latest.json`'s direct authoring was in scope to delete). Every
   field-level assertion value is unchanged; only the source file moved.
2. **"verify-sprint finalizes one AcceptanceReceipt without rerunning
   contract tests"** -- before: asserted the jq-patched `acceptance_receipt`
   (`status: pass, disposition: external_pass, ...`) landed in
   `checks/latest.json` via the deleted `cp`. After: asserts
   `checks/latest.json` retains its **pre-seeded** content
   (`acceptance_receipt: { status: "pending" }`) unchanged, since finalize's
   own emission also cannot-binds in this fixture (no `emit-verify-evidence.ts`
   deployed) and nothing else rewrites the file. This is the one test whose
   assertion *value*, not just its file source, changed -- see Open
   Questions for the residual this documents. `rerunMarker`
   absent/`projectionMarker` present/exit-0 assertions (the test's actual
   named purpose) are unchanged.
3. **"verify-sprint prints a notes promotion-candidate advisory without
   changing exit code"** -- before: read `checks/latest.json` only to embed
   its content in a failure message. After: same status/exit-code
   assertions unchanged; added `expectChecksLatestAbsent` for both fixture
   roots; dropped the (already-incidental) checks-file read from the
   failure-message string.
4. **"verify-sprint should fail when committed branch diff exceeds
   allowed_paths"** -- before/after: identical pattern to #1 (absent +
   read from run snapshot instead); all field values unchanged
   (`status: fail`, `failure_class: allowed_paths`, `diff_base.ref`,
   `files_changed`, `allowed_paths_check`).
5. **"verify-sprint should scope the default branch diff from immutable
   contract-worktree metadata"** -- three sequential `--prepare-acceptance`
   runs in one fixture; each of the three checks-file reads redirected to
   `latestRunSnapshot(cwd)` (a new shared helper that finds the most
   recently generated `.ai/harness/runs/*.json` by its own `generated_at`
   field, robust against filename timestamp collisions). All field values
   unchanged.
6. **"verify-sprint ignores Human Review Card semantics because Markdown is
   projection only"** -- absent + read from run snapshot; `review.status`/
   `review.card` assertions unchanged.
7. **"verify-sprint does not require a Human Review Card authoring path"** --
   identical pattern to #6.
8. **"verify-sprint should write failing structured checks before exiting"**
   -- absent + read from run snapshot; `status: fail`, `contract.status:
   fail`, `acceptance_receipt.status: pending`, `run_file` naming all
   unchanged in value.

Shared test-file additions (not modifications of existing assertions):
`latestRunSnapshot(cwd)` and `expectChecksLatestAbsent(cwd)` helpers, and the
new `tests/evidence-checks-materializer.test.ts` suite (red-first: confirmed
"Cannot find module" before the materializer file existed, by temporarily
removing it and re-running; 17/17 pass after restoring it).

`tests/mutation-observed.test.ts` (orchestrator ruling, residual 2b -- see
Open Questions):

9. **"contract-verification is true only when the active contract's
   exit_criteria references the edited path"** -- before: asserted
   `payload.contract_verification.checks_file` equals
   `'.ai/harness/checks/latest.json'` (the old, now-redirected target).
   After: asserts it equals `'.ai/harness/checks/contract-verify.latest.json'`.
   Every other assertion in this test, and every other test in the file
   (17 total, including the `isCheckpointPath` coverage at "checkpoint is
   true for ... .ai/harness/checks/latest.json"), is unchanged -- that
   guard's check for the acceptance-evidence path is deliberately not
   touched (see Open Questions).

## The unsatisfied-vs-absent choice

Two physically distinct scenarios, resolved differently:

- **Absent**: when `scripts/emit-verify-evidence.ts` cannot even be found
  (no source-repo checkout reachable at `$helper_dir` or via
  `REPO_HARNESS_SOURCE_ROOT`) -- there is no code path capable of invoking
  *any* TypeScript, materializer included, so nothing can render even a typed
  `unsatisfied` file. This is verify-sprint.sh's own reality in every
  deployed/downstream-adopted repo today (the ledger/materializer tooling is
  source-repo-only, mirroring the EPC-03/04 precedent) and in every fixture
  in `tests/helper-scripts.test.ts`.
- **Unsatisfied**: when the materializer function itself *does* run (the
  ledger is reachable) but finds no accepted event matching the exact
  `worktree_id + subject_hash + admitted-trust-class` predicate -- e.g. a
  brand-new contract before its first successful emission, a subject that
  changed since the last accepted event, or (defensively) a matching event
  that for some reason carries no `run_trace` payload at all. Exercised
  directly by `tests/evidence-checks-materializer.test.ts`'s D7 predicate
  matrix; not something `verify-sprint.sh`'s own normal flow produces today
  (a successful emission always carries the run_trace that immediately
  satisfies its own subject), but a real, tested, fail-closed floor for any
  other future caller of `writeChecksLatest`/`buildChecksLatestProjection`.

## The finalize re-materialization decision

`finalize_prepared_acceptance()` re-invokes `emit_verify_evidence` (now with
the jq-patched `$finalized_checks` as its run-trace file and `status=pass`
hardcoded, matching the pre-existing invariant that finalize only ever
reaches this call after every earlier guard already required a passing
state) and, on a successful emission, `emit-verify-evidence.ts` materializes
`checks/latest.json` from the ledger again -- so in a ledger-reachable
context, the acceptance_receipt pending -> pass transition is realized by a
**second** `authoritative_machine` event (appended strictly after the
`user_waiver`/`external_pass`-mapped `human_acceptance`/`external_attested`
event that `acceptance-receipt.ts record`'s CLI wiring already imports,
EPC-04) whose payload carries the patched `acceptance_receipt` block. D7's
winner is simply "last accepted event matching the predicate" -- this second
event wins by append position alone, regardless of trust class, which is
why the patched content becomes visible without needing the
`human_acceptance`/`external_attested` event to itself be D7's winner.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Force `runTrace` required on `VerifyProducerInput` | Rejected | Breaks `tests/evidence-verify-producer.test.ts`'s exact payload assertion; that file is not in this package's `allowed_paths`. Optional/additive resolves the tension with zero consumer-test modification. |
| Materialize unconditionally on every verify-sprint invocation, even cannot-bind | Rejected | There is no reachable code path to do so when the TS tooling itself cannot be found (the overwhelming majority of real-world invocations, per the deployed-helper precedent); "absent" is the only physically honest outcome there. |
| Only emit on a passing verify result (pre-existing behavior) | Rejected | Leaves `checks/latest.json` permanently stale on a fail once direct authoring is deleted -- a real regression to the fail-reporting gate, not just a fixture nuance. |
| Rewrite all 8 `tests/helper-scripts.test.ts` fixtures into full git+ledger integration tests so real materialization exercises them | Rejected (for 7 of 8) | Enormous scope/time cost for a claim ("this deployed-helper simulation should now also simulate a full source-repo checkout") that contradicts the fixtures' own established purpose (simulating a downstream adopter, which never gets the ledger). Redirecting to the unchanged run-snapshot file is the minimal, honest fix. |
| Give `checks-materializer.ts` its own `contract_id` filter separate from `worktree_id` | Rejected | No such field exists on `EvidenceEventRecord`/`SubjectIdentity` (D3, frozen); `worktree_id` already IS the contract slug by construction. Introducing a parallel notion would be a second, redundant authority for the same datum. |

## Open Questions

- **Residual 2a -- accepted by the orchestrator as a known Program
  intermediate state, no action taken here.** The ledger/materializer
  tooling's "source-repo-only" status means `checks/latest.json` becomes
  structurally unavailable in every downstream adopted repo, and in any
  self-hosted worktree without `REPO_HARNESS_SOURCE_ROOT` pointing at a full
  source checkout. Not a regression this package *introduced* --
  `emit-verify-evidence.ts` has never been deployed (static relative import
  of `../src/effects/evidence/verify-producer`; never in
  `assets/workflow-contract.v1.json`'s helper inventory even at EPC-02 time)
  -- but EPC-02..04 never mattered for this because nothing read the ledger
  yet; this package is the first to make `checks/latest.json`'s *entire
  content* depend on that same unreachable tooling. Orchestrator ruling
  (2026-07-22, mid-package): accepted as a known Program intermediate state;
  EPC-09's release closeout must document it; carried forward by the
  orchestrator, not resolved here.

- **Residual 2b -- RESOLVED in this package per orchestrator ruling
  (2026-07-22, mid-package, authorized after initial delivery).**
  `src/cli/hook/mutation-observed.ts`'s `processContractVerification` IS a
  live direct-authoring path for `checks/latest.json` (Stop-time continuous
  contract verification via `verify-contract.sh --report-file`, defaulting
  to the policy `harness.checks_file`). Ruling: row 9's "every direct
  authoring path deleted in this package" acceptance line requires closing
  it here, since it is genuinely live (not dormant), even though it wasn't
  one of EPC-00's two originally-named sites.

  **Fix**: `resolveContractVerificationTarget` now returns a dedicated
  constant, `CONTRACT_VERIFICATION_REPORT_RELATIVE =
  '.ai/harness/checks/contract-verify.latest.json'`, instead of calling
  `resolveChecksFile(repoRoot)`. `resolveChecksFile` itself (the general
  `harness.checks_file` policy resolver) is UNCHANGED -- kept for its
  documented general-purpose role even though, after this fix, nothing else
  in this file calls it (`bun run check:type` confirmed this does not
  produce an unused-declaration error; left in place rather than deleted, to
  keep the diff to exactly the authorized redirect).

  **Rationale recorded** (per ruling): continuous verification is Stop-time
  telemetry ("is the active contract still passing"), not acceptance
  evidence. Writing it to the acceptance-evidence path was exactly the
  last-writer-wins shadow authority the audit called out -- it could
  silently clobber a frozen `--prepare-acceptance` evidence bundle, and the
  two schemas are not even compatible: `verify-contract.sh`'s own
  `write_report()` produces `{contract, run_id, previous_status,
  next_status, failure_class, quiet, strict, read_only,
  executes_contract_commands, budget_ms, total_duration_ms, timed_out,
  total, failed, results}` -- no `source`/`status`/`exit_code` fields at
  all, so nothing downstream could even tell the two apart by content had
  a clobber occurred.

  **Reader trace (full results)**: grepped every reader of
  `checks_file`/`contract_verification`/`.ai/harness/checks/` across
  `src/`, `scripts/`, `tests/`.
  - `pendingPostEditJournalSection` (SessionStart orientation,
    `mutation-observed.ts:664`): reads only `events.length`,
    `oldest.created_at`, `oldest.event_id` for a generic "N pending
    events" message with a static `reference: 'repo-harness run
    verify-contract'` string -- never reads `contract_verification.checks_file`'s
    value. Unaffected.
  - No test anywhere exercises `processContractVerification`'s actual
    subprocess call (codegraph's own blast-radius query confirmed "no
    covering tests found" for that function); the only covering assertion
    was `tests/mutation-observed.test.ts`'s dirty-bit/payload-construction
    test, which characterizes the field's *value*, not a real
    `verify-contract.sh` invocation -- updated (see Touched Characterization
    Assertions).
  - `isCheckpointPath` (line ~424) and the `resolveChecksFile` resolver (line
    ~459): different, unrelated concern -- `isCheckpointPath` flags a
    hand-EDIT (tool-call mutation) of a checkpoint-relevant file, not "where
    does contract-verification write its own report". Decision: do NOT
    extend the guard to the new filename -- the new file is machine-written
    telemetry from a Stop-time subprocess spawn, never itself the target of
    an Edit/Write tool call in normal operation, so covering it would be
    dead code. The existing `.ai/harness/checks/latest.json` check is
    unchanged (hand-editing the acceptance-evidence file is still
    checkpoint-worthy).
  - Every OTHER match (`src/core/adoption/gitignore-plan.ts`,
    `src/core/adoption/standard-plan.ts`, `src/cli/mcp/policy.ts`,
    `src/cli/mcp/tools.ts`, `src/cli/chatgpt-browser/file-policy.ts`,
    `src/effects/review/diff-fingerprint.ts`'s `isOperationalReviewPath`,
    `scripts/check-task-workflow.sh`, `scripts/ensure-task-workflow.sh`,
    `scripts/lib/project-init-lib.sh`, `scripts/archive-workflow.sh`,
    `scripts/sync-codex-installed-copies.sh`) is a GENERIC glob/prefix
    pattern over `.ai/harness/checks/*` or `.ai/harness/checks/**`
    (gitignore entries, MCP read/write-scope allowances, cache-glob
    exclusions, review-subject exclusions, archive-copy globs) -- the new
    `contract-verify.latest.json` file transparently falls under every one
    of these with zero code change required. Confirmed directly: this
    repo's own tracked `.gitignore` already has
    `.ai/harness/checks/*.latest.json` (line 37), matching the new filename.
  - No reader outside this package's `allowed_paths` was found to depend on
    the OLD target path's specific location or content -- the STOP
    condition ("if a reader outside allowed_paths depends on it, STOP and
    report") was not triggered.

  **Changed**: `src/cli/hook/mutation-observed.ts` (redirect + documented
  `isCheckpointPath` decision), `tests/mutation-observed.test.ts` (one
  characterization assertion), `tests/evidence-checks-materializer.test.ts`
  (new direct behavioral test proving the redirect, so the
  no-independent-authoring sweep needs no exclusion for this file -- it
  never needed one mechanically, since the grep patterns only match direct
  `writeFileSync`/`writeFileDurably`/`Bun.write` calls, not a subprocess
  `--report-file` argument; the new test closes that detection gap with a
  precise behavioral proof instead of widening the regex sweep into
  something fragile). Both allowed-path additions recorded in the contract
  (Goal 7).

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
