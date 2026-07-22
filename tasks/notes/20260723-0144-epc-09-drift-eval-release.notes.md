# Implementation Notes: epc-09-drift-eval-release

> **Status**: Active
> **Plan**: plans/plan-20260723-0144-epc-09-drift-eval-release.md
> **Contract**: tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md
> **Review**: tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md
> **Last Updated**: 2026-07-23 02:50
> **Lifecycle**: notes

## Orchestrator ruling (2026-07-23, mid-package): frozen fallback applied

After this package's first report (`RESULT: PARTIAL`, flagging the
`failed_during_run` attempt and the deliberate choice not to flip the
sprint `Status` to `Done`), the orchestrator reviewed the attempt evidence
and ruled: **take row 13's frozen cannot-execute fallback branch, no second
attempt.** Rationale given: one protocol-clean failed attempt is sufficient
to trigger the fallback (retry-until-green is exactly the discipline this
Program forbids), and `adaptive-lite/cross-capability-feature` is
independently a known-problematic scenario per `tasks/todos.md`'s "Lite
ceremony phase-3" row (already lists fixing that exact scenario prompt as
deferred work). This **resolves** the "Deviations" entry below in favor of
flipping `Done` -- recorded there as originally written (my reasoning was
sound given the information available at the time; the orchestrator then
supplied the missing piece: the Program's own no-retry rule plus the
independent known-flaw context for the failing scenario).

Authorized changes, executed and amended into the single existing commit
(never pushed):

1. **Relabel in Program authority documents only, pre-EPC triplet bytes
   untouched.** `docs/CHANGELOG.md`, `docs/researches/
   20260723-epc-program-closeout.research.md` (new Section 4A + updated
   Section 7 + Program-summary row 13 + header blurb), and the sprint
   document's EPC-09 Program annotation now all state: the authoritative
   VGBR pre-EPC report is designated **"descriptive pre-EPC baseline
   only"**, and the release closeout **claims no benchmark improvement**.
2. **Checked closeout assertion** added to `tests/evidence-residue-scan.test.ts`
   (new `describe` block, see Design Decisions below for the exact
   mechanism) -- 3 new tests, all green.
3. **Sprint `Status` header flipped `Approved` -> `Done`.** Row 13's own
   backlog checkbox is untouched (orchestrator's explicit post-merge
   action).
4. **Closeout research doc**: attempt-facts table (Section 4) kept as an
   honest record of what happened; added Section 4A (fallback designation)
   and carried-forward item 4 (future re-attempt contingent on the
   `cross-capability-feature` scenario fix); `tasks/todos.md` itself was NOT
   edited beyond what the plan-capture projection already did.
5. **Attempt record left untouched** -- `outcome: "failed_during_run"`
   remains immutable evidence; no rerun was performed; ephemeral
   directories were not deleted.
6. **Re-verified**: `bun test tests/evidence-residue-scan.test.ts
   tests/evidence-projection-drift.test.ts` -> 21 pass / 0 fail / 106
   expect() calls; `bash scripts/check-task-workflow.sh --strict` -> OK;
   `bun scripts/contract-run.ts preflight ... --json` -> `preflight_pass`.
   The full-suite run is cited from the earlier verification pass (1844
   pass / 1 skip / 1 fail across 152 files; the 1 failure,
   `tests/state/state-concurrency.test.ts`, confirmed flaky via an isolated
   rerun at 11/11 pass, outside this package's `allowed_paths`) rather than
   re-run, per the orchestrator's own explicit authorization to cite it.

## Gatekeeper round-1 corrections (2026-07-23, mid-package): three MEDIUM findings

Gatekeeper round 1 on the amended commit returned FAIL on three
documentation/contract-consistency MEDIUMs (everything structural reported
clean). Orchestrator relayed the findings and ruled to apply all three
exactly, amended into the same single commit:

1. **Arm-count consistency (finding 1) -- a real recording miscount, now
   reconciled.** This package's own attempt record
   (`.ai/harness/runs/epc-09-post-eval/attempt-post-epc-196e787a-20260723-a01.json`)
   carries an inline `arms_completed` note reading "12/27 before abort (9
   no-harness passed, 3 adaptive-lite passed)" -- undercounting by one
   (`adaptive-lite` arms 10/11/13/14 all show `-> passed` in
   `run-invocation.log`, i.e. 4 passed, not 3; 9+4=13, not 9+3=12). That
   miscount then propagated, worded three different (all wrong) ways, into
   the closeout research doc, the sprint annotation, and this notes file.
   Ground truth per the retained `run-invocation.log`: **13 arms passed (9
   `no-harness` + 4 `adaptive-lite`: `single-file-small-bug`,
   `ordinary-feature`, `database-migration`, `chinese-prompt`), 2
   `adaptive-lite` arms failed (`negation`, `cross-capability-feature`),
   15/27 reached a terminal outcome, 12 never ran** before the fail-closed
   abort. Fixed in all four tracked-doc locations the gatekeeper cited
   (research doc Section 4 outcome bullet + Section 7; sprint Program
   annotation; this file's Deviations entry + Attempt Timeline item 7). The
   attempt record itself stays **byte-untouched** (immutable terminal
   evidence -- no correction field was appended); instead, ONE
   reconciliation bullet was added directly in the research doc's Section 4
   (attempt-facts section) naming the miscount explicitly and pointing at
   `run-invocation.log` as ground truth.
2. **Stale claims (finding 2).** The research doc's Section 2 result line
   still read the pre-closeout-assertion test count (`18/18`, `92 expect()`
   calls) after `tests/evidence-residue-scan.test.ts` grew by 3 tests in the
   prior round; corrected to the HEAD-accurate `21/21` / `106 expect()`
   calls. Section 4A's closing line pointed at a "Verify section at the end
   of this document" that was never actually added; dropped the dangling
   reference (replaced with the real, already-known pass count for that one
   file, rather than adding a new section).
3. **Contract exit criteria still described the pre-fallback success path
   (finding 3).** `tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md`'s
   `exit_criteria` was never amended when the fallback branch was applied
   two rounds ago -- `artifacts_exist` still listed the never-produced
   `profile-comparison-post-epc.*` triplet, one `manual_checks` line still
   read "outcome accepted," and `evidence_requirements.benchmark` still read
   `required`. Amended to the ruled fallback branch (see the contract's own
   `## Exit Criteria` section and its new closing note for the exact
   before/after); this package's own contract `Status` stays `Active`
   (unaffected by this correction -- still tied to merge, not technical
   completion, per the prior round's reasoning).

All four re-verification commands passed after these fixes (see the
`Verify` evidence cited in this package's final report for this round); the
gatekeeper's own full-suite run for this turn (1848 pass / 0 fail) is cited
per explicit authorization rather than re-run.

## Design Decisions

- **Closeout-assertion mechanism for "no benchmark-improvement claim"
  (orchestrator ruling, see above).** Deliberately NOT true negation-scope
  parsing. Every case-insensitive occurrence of the two-word phrase
  `benchmark improvement` or the hyphenated `benchmark-improvement` is
  found in the three Program authority documents (whitespace normalized to
  single spaces first, since hard-wrapped markdown prose can put a literal
  newline between the two words); for each occurrence, the 80 characters
  immediately preceding it are checked for a negation marker
  (`no`/`not`/`never`/`n't`/`zero`). This window-based check (not strict
  immediate-adjacency) was necessary because the FROZEN, pre-existing
  EPC-00 text in the sprint document phrases the negation as "must **not**
  **claim** benchmark improvement" -- the negation word is several words
  away from the phrase it governs, with "claim" in between. An
  immediate-adjacency check (requiring "no" directly before the phrase)
  would have incorrectly flagged that frozen, correct, pre-existing
  sentence as a violation. Discovered by first running the test against the
  real documents (not assumed) and inspecting the exact frozen wording at
  `plans/sprints/...sprint.md`'s "Row 13 -- EPC-09 matched post-eval
  decision" section (a section this package must not edit).
- **The mechanism's own description in the closeout research doc initially
  tripped its own check.** Prose describing what the test looks for
  (quoting `"benchmark improvement"`/`"benchmark-improvement"` as bare
  literal strings, with no negation word nearby, since it was explaining
  the pattern rather than asserting anything about the benchmark) matched
  the checker's own pattern without a preceding negation marker. Caught by
  running the test itself (red), not by manual re-reading; fixed by
  rephrasing that one paragraph to describe the check by example (`"no
  benchmark improvement"` / `"must not claim benchmark improvement"`)
  instead of by bare cross-reference to the search phrase. Left as a
  concrete instance in this notes file since it is a genuine, repeatable
  gotcha for any self-describing machine check: a check's own documentation
  can trip the check if it isn't written with the same discipline the check
  enforces.
- **Pre-EPC triplet byte-untouched proof reuses the existing sha256 sidecar
  rather than hardcoding expected hashes.** `profile-comparison.sha256.json`
  already records the frozen `json`/`markdown` sha256 values (written at
  `vgbr-r` time); recomputing those two files' sha256 now and comparing
  against the sidecar's own recorded values is a direct, dependency-free
  proof that this package's relabeling never touched the triplet's bytes --
  no new fixture or hardcoded hash constant needed.

## Deviations From Plan Or Spec

- **Residue list schema: one global `scan_roots`/`scan_extensions` pair, not
  per-surface roots.** The dispatch's own wording ("asserts zero unexcepted
  hits across `src/ scripts/ .ai/hooks/ assets/`") describes one aggregate
  sweep surface, and `allowed_exceptions` per surface is the documented
  mechanism for legitimate same-root collisions -- matching the existing
  `no-independent-authoring` sweep style already established in
  `tests/evidence-checks-materializer.test.ts`/
  `tests/evidence-recovery-materializer.test.ts`. Discovered three real
  same-root collisions while verifying pattern precision (not assumed):
  `scripts/prepare-handoff.sh`'s own legitimate out-of-scope `<<EOF_HANDOFF`
  fallback (EPC-07 "classified out of scope"); `src/effects/evidence/
  recovery-materializer.ts` + `scripts/recovery-view-cli.ts` (+ its mirror)
  legitimately rendering the same `<!-- repo:<key> start -->` splice marker
  as the authoritative writer and its standalone duplicate;
  `scripts/lib/project-init-lib.sh`'s textually-distinct `$target_dir`-
  prefixed adoption-scaffolding bootstrap (EPC-07 "classified out of
  scope"), which the precise pattern already excludes by construction but
  is documented as an exception anyway for self-documentation.
- **`policy_get()` deliberately excluded as a residue signal.** Verified via
  direct grep before writing the JSON: `policy_get()` is a common local-
  helper name legitimately defined by six unrelated scripts
  (`ship-worktrees.sh`, `sprint-backlog.sh`, `contract-worktree.sh`,
  `plan-to-todo.sh`, `check-task-workflow.sh`, `heartbeat-triage.sh`). Using
  it as surface 5's signal would have produced six false positives on first
  run. `active_plan()`/`safe_repo_file()` as bash function DEFINITIONS
  (not the common `policy_get()` idiom) are confirmed unique to the retired
  `codex-handoff-resume.sh` body.
- **Surface 8's pattern matches the retired CALL SHAPE, not the marker
  literal.** `resumeAvailable()`'s retired code did
  `text.includes('<!-- generated-by: repo-harness codex-handoff-resume v1
  -->')`; the marker string itself is NOT retired (`LEGACY_RESUME_MARKER` in
  `recovery-materializer.ts` and its duplicate in `recovery-view-cli.ts`
  still render it verbatim, by design, as a stable external-observable-
  contract string for the pre-EPC-07 two-writer era). Matching the full
  `text.includes(['"]<marker>['"]\)` call shape instead of the bare literal
  avoids every legitimate rendering site without needing an
  `allowed_exceptions` entry at all.
- **Checkpoint live-state drift check filters the CURRENT ledger down to
  the checkpoint's own declared `source_event_ids`, rather than comparing
  against whatever `readAcceptedEvents` returns wholesale.** A live ledger
  legitimately grows between one Stop's checkpoint publish and the next
  (new events appended, no new checkpoint yet) -- that is staleness, not
  drift. Recomputing from exactly the historically-covered event IDs (still
  resolvable in the current ledger, since accepted events are never
  rewritten in place, D1) isolates the actual property this Goal cares
  about: given the declared source set, does the pure builder reproduce the
  exact published bytes.
- **Recovery-view drift check stays fixture-only, no live-state variant.**
  The dispatch's "when present" qualifier is attached explicitly to the
  checkpoint bullet only ("checkpoint machine/human ... over a fixture
  ledger AND over this worktree's live state when present; recovery views
  (re-materialize, byte-compare)" -- no live-state clause on the second
  clause). A live-state recovery-view check would also need to freeze the
  volatile workflow-context inputs (git diff, active plan, run id) to be
  meaningful, which is a materially larger undertaking than what was asked;
  not built, to avoid unrequested scope.
- **`tasks/current.md`'s drift test is a literal duplicate of the existing
  EPC-07 precedent test**, per the dispatch's own explicit instruction
  ("double-regeneration comparison per EPC-07 precedent"). Intentional,
  not an oversight.
- **Contract's `Base SHA` doubles as `POST_EPC_SUBJECT_SHA`, both recorded
  in the header with the touches-no-subject-input rationale** (per the
  dispatch), rather than treating them as two independently-pinned values
  that happen to be equal.

## Deviations From Plan Or Spec

- **Matched benchmark: attempted, not accepted; the fallback was NOT
  applied.** The ONE authoritative invocation (in the detached checkout,
  `--require-authoritative --provider codex --manifest
  evals/harness/scenarios.json`, no forbidden flags) self-classified
  `failed_during_run` -- 13 passed (9 `no-harness` + 4 `adaptive-lite`), 2
  `adaptive-lite` arms failed, 15/27 reached a terminal outcome, 12 never
  ran (two `adaptive-lite` arms failed inside the runner's own isolated
  per-arm sandboxes -- see the closeout research doc, Section 4, for full
  evidence). Per this package's explicit
  dispatch instruction ("If it fails ... report RESULT: PARTIAL with full
  evidence -- the orchestrator decides the fallback"), no rerun was
  performed and the plan's own frozen fallback (relabel the pre-EPC VGBR
  report "descriptive pre-EPC baseline only") was deliberately NOT applied
  unilaterally -- that relabeling is an explicit orchestrator decision, not
  this package's to make. The attempt record, the sprint's new Program
  annotation, the changelog, and the closeout research doc all describe the
  actual `failed_during_run` outcome factually; none fabricates a 27/27
  result or a descriptive delta that cannot exist without a report.
- **Sprint document `Status` header left at `Approved`, NOT flipped to
  `Done`.** The dispatch's Deliverable D instruction says "header Status ->
  Done," written assuming the matched-benchmark condition would be met. The
  plan's own Verification Boundary requires "one matched post-EPC benchmark
  invocation ... passing before promotion" as one of several closeout
  conditions, and that condition is not met by this attempt. Flipping
  Program-wide `Status: Done` while a named verification-boundary condition
  is unmet would misrepresent the Program's actual state (the exact
  "distribution/verification state collapse" this repo's own anti-patterns
  warn against). This package's own contract `Status` likewise stays
  `Active`, not `Done`. Row 13's own Status/checkbox in the backlog table is
  untouched either way, per the dispatch's explicit instruction (the
  orchestrator flips it post-merge with the PR number) -- that part was
  followed exactly regardless of this deviation. **Flagged here for the
  orchestrator to override if a different call is preferred**; the Program
  annotation extension (subject facts, attempt id, actual outcome, the
  R1 `POST_EPC_SHA` note) was still written in full per the dispatch.

  **RESOLVED (2026-07-23, orchestrator ruling) -- see the "Orchestrator
  ruling" section at the top of this file.** The orchestrator reviewed this
  exact flag and ruled to take the frozen fallback branch; the fallback
  relabel is now applied in all three Program authority documents, and the
  sprint `Status` header is now flipped to `Done`. Both bullets above are
  left as originally written (accurate history of the reasoning at the time
  this package first reported), not rewritten after the fact.
- **Contract exit criteria left describing the pre-fallback success path
  for two rounds -- caught by gatekeeper round-1 finding 3, now amended.**
  When the fallback branch was first applied, this package deliberately did
  not touch the contract's `exit_criteria` (Deliverable A was already
  complete at that point, and the fallback ruling's authorized-changes list
  didn't name the contract). The gatekeeper correctly flagged this as a
  genuine staleness: `artifacts_exist` still named the never-produced
  `profile-comparison-post-epc.*` triplet, one `manual_checks` line still
  read "outcome accepted," and `evidence_requirements.benchmark` still read
  `required`. All three (plus `evidence_requirements`'s explanatory comment
  and this amendment note) are now fixed to describe the actual, ruled
  fallback branch -- see the "Gatekeeper round-1 corrections" section at
  the top of this file for the full before/after. The contract's second
  `manual_checks` line ("Post-EPC triplet byte-bound...") was left
  untouched: the orchestrator's relayed finding named exactly four
  sub-items (a-d) and did not include this line; flagged here rather than
  silently rewritten, in case a future round wants it addressed too.
- Otherwise none: Goals 1/2/4 (drift check, residue scan, changelog +
  closeout doc + sprint annotation extension) were completed exactly as
  specified.

## Touched Characterization Assertions

**None.** This package added two new test files
(`tests/evidence-projection-drift.test.ts`,
`tests/evidence-residue-scan.test.ts`) and touched no existing test file's
assertions -- every EPC-01..08 test file (`tests/evidence-*.test.ts`,
`tests/stop-handler.test.ts`, `tests/session-context.test.ts`,
`tests/helper-scripts.test.ts`, `tests/harness-benchmark-matrix.test.ts`,
etc.) is byte-unmodified by this package, consistent with the read-only
EXECUTION_BOUNDARY over every EPC-01..08 module.

## Red-First Evidence

- **Residue scan**: genuinely red-then-green, executed directly (not just
  historical git-diff evidence). A synthetic fixture file
  (`src/__epc09_redfirst_scratch__/fixture.ts`, deleted immediately after)
  injecting the literal retired marker `generated-by: workflow_write_handoff
  v1` was created; `bun test tests/evidence-residue-scan.test.ts` correctly
  failed and reported the exact `{surface, file, pattern}` triple
  (`workflow-write-handoff-heredoc`, the fixture path, the marker); the
  fixture was removed and the suite returned to 11/11 green. Confirms the
  sweep mechanism detects a real violation, not a vacuously-passing test.
- **Drift check**: the retired-vs-current code shape for every projection
  was confirmed via `git show <EPC-05/07/08 commit>` diffs before writing
  each grep pattern (cited by surface in `evals/harness/epc-retired-
  surfaces.json`'s own `description` fields and in the closeout research
  doc); a literal revert-and-rerun of EPC-05/06/07/08's own production code
  was out of this package's `allowed_paths` (read-only EXECUTION_BOUNDARY),
  so the historical diff comparison is the feasible substitute the plan's
  own "red-first where feasible" qualifier anticipates.

## Attempt Timeline (matched post-EPC benchmark)

All times UTC.

1. `17:51` -- Fresh worktree HEAD confirmed `196e787a...`, matching the
   pinned base exactly.
2. `17:51` -- Detached subject checkout created at
   `/private/tmp/repo-harness-epc09-subject` via
   `git worktree add --detach ... 196e787a...`; `git status --porcelain`
   empty, `HEAD` exact.
3. `17:52` -- `bun install --frozen-lockfile` run in the subject checkout
   (environment prep, `node_modules` gitignored); re-verified porcelain
   empty and `HEAD` unchanged after.
4. `17:52` -- `EXPECTED_SUBJECT_HASH` computed from the detached checkout
   (`git ls-tree -r 196e787a -- <R2 input list> | sort | shasum -a 256`) =
   `sha256:3bef21e9f809a6acd47f0dc22ea3416ef1fc0ddef26ba15f9150e82943cbb310`.
5. `17:52:23` -- Attempt record written FIRST, `outcome: null`
   (`.ai/harness/runs/epc-09-post-eval/attempt-post-epc-196e787a-20260723-a01.json`).
6. `17:52:2x` -- ONE invocation launched in the detached checkout (no
   `--profile`/`--scenario`/`--regrade-existing`), logged to
   `/private/tmp/repo-harness-epc09-stage/run-invocation.log`, monitored in
   the background (never polled/slept in a loop; a background watcher
   reported completion).
7. `~18:00:35` -- Runner exited after 15/27 arms reached a terminal outcome:
   13 passed (9 `no-harness` + 4 `adaptive-lite`), 2 `adaptive-lite` arms
   (`negation`, `cross-capability-feature`) failed, and the remaining 12
   never ran; no report file was written to `REPORT_STAGE_DIR` (fail-closed
   under `--require-authoritative`).
8. `~18:01` -- Subject re-verified: `git status --porcelain` empty, `HEAD`
   still exactly `196e787a...` -- the `vgbr-rf` subject-immutability fix
   held; no mutation despite the failure.
9. `~18:02` -- Failure evidence gathered read-only from the runner's own
   ephemeral per-arm sandbox logs (`provider.stderr.txt`, `provider.jsonl`)
   under `/var/folders/.../repo-harness-profile-benchmark-*/` -- outside
   this package's `allowed_paths`, read for diagnostic context only, no
   files there were modified.
10. `~18:02` -- Attempt record updated: `outcome: "failed_during_run"`,
    `finished_at: "2026-07-22T18:00:35.000Z"`, full failure summary,
    `post_epc_triplet_promoted: false`, `rerun_performed: false`.
11. No promotion (`evals/harness/reports/profile-comparison-post-epc.*` was
    never created); the pre-EPC triplet was never touched; no second
    invocation was made.

## Ephemeral Directories (left in place per dispatch, not deleted)

- Detached subject checkout: `/private/tmp/repo-harness-epc09-subject`
  (clean, `HEAD` = `196e787a0ffe15eea4da0a2e50b4f0e04f99a666`, verified
  after the run).
- Report stage directory: `/private/tmp/repo-harness-epc09-stage`
  (contains `run-invocation.log` only; no report was produced).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Apply the plan's own frozen fallback (relabel pre-EPC report "descriptive pre-EPC baseline only") unilaterally | Rejected | This package's explicit dispatch reserves that decision for the orchestrator ("the orchestrator decides the fallback"); applying it here would be a silent scope decision on a Program-wide closeout claim |
| Rerun the benchmark once more since only 2/27 arms failed and both look like environment flakes | Rejected | Explicit dispatch: "do NOT rerun" on any non-accepted outcome; the sprint's own frozen attempt discipline treats a new run as requiring a new approved run-decision, not an automatic retry |
| Flip sprint `Status` to `Done` since 4 of 5 EPC-09 goals fully succeeded | Rejected | The plan's own Verification Boundary names the matched benchmark as a required closeout condition; flipping `Done` while it is unmet misrepresents Program state (see Deviations) |
| Scope residue patterns per-surface to only the exact retired file, skipping the broader four-root sweep | Rejected | The dispatch explicitly asks for one sweep "across src/ scripts/ .ai/hooks/ assets/"; the broader sweep also caught three real legitimate-collision cases worth documenting as exceptions, which a narrowly-scoped check would have missed entirely |

## Open Questions

- None blocking. The one substantive open item -- whether/how to proceed
  after `failed_during_run` -- is explicitly the orchestrator's decision per
  this package's own dispatch, not an open question this package leaves
  unresolved by omission.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots / attempt record: `.ai/harness/runs/epc-09-post-eval/`
- Closeout research doc: `docs/researches/20260723-epc-program-closeout.research.md`
- Drift + residue test runs: `bun test tests/evidence-projection-drift.test.ts tests/evidence-residue-scan.test.ts` -> 18 pass / 0 fail / 92 expect() calls

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The `policy_get()` common-helper-name false-positive risk (and the
  general pattern of "verify a residue/no-independent-authoring grep
  pattern doesn't collide with an unrelated legitimate definition before
  committing it") is a repeat-relevant discovery for any future
  retired-surface list -- candidate for `tasks/lessons.md` if another task
  independently rediscovers the same class of false positive.
- Otherwise: promote to `docs/researches/` only when durable repo knowledge
  with evidence (already done, this document); promote to harness asset
  files only after verification across more than one task or fixture.
