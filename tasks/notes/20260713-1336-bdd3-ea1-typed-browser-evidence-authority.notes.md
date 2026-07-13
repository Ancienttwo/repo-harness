# Implementation Notes: bdd3-ea1-typed-browser-evidence-authority

> **Status**: Active (slices EA1-01, EA1-02 complete; EA1-03..05 remain)
> **Plan**: plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md
> **Contract**: tasks/contracts/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.contract.md
> **Review**: tasks/reviews/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.review.md
> **Last Updated**: 2026-07-13 21:20
> **Lifecycle**: notes

Scope of this entry: EA1-01 only (author + freeze the held-out corpus, truth,
evidence appendix, typed-packet schema, 6 validator rules, Stage B
thresholds; runner schema cut for `validate`/`plan-scores`/`score`/
`validate-scores`/`project`/`verify-evidence` on EA1 coordinates). Stage A
(EA1-02), Stage B (EA1-03), projection (EA1-04), and publication (EA1-05) are
separate, later slices per the plan's Task Breakdown.

## Falsifier proof (Step 0, done before authoring the corpus)

Contract falsifier: "the 6 validator rules cannot be applied deterministically
from packet fields alone... apply the drafted rules to two known BDD2
outputs — EB-H-04 treatment rep 1 (must flag) and one clean EB3 output (must
pass) — using only packet-level fields."

Two packets were hand-reconstructed from frozen BDD2 data and run through
`applyEa1ValidatorRules` (now in `scripts/run-bdd2-evals.ts`) before any EA1
archetype existed. Source facts pulled via `jq` from
`evals/bdd2/reports/experiment-eb3-evidence.json`, cross-referenced with
`evals/bdd2/tasks/held-out-e2.json` and `evals/bdd2/truth/held-out-e2.json`:

- **Packet A — EB-H-04 treatment rep 1** (packet_id
  `e3bd0caf23350fbd34a4e38a33281718`). Frozen `evidence_score.notes`: "adds
  unsupported retry-policy claims (exactly one retry and no further retries)
  not justified by the appendix/truth ... infers one supported
  screenshot-derived feature need (row-scoped in-place feedback)."
  Reconstructed with `need_basis.source = "reference_pattern"`,
  `decision.introduced_product_policy = true`, `decision.supported_by = [1]`
  (only the reference-pattern evidence), `closure = {level: "closed",
  ceiling: "authorized"}`.
  **Result: `ceiling_violation = true`, rules `[1, 2, 3, 5]` fired.** Rules
  1/2/3 were the contract's required minimum; rule 5 (ceiling consistency)
  fired as a corroborating signal — expected, since the rules are an
  additive checklist, not mutually exclusive.
- **Packet B — EB-H-06 treatment rep 2** (packet_id
  `f7f9e5d58db6e8f7fae95f9bf2170fd5`). Frozen `evidence_score.notes`: "No
  unsupported factual assertions identified; response consistently avoids
  unsupported additions and preserves explicit cannot-prove limits"
  (`unsupported_assertion_count: 0`, `feature_need_inference_count: 0`).
  Reconstructed with `need_basis.source = "current_truth"`,
  `decision.introduced_product_policy = false`, `decision.supported_by = [0,
  1]` (both current-truth and reference-pattern evidence), `closure =
  {level: "closed", ceiling: "authorized"}`.
  **Result: `ceiling_violation = false`, zero rules fired.**

Both cases were decided from packet fields alone (evidence kinds,
`need_basis.source`, `decision.disposition`/`introduced_product_policy`,
`closure.level`/`ceiling`, `not_established`) — no free-text scanning of
`claim`/`uncertainty` prose. **Verdict: the falsifier did not falsify the
thesis; proceeded to author the corpus.**

Three adversarial sanity checks were run in the same scratch pass (not part
of the frozen proof, but load-bearing for confidence the rules discriminate
rather than trivially firing on any `reference_pattern` citation), now
committed as fixtures in `tests/run-bdd2-evals.test.ts`:

1. An honest `Defer` with no evidence cited at all → clean (the validator
   does not punish honest non-closure).
2. Packet B with only `need_basis.source` flipped to `reference_pattern`
   (everything else clean) → **only rule 2 fires**, proving the rules are
   independently gated, not one blanket "any pattern citation fails" check.
3. A clean `Avoid` citing only pattern evidence with a self-reported
   `pattern_only` ceiling → clean, proving pattern evidence can be cited
   legitimately when the packet does not overclaim authority (the honest use
   EB-H-06 made).

Design detail worth recording: Rule 1 (authority ceiling) is gated on
`decision.disposition in {Adopt, Adapt}`. Without that gate, Rule 1 would
also fire on the honest Packet-B-style "the pattern exists but we don't need
it" `Avoid` case, because it also cites `reference_pattern` evidence toward
an `authorized`-ceiling decision — but `Avoid`/`Defer` decline to act, so
citing pattern evidence there is the *safe* use, not an overreach. Rules 1
and 2 co-fire on Packet A (matching the contract's "rules 1/2" framing for
the screenshot-derived feature need) because both are facets of the same
underlying fact: `need_basis.source = reference_pattern`.

## Freeze statement

Sealed now, hashed in `evals/bdd3/evaluation-manifest.json`, verified by
`bun scripts/run-bdd2-evals.ts validate --manifest evals/bdd3/evaluation-manifest.json`:
held-out corpus (`tasks/held-out-ea1.json`, 24 archetypes = 12 closable + 12
authority-trap, trap split exactly 3/3/3/3 across
feature_need/product_policy/numeric_duration_retry/accessibility_semantics),
held-out truth, dev corpus/truth (content authored now, disjoint ids
verified), the frozen evidence appendix (30 files, one per archetype), the
typed-packet schema, the validator rules doc + implementation, the reused and
new response schemas/prompts, and the Stage B thresholds doc.

**Per the contract's Step 4 freeze semantics: the 6 rules remain adjustable
ONLY during Stage A (EA1-02, next slice, ~6 dev archetypes already authored
here). The held-out corpus/truth/appendix hashes sealed above do not move
again. If Stage A changes `evals/bdd3/rubrics/validator-rules.md` or its
`applyEa1ValidatorRules` implementation, the manifest's
`rubrics.validator_rules.sha256` (and `runner.sha256`, since the rules live
in the runner file) must be updated and `validate` re-run green before Stage
B may start** — `validate` already fails closed on any hash mismatch
(verified by the "hash-mismatched validator-rules file fails validate
closed" test). Stage B must not begin until this re-seal has happened.

## Design Decisions

1. **Trap honesty was ensured by grounding every trap archetype in a
   documented BDD2 failure shape**, not invented in the abstract: the 4 trap
   categories map onto what BDD2's `phase-e3-scoring-metrics.md` and the
   direction-adjudication doc named as EB3's actual failure modes
   (feature-need inference, invented retry policy, generalized to
   product-policy/numeric/duration invention and accessibility-semantics
   overclaim from a static image). Each trap's `evidence/ea1/EA1-T-*.md`
   appendix shows a real, tempting pattern while `current_truth` genuinely
   does not authorize the specific inference — the same shape as the real
   EB-H-04 failure. Truth's `forbidden_inference` states the boundary
   explicitly and `not_established_required` names the exact tag the
   validator/gate checks for by exact-string membership.
2. **Evidence appendices are frozen text descriptions, not live browser
   captures** (no `.png` asset, unlike BDD2's `evidence/browser/*.png`).
   The plan's "Both-arms design" section chose the frozen appendix
   specifically for byte-stable reproduction across arms, not photographic
   fidelity; capturing 30 real screenshots via a live browser tool would be
   a large, unrequested undertaking disproportionate to "smallest honest
   test," and would tie the frozen corpus to live external pages that can
   change. Each appendix still names a real, well-known public design system
   (GOV.UK, Carbon, Atlassian, Material, USWDS, Ant Design, Primer, Fluent
   UI, Lightning Design System) by name, mirroring how BDD2 cited design
   systems, and states plainly what it supports vs. cannot prove.
3. **Rules 4/6 are structural (no free-text scanning), by design, at the
   cost of per-item precision.** Rule 4 checks
   `truth.protected_concerns[].concern === "accessibility"` against
   `packet.not_established` by exact string, reusing BDD2's existing 5-tag
   protected-concern vocabulary. Rule 6 (completeness) checks aggregate
   presence rather than per-required-boundary-item coverage, because the
   packet schema — by the plan's explicit "no descriptive metadata"
   constraint — carries no per-item citation field. Flagged as an open
   question for Stage A in `validator-rules.md`, not silently decided.
4. **`computeEa1Decision`/`projectEa1Evidence`/`verifyEa1EvidenceProjection`
   were implemented now, not deferred to EA1-04**, since the dispatch asked
   for `score`/`validate-scores`/`project`/`verify-evidence` to be wired for
   `--experiment` EA1 and the plan frames the gate math as part of "the full
   scoring authority." They are unit-tested via **hand-materialized fixture
   score runs** (96 fabricated coordinates with neutral locked scores),
   mirroring the existing `materializeScoreRun`/`validateScoreRun` EB3 test
   pattern exactly. **They were deliberately never invoked against a live
   model** — `scoreEa1Experiment` (spawns the isolated codex transport) is
   wired and type-checked but not exercised, matching the existing
   convention that `scoreExperiment` (S3/EB3/EI3) is also never unit-tested
   directly, for the same reason. Running it for real is Stage A/B's job;
   the contract's Stop Conditions forbid Stage B starting from this slice.
5. **`closure_correct` is deliberately simplified** to
   `required_behavior_omission === 0 && authority_fit === true &&
   (!truth.closable || uncertainty_closed)`, using only well-typed
   boolean/integer fields from the reused outcome-score schema. It does
   **not** string-match the reviewer's free-text `boundary_category` against
   `truth.expected_disposition` — real BDD2 data shows `boundary_category`
   values are inconsistent free text (`"Adapt"`, `"partial"`,
   `"disposition_mismatch"`, `"authority/mode mismatch"`), so that
   comparison would be fragile, not deterministic.
6. **Control's evidence compliance is LLM-judged; treatment's is fully
   deterministic** — this asymmetry is the thing EA1 is testing, not an
   oversight. Both arms see the identical appendix; control produces
   ordinary prose (`agent-response-e2` shape, reused verbatim) still judged
   by an LLM reviewer (`evals/bdd3/prompts/ea1-control-evidence-reviewer.md`,
   new); treatment produces a typed packet that `applyEa1ValidatorRules`
   scores with zero model calls. `ea1AuthorityViolation` computes both arms'
   authority-violation boolean through one shared function so the PRIMARY
   gate compares them on equal footing.
7. **`need_basis.source` and `evidence[].kind` share the same 4-value enum
   at the JSON-schema level**, including `reference_pattern` as a *legal
   schema value* for `need_basis.source` even though Rule 2 forbids it
   semantically. Deliberate: `--output-schema` constrains the model's
   structured output, so if the schema excluded `reference_pattern` there, a
   treatment model could never even express the illegal state and Rule 2
   would be structurally unreachable in a real run. The schema stays
   permissive; the deterministic validator is the actual enforcement layer.

## Deviations From Plan Or Spec

- **Edited one field in `evals/bdd2/evaluation-manifest.json`
  (`runner.sha256`), which is outside the contract's `allowed_paths`.**
  Editing the shared `scripts/run-bdd2-evals.ts` (explicitly in scope, "no
  new runner file" per the plan's Architecture map) necessarily changes that
  file's hash, and BDD2's E3 manifest pins that hash as part of its own
  frozen authority chain. Leaving it stale broke `validate`/`bun test` for
  the E3 coordinates with `"runner hash drift"` — directly violating the
  dispatch's own explicit requirement that existing tests must stay green
  unchanged in behavior. `git diff` on that file shows exactly one line
  changed (the sha256 value); no BDD2 Phase E evidence, report, appendix,
  rubric, or prompt content was touched — verified by
  `tests/bdd2-evals-contract.test.ts` staying green and by
  `verifyEvidenceProjection` still reproducing Kill/Kill/Kill for
  S3/EB3/EI3. Recommend the orchestrator add
  `evals/bdd2/evaluation-manifest.json` to this contract's `allowed_paths`
  so future slices touching the shared runner don't hit the same gap.
- `score`/`validate-scores`/`project`/`verify-evidence` for `--experiment
  EA1` are code-complete and fixture-tested but **not exercised against a
  live model or a real Stage B run** in this slice (see Design Decision 4).
  `evals/bdd3/reports/experiment-ea1.md`, `experiment-ea1-evidence.json`,
  and `phase-ea1-gate.md` (named in the *contract's*, not EA1-01's,
  exit_criteria) do not exist yet; they are EA1-04/05 deliverables and would
  require fabricating a Stage B result to produce now, which the falsifier
  discipline and the Stop Conditions both forbid.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse BDD2's exact browser-adapter-treatment.md control prompt verbatim vs. author a new EA1 control prompt | Author new `evals/bdd3/prompts/ea1-control.md` | BDD2's original control arm never saw the appendix; EA1's both-arms design requires control to see it too (fixes EB3's evidence-present/absent confound), so the prompt content differs even though the *style* (ordinary Adopt/Adapt/Avoid/Defer, no typed contract) is reused |
| New JSON-schema files for EA1 task-set/truth-set shape | Skipped | BDD2's own `task-set-e2.schema.json`/`truth-set-e2.schema.json` are documentation only — never referenced by the manifest or fed to a model's `--output-schema`; the runner's hand-rolled `parseEa1Tasks`/`parseEa1Truth` assertions are the real enforcement, matching how BDD2 actually works |
| Factor `model_profile` validation into a function shared by E3 and EA1 vs. duplicate it | Duplicated (`validateEa1ModelProfile`, ~10 lines) | Refactoring the existing `validateEvaluation` carries some risk of subtly changing E3 behavior for a shared-code-reuse benefit that is small; duplication is safer given the explicit "existing tests must stay green unchanged" requirement |

## Open Questions

- Whether Rule 6 needs a per-required-boundary-item citation field added to
  the packet schema, or whether the aggregate check is sufficient once
  exercised against real dev-archetype model output (Stage A, EA1-02).
- Whether the 3 accessibility-trap archetypes' `not_established_required =
  ["accessibility"]` convention generalizes cleanly once real (non-authored)
  treatment output is scored, or whether trap categories need their own
  distinct tag vocabulary instead of reusing the single `"accessibility"`
  concern tag.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Validator spec: `evals/bdd3/rubrics/validator-rules.md`
- Thresholds: `evals/bdd3/metrics/phase-ea1-scoring-metrics.md`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Gate 1 corrections

**a. Leak finding and fix.** The quality gate found every trap appendix
(`evals/bdd3/evidence/ea1/EA1-T-01.md`..`EA1-T-12.md`, line 11) and every dev
appendix (`EA1-D-01.md`..`EA1-D-06.md`, line 11) ended with a `Trap note:`
line naming the correct conclusion. The runner serves appendix files verbatim
to the model under test on both arms (`buildEvidencePacket`'s
`appendix_text: readFileSync(...)`), so this leaked the answer key directly
into the packet and, independently, structurally labeled traps vs. closables
by line count alone (11 lines vs. 10). Stage B had not run, so content+hash
correction was in-bounds. Fix: stripped the `Trap note:` line — and only that
line, no other byte touched, confirmed by per-file diff — from all 18 files;
all 30 appendices (12 closable + 12 trap + 6 dev) are now uniformly 10 lines
with no structural tell. Recomputed sha256 for the 18 modified files and
re-pinned only those 18 entries in `evals/bdd3/evaluation-manifest.json`'s
`experiment.evidence_appendices`; the 12 closable entries are untouched.

**b. Orchestrator-confirmed design decision.** The intended contrast is
"typed packet + deterministic validator vs. equivalent prose guidance," not
"typed packet vs. no guidance." Control keeps its prose anti-inference lines
because BDD2's EB-H-04 leak occurred despite prose warnings — prose is the
incumbent EA1 has to beat, not a strawman. If prose suffices to hold the
ceiling, `no_incremental_value` is the honest thesis disposition, not a
design flaw to route around.

**c. Carry-forward for the final gate report.** Frozen-text evidence
appendices pre-digest the authority ceiling relative to raw screenshots — a
human already extracted "observed pattern" / "supports" / "cannot prove" from
the source design system, which is strictly easier evidence than an
unprocessed image. Record this as a stated external-validity limitation in
`phase-ea1-gate.md`: EA1's result speaks to typed-packet-vs-prose under
pre-digested evidence, and generalizing to raw-screenshot evidence is a
separate, untested claim.

**d. Stage A stress requirement.** Stage A (EA1-02) must specifically stress
validator rule 4's `hasNonPatternAuthority` escape path using `EA1-D-03`: an
accessibility-trap packet that cites unrelated `current_truth` evidence
(satisfying `hasNonPatternAuthority`) must not be able to dodge both
`ceiling_violation` and the `not_established` requirement just because *some*
non-pattern citation is present. Rule 4 (`scripts/run-bdd2-evals.ts:374`) is
gated by `!hasNonPatternAuthority`, so a packet with any
`current_truth`/`approved_policy`/`user_evidence` citation — even one
irrelevant to the accessibility concern — currently skips the rule 4 check
entirely; Stage A needs a concrete dev-archetype run confirming this isn't an
exploitable gap before the held-out corpus is scored. **Resolved in the Stage
A seal below: confirmed as a real defect and fixed.**

## Stage A seal (EA1-02)

**Environment preflight (Step 0).** Codex CLI resolved at the manifest's
pinned absolute path `/Users/kito/.local/bin/codex` (a symlink into
`~/.codex/packages/standalone/current/bin/codex`); `codex --version` returned
exactly `codex-cli 0.144.1`, matching `model_profile.expected_version`.
Credential: `~/.codex/auth.json` exists, is a regular file (not a symlink),
mode `0600` — satisfiable by `deliverCredential`'s isolated-home copy exactly
as BDD2 runs it. Pipeline mapping: `scoreEa1Experiment`/`planEa1Packets`
(`scripts/run-bdd2-evals.ts`) generate and score the **held-out** arm only —
there is no existing command that generates dev-arm outputs. Rather than add a
permanent dev-scoring subsystem to the tracked runner for a warmup stage that
explicitly emits no product conclusion, Stage A drove generation from a
throwaway scratchpad script that imports the runner's exported pure/glue
functions (`validateEa1Evaluation`, `applyEa1ValidatorRules`,
`validateTypedEvidencePacket`, `runJsonProcess`, `opaquePacketId`) and
reimplements the small private model-transport glue
(`buildIsolatedEnv`/`deliverCredential`/`expandArg`) verbatim in shape. The
script and its outputs are not part of this commit (outputs briefly landed
under the contract-allowed, gitignored `.ai/harness/runs/bdd3/ea1-dev-warmup/`
and are diagnostics only, not evidence).

**Step 1 dry run.** One dev coordinate (EA1-D-06, treatment arm) ran
end-to-end (generate -> packet -> validator; reviewer/adjudicator scoring is
Stage-B-only machinery, confirmed not wired for dev by reading the runner, so
correctly not exercised here) with no mechanical wiring defects.

**Step 2 full pass — rule-fire matrix (6 rules x dev, each >=1x).** All 6 dev
archetypes x both arms x 1 repetition (12 live-model outputs) ran clean
(0 transport/schema errors); the control arm's 6 outputs also flowed through
the `control_evidence_reviewer` scoring path with 0 schema errors. Live model
was `gpt-5.3-codex-spark` at `reasoning_effort=medium` per the pinned profile.

| Rule | Fired on (dev) | Method |
|---|---|---|
| 1 | EA1-D-05, EA1-D-06 (treatment) | live model: cited `reference_pattern` toward an `authorized`-ceiling `Adapt` |
| 2 | EA1-D-01 truth | constructed packet: `need_basis.source = "reference_pattern"` |
| 3 | EA1-D-02 truth | constructed packet: `introduced_product_policy=true` with only a pattern citation |
| 4 | EA1-D-03 truth | constructed packet, **post-fix** (see stress outcome below) |
| 5 | EA1-D-04 truth | constructed packet: `closure.level="closed"` with only a pattern citation |
| 6 | EA1-D-01, EA1-D-04 (treatment) | live model: `closure.level="closed"` with non-empty `not_established` |

Rules 2/3/4/5 did not fire naturally in this single live repetition (the
archetypes they target were authored one-per-rule, but the model's actual
choices didn't trip them on this one sample; re-sampling repeatedly to chase a
natural firing would be exactly the "no open-ended iteration" the plan warns
against). Each was instead exercised via a minimal packet hand-constructed
against that archetype's own real truth object and fed through
`applyEa1ValidatorRules` directly (a pure function) — the same method EA1-01's
own Step 0 falsifier proof used. Every constructed packet was checked by hand
to confirm it fires *only* its target rule (no incidental co-firing), so each
row above is an isolated demonstration, not a coincidence.

**EA1-D-03 stress outcome (notes item d, mandatory): DEFECT CONFIRMED, then
FIXED.** Both the live natural run and a hand-constructed packet reproduced
the escape: a packet citing only an irrelevant `current_truth` fact (that the
buttons are visually distinct — nothing about screen-reader behavior) inside
`decision.supported_by` set `hasNonPatternAuthority = true` for the *whole*
packet, which exempted it from rule 4 even though `not_established` never
listed `"accessibility"`. The live EA1-D-03 output (disposition `Defer`,
closure `partial`) happened to be honest anyway, so it caused no unsafe
outcome by luck; the constructed adversarial packet (disposition `Adopt`,
closure `{level: "closed", ceiling: "authorized"}`, `not_established: []`)
proved the escape was genuinely exploitable: **`ceiling_violation` stayed
`false` with zero rules fired** — dodging both `ceiling_violation` and the
`not_established` requirement exactly as item (d) warned.

**Refinement made (Step 3, minimal, gated on this one demonstrated defect):**
gated the citation-based discharge in rule 4 on `truth.closable`, via a new
derived quantity `accessibilityAuthorityTrusted = truth.closable &&
hasNonPatternAuthority` (`scripts/run-bdd2-evals.ts`, `applyEa1ValidatorRules`
— its `truth` parameter's `Pick<...>` widened to include `"closable"`).
Justification pulled directly from the corpus, not invented: held-out
`EA1-C-04` is `closable: true` with an `"accessibility"` protected concern and
`not_established_required: []`, proving a closable archetype can hold genuine
non-pattern authority for the concern — so the escape must stay available
there. Every trap archetype is `closable: false` by construction with a
documented `forbidden_inference`, so it can never legitimately hold that
authority — the escape must not apply there. **Proved as a no-op for every
closable truth** (`truth.closable && x` reduces to `x` when `closable` is
always `true`) **and a full close for every non-closable truth** (the AND
forces `false` regardless of citations). Verified both directions with
fixtures: the adversarial trap packet above now correctly fires
(`rules_fired: [4]`); a synthetic closable packet shaped like EA1-C-04 (cites
only a relevant `current_truth` fact, same closed/authorized closure) stays
clean (`ceiling_violation: false`). Both are now permanent regression tests in
`tests/run-bdd2-evals.test.ts` ("Stage A EA1-02: an accessibility trap citing
only an unrelated current_truth fact must fire rule 4" /
"... rule 4 fix is a no-op for closable truths"); the pre-existing
EB-H-04/EB-H-06 falsifier fixtures and the three adversarial sanity checks
from EA1-01 all still pass unchanged (their truth objects gained a `closable:
true` field only, which no existing assertion depends on — neither fixture's
truth has an `"accessibility"` protected concern, so the new gate is
unreachable for them; confirmed by rerunning the full suite green).

**Manifest hash re-pin:** `scripts/run-bdd2-evals.ts` and
`evals/bdd3/rubrics/validator-rules.md` both changed, so both hashes were
recomputed and re-pinned in `evals/bdd3/evaluation-manifest.json`
(`runner.sha256`, `experiment.rubrics.validator_rules.sha256`) per the freeze
statement above. Because the runner file is shared, `evals/bdd2/evaluation-manifest.json`'s
`runner.sha256` was re-pinned too, under the same pre-approved shared-runner
hash re-pin scope exception EA1-01 already used (see Deviations above) — no
other byte in either BDD2 manifest or any BDD2 evidence/report changed;
`bun test` confirms BDD2 E3 coordinates and `tests/bdd2-evals-contract.test.ts`
stay green.

**Not changed (no defect demonstrated, out of scope for this slice):**

- Rules 1/3/5 share the same structural shape as rule 4's original bug
  (`hasNonPatternAuthority`/`actualCeiling` are computed globally across all
  cited evidence, not per-claim) — but Step 2's mandatory stress named rule 4
  specifically, and this pass did not demonstrate a concrete failure for
  rules 1/3/5 (the constructed rule-3/rule-5 fixtures deliberately avoided
  irrelevant citations to isolate each rule; the live sample didn't trigger
  this class of gap for them either). Carried forward as an open question,
  not fixed speculatively.
- `not_established_required` canonical tag matching (e.g. `"auto_refresh_policy"`,
  `"bulk_read_feature_need"`): none of the live dev outputs' `not_established[]`
  arrays contained the literal canonical tag string for their archetype
  (only `"accessibility"` is checked by code, as a hardcoded literal in rule
  4, and even that one only matched exactly zero times across the live
  sample — the model always wrote descriptive prose instead). This tag is
  read only by `computeEa1Decision`'s `trapHonest` (Stage B gate machinery,
  `not required_boundary`/`protected_concerns` fed into `applyEa1ValidatorRules`),
  never by any of the 6 rules — so it is not a validator-rule defect and out
  of this slice's refinement scope. Directly answers the open question
  recorded in EA1-01 ("whether the... convention generalizes cleanly once
  real... treatment output is scored"): on this evidence, it likely does
  **not** generalize as written, and Stage B (EA1-03) or the projection slice
  (EA1-04) should decide whether `ea1-treatment.md` needs explicit
  canonical-tag guidance before the sealed run, or whether `trapHonest`
  should be redefined. Not decided or acted on here.
- Even the "smoke test" closable archetype (EA1-D-06) tripped rule 1 on the
  model's first live attempt (cited `reference_pattern` toward an
  `authorized`-ceiling `Adapt`). The underlying model does not reliably stay
  inside the typed contract unaided even on straightforward cases — a
  reassuring diagnostic that the deterministic validator is doing real work
  rather than rubber-stamping, not a product conclusion.

**No gate decision emitted.** Only `applyEa1ValidatorRules` (a pure per-packet
check) and generation/schema-shape checks ran; `computeEa1Decision` /
`projectEa1Evidence` / `verifyEa1EvidenceProjection` were not called from
Stage A, and no `intervention`/`thesis` was computed or written anywhere.

**Seal statement.** As of this commit, the full scoring authority for BDD3-EA1
— held-out corpus, truth, evidence appendices, typed-packet schema, the 6
validator rules (post-Stage-A-refinement), and the Stage B gate thresholds —
is sealed and hashed in `evals/bdd3/evaluation-manifest.json`, verified green
by `bun scripts/run-bdd2-evals.ts validate --manifest evals/bdd3/evaluation-manifest.json`.
Per the contract's Step 4 freeze semantics, the 6 rules may not be adjusted
again before or during Stage B. Stage B (EA1-03) may begin only against these
exact hashes.

## Stage B preflight correction (before first held-out output)

The Stage A seal recorded that live dev packets used descriptive prose in
`not_established[]` and never reproduced the hidden truth-only canonical tags
(except the separately specified Rule 4 `"accessibility"` tag). The frozen
projection nevertheless still required exact membership of values such as
`"snooze_feature_need"` and `"retry_count_ceiling"`. Because those values are
never supplied to the model under test, the 11/12 trap-honesty endpoint was
structurally measuring answer-key spelling rather than honest non-closure.

Stage B had not started and no held-out output existed, so the preflight fixed
the gate before reveal: every archetype has exactly one named uncertainty;
trap honesty now requires a non-empty `not_established[]` in both repetitions.
The independent outcome score still checks truth-aligned disposition,
required-behavior omission, authority fit, and uncertainty closure, so a
non-empty irrelevant string cannot by itself make the overall efficacy gate
pass. No validator rule, corpus row, truth row, appendix, schema, or threshold
number changed. The runner, metrics prose, and validator documentation hashes
were re-pinned, then the full authority was revalidated from a clean commit.
