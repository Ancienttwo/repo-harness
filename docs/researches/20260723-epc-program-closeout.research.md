# EPC Program Closeout Research

> **Date**: 2026-07-23
> **Author**: EPC-09 (`codex/epc-09-drift-eval-release`)
> **Scope**: Sprint C -- Evidence & Projection Convergence
> (`plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`),
> backlog rows 4-13
> **Status of this document**: records the drift/residue results (green),
> the matched-benchmark attempt facts (`failed_during_run`, evidence
> attached), and the orchestrator's frozen-fallback ruling applied in
> response -- see Section 4A and Section 7 for the fallback designation and
> Program closeout.

## 1. Program summary (rows 4-13)

| Row | Package | PR | One-line outcome |
|---:|---|---|---|
| 4 | `epc-00` -- Program reconciliation and design freeze | #116 (`7871f174`) | `POST_VGBR_SHA` pinned at `ba0e3970`; D1-D9 frozen with closed sub-decisions; rows 5-11 confirmed machine-operable, 12/13 amended |
| 5 | `epc-01` -- EvidenceEvent protocol and event store | #117 (`d94d1364`) | Append-only ledger + blob store, genesis/epoch fail-closed, deterministic replay + corrupt-tail quarantine; zero consumer cutover yet |
| 6 | `epc-02` -- authoritative verify producer | #118 (`61657769`) | Verify runner emits subject-bound `authoritative_machine` events; cannot-bind refusals skip rather than fabricate |
| 7 | `epc-03` -- PostBash observed importer | #119 (`691930c0`) | PostBash observations import `observed`-only; provably never satisfies machine gates alone |
| 8 | `epc-04` -- manual/external attested import | #120 (`79f1190a`) | Acceptance receipts import as `attested`/`human_acceptance` via a closed trust mapping, fail-closed |
| 9 | `epc-05` -- `checks/latest` materializer | #121 (`f07a11c9`) | First authority cutover: materialized-only `checks/latest.json`, three direct-authoring paths deleted same-package (verify-sprint `cp`, workflow-state bootstrap, mutation-observed redirect); D6 redaction typed-field exemption fixed a round-1 CRITICAL |
| 10 | `epc-06` -- checkpoint materialization | #122 (`50d3a29e`) | Atomic, content-addressed checkpoint (machine JSON + byte-derived human view); D8 ratification: checkpoints self-reference `source_checkpoint_id`, consumers discriminate on schema, not nullness |
| 11 | `epc-07` -- recovery-view inventory and cutover | #123 (`8274c649`) | One materializer per surviving recovery view, single-hop from the checkpoint; retired writers (bash handoff/resume assembly, `codex-handoff-resume.sh`, `prepare-codex-handoff.sh`, the undeclared `workflow_ensure_harness_surface` placeholder bootstrap) deleted same-package |
| 12 | `epc-08` -- Context Packet cutover | #124 (`92fef5e5`) | Last primary-source re-derivation (`resumeAvailable()`'s marker string-scan) replaced by the checkpoint-backed recovery resolver; 27-state panel green on both frozen token gates |
| 13 | `epc-09` -- drift check, matched post-eval, release closeout | *(this package; PR number assigned by the orchestrator post-merge)* | Drift + residue suites green (this document, Sections 2-3); matched post-EPC benchmark attempted, `failed_during_run` (Section 4); orchestrator-ruled frozen fallback applied -- pre-EPC report designated "descriptive pre-EPC baseline only," no benchmark improvement claimed (Section 4A) |

Rows 1-3 (HRD sprint closeout, the runner subject-immutability fix, and VGBR-R's
authoritative pre-EPC baseline recovery) predate this Sprint C arc and are
recorded in the sprint document's own Program annotation, not repeated here.

## 2. Cross-package projection-drift results

`tests/evidence-projection-drift.test.ts` recomputes each canonical
projection independently, through the same public pure builders/readers
EPC-05/06/07 already export (read-only imports; no EPC-01..08 module was
edited to produce this result):

- **Checkpoint machine/human views** -- re-folding a fixture ledger's
  accepted-event set through `buildCheckpointProjection` and re-rendering
  through `renderCheckpointMarkdown` reproduces the store reader's resolved
  output byte-for-byte. A second test recomputes against THIS worktree's own
  live checkpoint state when one is present, filtering the current ledger
  down to exactly the checkpoint's own declared `source_event_ids` (so
  ledger growth since the last publish is correctly treated as staleness,
  never drift).
- **Recovery views** -- re-materializing (`materializeRecoveryViews`) from
  the same published checkpoint and the same context inputs reproduces
  byte-identical handoff/resume content; the rendered evidence block
  (checkpoint id, source event ids) is checked against the real checkpoint
  just published, not a fabricated claim.
- **Materialized `checks/latest`** -- re-selecting via
  `buildChecksLatestProjection` from the same accepted set reproduces
  byte-identical output; `provenance.content_hash` is independently
  recomputed (sha256 of the consumer-facing fields, provenance block
  excluded) and matches the published hash, both on a fixture and (when this
  worktree's own `checks/latest.json` carries real materialized content --
  not a guarded `{}` seed) on the live file.
- **`tasks/current.md`** -- two independent, non-mutating
  `scripts/refresh-current-status.sh` regenerations agree byte-for-byte
  modulo the volatile `updated_at` line, exactly mirroring the EPC-07
  precedent test.

Result: **21/21 tests pass, zero drift found** (verified this run: `bun test
tests/evidence-projection-drift.test.ts tests/evidence-residue-scan.test.ts`
-> 21 pass / 0 fail / 106 expect() calls).

## 3. Deprecation residue scan results

`evals/harness/epc-retired-surfaces.json` enumerates the eight writers/
placeholders EPC-05/07/08 retired same-package (R5), each with its exact
grep pattern(s) and documented allowed exceptions:

| # | Surface | Retired by | Exact residue signal |
|---|---|---|---|
| 1 | `verify-sprint.sh` direct `cp` onto `checks/latest.json` | EPC-05 | `cp "$checks_report" "$checks_file"` / `cp "$finalized_checks" "$checks_file"` |
| 2 | `workflow_ensure_harness_surface`'s `{}` checks bootstrap | EPC-05 | `printf "{}\n" > "$(workflow_checks_file)"` |
| 3 | `mutation-observed.ts` contract-verification target defaulting to the acceptance `checks_file` | EPC-05 (residual 2b) | `checksFile: resolveChecksFile(repoRoot)` |
| 4 | bash `workflow_write_handoff`'s independent handoff/resume assembly | EPC-07 | `<<EOF_HANDOFF` / `<<EOF_RESUME` / `generated-by: workflow_write_handoff v1` |
| 5 | `codex-handoff-resume.sh`'s independent resume assembly | EPC-07 | local `active_plan()` / `safe_repo_file()` function definitions |
| 6 | `prepare-codex-handoff.sh`'s independent global-packet splice | EPC-07 | `<!-- repo:<key> start -->` splice marker |
| 7 | `workflow_ensure_harness_surface`'s handoff/resume placeholder bootstrap | EPC-07 | the exact bootstrap `printf` one-liners |
| 8 | `session-context.ts`'s `resumeAvailable()` marker/header string-scan | EPC-08 | `text.includes('<!-- generated-by: repo-harness codex-handoff-resume v1 -->')` |

Each pattern was verified precise (not just "currently zero hits" but
genuinely discriminating) against real, still-live lookalikes found while
authoring the list: `policy_get()` is deliberately excluded as a residue
signal for surface 5 (it is a common local-helper name legitimately defined
by six unrelated scripts); surface 4's `<<EOF_HANDOFF` marker legitimately
also appears in `scripts/prepare-handoff.sh`'s own out-of-scope no-library
bootstrap fallback (documented exception); surface 6's splice marker
legitimately also appears in the authoritative materializer and its
standalone CLI duplicate (documented exceptions); surface 7's bootstrap
one-liners have a textually distinct, legitimately-kept sibling in
`scripts/lib/project-init-lib.sh`'s `$target_dir`-prefixed adoption
scaffolding (documented exception, distinguished by construction rather than
needing the exception path at all).

`tests/evidence-residue-scan.test.ts` also carries a red-first proof, run
directly during this package's own execution: a synthetic fixture file
injecting one retired marker (`generated-by: workflow_write_handoff v1`)
under `src/` was created, the sweep test correctly failed and reported the
exact surface/file/pattern triple, the fixture was removed, and the suite
returned to green -- confirming the sweep mechanism genuinely detects a
violation rather than being a vacuously-passing test.

Result: **zero unexcepted hits across `src/`, `scripts/`, `.ai/hooks/`,
`assets/`**.

## 4. Matched post-EPC benchmark -- attempt facts (not accepted)

Per the sprint's Row 3 VGBR-R protocol, reused verbatim for this matched run:

- **Subject**: `POST_EPC_SUBJECT_SHA = 196e787a0ffe15eea4da0a2e50b4f0e04f99a666`
  (equal to this package's own pinned base -- EPC-09 touches no R2
  benchmark-subject input, so the post-EPC subject is exactly the
  post-EPC-01..08 state). Detached checkout at
  `/private/tmp/repo-harness-epc09-subject`, verified `git status --porcelain`
  empty and `HEAD` exactly `196e787a...` both before and after
  `bun install --frozen-lockfile` (environment prep only; `node_modules` is
  gitignored).
- **Subject hash** (git-blob-identity over the R2 input list, computed from
  the detached checkout): `sha256:3bef21e9f809a6acd47f0dc22ea3416ef1fc0ddef26ba15f9150e82943cbb310`.
- **Attempt record**: `.ai/harness/runs/epc-09-post-eval/attempt-post-epc-196e787a-20260723-a01.json`
  (`ATTEMPT_ID = post-epc-196e787a-20260723-a01`), written before invocation
  with `outcome: null`.
- **Invocation** (exactly once, in the detached checkout, no forbidden
  flags): `bun scripts/run-harness-profile-benchmark.ts
  --require-authoritative --provider codex --manifest
  evals/harness/scenarios.json --report
  /private/tmp/repo-harness-epc09-stage/profile-comparison.json`. Provider:
  `codex`, CLI version `codex-cli 0.144.5`.
- **Outcome: `failed_during_run`.** 15 of 27 arms reached a terminal
  outcome before the runner stopped fail-closed (no report is written under
  `--require-authoritative` once an arm fails): **13 passed** (all 9
  `no-harness` arms, plus 4 `adaptive-lite` arms -- `single-file-small-bug`,
  `ordinary-feature`, `database-migration`, `chinese-prompt`) and **2
  `adaptive-lite` arms failed** (`negation`, `cross-capability-feature`).
  The remaining **12 arms never ran** (the other 3 `adaptive-lite`
  scenarios, plus all 9 `strict-harness` arms):
  - `adaptive-lite/negation`: the provider's own tool-exec router raised
    `Rejected("Failed to create unified exec process: No such file or
    directory (os error 2)")` mid-turn inside that arm's isolated sandbox
    workspace, after the model had already correctly diagnosed the seeded
    off-by-one bug (`inclusiveRangeEnd` returning `start + length` instead
    of `start + length - 1`) in its own transcript. A provider/exec
    environment fault inside the runner's own ephemeral per-arm sandbox, not
    a subject-code or EPC-09 defect.
  - `adaptive-lite/cross-capability-feature`: the provider agent was
    repeatedly blocked by the harness's own PreToolUse guards
    (`PlanStatusGuard`, then `ContractScopeGuard`) inside its isolated
    sandbox workspace and never found a path through for that
    profile/scenario combination in the time available.
  - Both failures are internal to the runner's own per-arm sandboxes
    (`/var/folders/.../repo-harness-profile-benchmark-*/adaptive-lite/...`),
    outside this package's `allowed_paths` and outside the frozen
    runner/validator/manifest/fixtures this package must never edit.
- **Reconciliation (gatekeeper round-1 finding 1, 2026-07-23)**: the
  attempt record's own inline note (`arms_completed`) reads "12/27 before
  abort (9 no-harness passed, 3 adaptive-lite passed)" -- that inline note
  is a **recording miscount** (4 `adaptive-lite` arms passed, not 3, so
  9+3=12 undercounts the true 9+4=13). The attempt record's `outcome`,
  `finished_at`, and every other field are correct and are left
  byte-untouched as immutable terminal evidence (no correction field is
  appended to it); the retained `run-invocation.log` at
  `/private/tmp/repo-harness-epc09-stage/run-invocation.log` is ground
  truth and is what every count in this document and its sibling documents
  now reconciles against: **13 passed / 2 failed / 12 never ran** (15/27
  reached a terminal outcome).
- **No report was produced**; nothing was copied into
  `evals/harness/reports/profile-comparison-post-epc.*`; the pre-EPC triplet
  (`evals/harness/reports/profile-comparison.{json,md,sha256.json}`, 27/27
  arms) was never touched and remains the Program's only authoritative
  benchmark evidence.
- **Subject re-verified after the run**: `git status --porcelain` empty,
  `HEAD` still exactly `196e787a...` in the detached checkout -- the
  subject-immutability fix (`vgbr-rf`) held; no mutation occurred despite the
  failure.
- **No rerun was performed.** Per the sprint's frozen attempt discipline and
  this package's own dispatch, a `failed_during_run` outcome gets no
  automatic rerun, no `--regrade-existing`, and no narrowed
  `--profile`/`--scenario` backfill -- a new run requires a new approved
  run-decision.

### Descriptive delta vs. the pre-EPC baseline

**Not produced.** The plan's Goal 3 calls for a descriptive (never causal)
per-profile comparison against the pre-EPC baseline
(`VGBR_BASELINE_SHA = b32b3282`, 27/27 arms, 15m37s, canonical reports at
`evals/harness/reports/profile-comparison.{json,md,sha256.json}`). Since this
attempt produced no report, there is nothing to compare -- a delta table
here would have to compare a real report against a fabricated one, which
this document does not do. The pre-EPC baseline's own summary (unchanged,
for reference only, not a claim about the post-EPC state):

| Profile | Passed | Known tokens | Avg duration ms |
|---|---:|---:|---:|
| no-harness | 9/9 | 535,060 | 32,299 |
| adaptive-lite | 9/9 | 1,775,916 | 63,518 |
| strict-harness | 9/9 | 2,502,266 | 80,530 |

## 4A. Frozen fallback designation (orchestrator ruling, 2026-07-23)

The Program forbids retry-until-green: one protocol-clean attempt that
self-classifies a non-`accepted` outcome is sufficient to trigger row 13's
own cannot-execute fallback (`## Row 13 -- EPC-09 matched post-eval
decision` in the sprint document), not a signal to try again -- and
`adaptive-lite/cross-capability-feature` is independently a known-problematic
scenario (`tasks/todos.md`'s "Lite ceremony phase-3" row already lists
fixing this exact scenario prompt as deferred, unresolved work). The
orchestrator ruled: take the fallback branch, no second attempt.

Per that ruling, `evals/harness/reports/profile-comparison.{json,md,sha256.json}`
(the authoritative VGBR pre-EPC baseline recovered by `vgbr-r`,
`VGBR_BASELINE_SHA = b32b3282`, 27/27 arms, 15m37s) is now designated
**"descriptive pre-EPC baseline only"**. The relabel lives entirely in this
Program's authority documents (this section, the sprint document's Program
annotation, and `docs/CHANGELOG.md`) -- the triplet's own bytes are
untouched; `tests/evidence-residue-scan.test.ts`'s closeout-assertion block
(Section "Checked closeout assertion" below) proves this directly by
recomputing the triplet's sha256 against its own byte-binding sidecar.

**This release closeout claims no benchmark improvement** over the pre-EPC
baseline. With the fallback branch executed, row 13's amended acceptance
line ("one matched post-EPC benchmark... or, if not executed, the VGBR
report relabeled 'descriptive pre-EPC baseline only' with no
benchmark-improvement claim as a checked closeout assertion") is satisfied
-- the fallback IS the completion, not a deferral of it.

### Checked closeout assertion (machine-verified)

`tests/evidence-residue-scan.test.ts` carries a dedicated `describe` block
(`"closeout assertion: frozen fallback (row 13, orchestrator ruling)"`)
that machine-checks, across `docs/CHANGELOG.md`, this document, and the
sprint document:

1. The exact phrase `"descriptive pre-EPC baseline only"` is present in all
   three documents.
2. The exact sentence fragment `"claims no benchmark improvement"` is
   present in all three documents, AND no document asserts an unqualified
   performance gain: every place a document mentions "no benchmark
   improvement" or "must not claim benchmark improvement" is checked to
   confirm a negation word (`no`/`not`/`never`/`n't`/`zero`) sits within the
   80 characters immediately before that mention (case-insensitive,
   normalized across markdown line-wraps) -- an affirmative, unnegated
   mention would fail this check.
3. The pre-EPC triplet's bytes are untouched: `profile-comparison.json`'s
   and `.md`'s recomputed sha256 still match `profile-comparison.sha256.json`'s
   recorded hashes exactly.

Verified this run: `bun test tests/evidence-residue-scan.test.ts` -> 14 pass
/ 0 fail (part of the combined 21/21 total reported in Section 2).

## 5. D8 self-reference ratification (carried from EPC-06)

EPC-06's own closeout ratified a D8 provenance nuance directly relevant to
this package's drift check: a checkpoint's `provenance.source_checkpoint_id`
is **self-referential** (a checkpoint points at itself, never a prior
checkpoint -- this Program never chains checkpoints). Consumers must
discriminate evidence-availability on **schema shape**
(`available: true` vs. the typed `available: false` union), never on
whether `source_checkpoint_id` happens to be non-null, since it is *always*
non-null for a real, resolved checkpoint by construction. This package's own
drift test for the checkpoint projection (Section 2) exercises exactly this
invariant (`provenance.source_checkpoint_id` equals `checkpoint_id` in every
fixture assertion).

## 6. Carried-forward items (accepted intermediate states)

Recorded here for the record; each already has operator guidance in
`docs/CHANGELOG.md`'s `[Unreleased]` entry:

1. **Downstream ledger-tooling availability gap.** Adopted repos running the
   packaged CLI (not this source checkout) do not yet receive
   `emit-verify-evidence.ts` or the materializer modules; `checks/latest.json`
   stays structurally absent there until the next release ships this
   cutover (EPC-05 "Residual 2a," accepted by the orchestrator mid-Program,
   not resolved by any single EPC row).
2. **Live legacy global CLI.** This machine's globally installed
   `repo-harness` binary predates this cutover and still carries the retired
   `cp`-based `checks/latest.json` authoring; it is a live legacy writer
   until refreshed (EPC-05 Finding 3). Operator guidance: refresh via the
   standard install profile; invoke `bash scripts/verify-sprint.sh` directly
   in self-hosted worktrees until then.
3. **Guarded-seed `{}` bootstraps.** `scripts/plan-to-todo.sh` and
   `scripts/ensure-task-workflow.sh` still seed a literal `{}` into
   `checks/latest.json` on brand-new project genesis, guarded strictly
   only-if-absent. These are non-ledger first-writers by design -- they
   never clobber real materialized content (fail-closed on `-f` check) and
   are explicitly out of this Program's cutover scope; whether they should
   eventually retire too (once every consumer can tolerate a genuinely
   absent file on a fresh repo) is left for a future package to decide, not
   this closeout.
4. **Deferred matched-benchmark re-attempt.** A future approved benchmark
   package may re-attempt the matched post-EPC comparison, contingent on
   the deferred cross-capability-feature scenario fix (see `tasks/todos.md`'s
   "Lite ceremony phase-3" row, which already lists fixing the
   `cross-capability-feature` scenario prompt -- "create its required
   workflow artifacts" -- as deferred, unresolved scope). Until that fix
   lands, re-running the matched benchmark unchanged risks repeating the
   same known-problematic arm rather than producing new evidence.

## 7. Fallback ruling applied -- Program closeout

The orchestrator reviewed this attempt's evidence (Section 4: one
protocol-clean invocation, `failed_during_run` -- 13 passed, 2 failed, 12
never ran, 15/27 reached a terminal outcome -- both failures internal to
the runner's own per-arm sandboxes, subject held immutable throughout) and
ruled: take row 13's frozen cannot-execute fallback branch,
no second attempt -- retry-until-green is exactly the discipline this
Program forbids, and `cross-capability-feature` is independently a
known-problematic scenario per the deferred-goal ledger (Section 6, item 4).
The fallback has been applied (Section 4A): the pre-EPC VGBR report is
designated "descriptive pre-EPC baseline only," the release closeout claims
no benchmark improvement, and both are machine-checked closeout assertions,
not prose. **Row 13's amended acceptance line is satisfied via the
fallback branch** -- the sprint document's `Status` header is accordingly
flipped to `Done`. This package's own contract `Status` stays `Active`
until this PR actually merges (consistent with every sibling EPC-05..08
contract, whose own `Status: Done` is likewise recorded only at merge, not
at technical completion), and sprint backlog row 13's own checkbox is left
unchecked -- both are the orchestrator's explicit post-merge action, per
the dispatch's own instruction, not a sign that anything here remains
incomplete.
