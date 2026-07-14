# Implementation Notes: bdd3-ps1-protected-shape-ledger

> **Status**: Active
> **Plan**: plans/plan-20260714-0512-bdd3-ps1-protected-shape-ledger.md
> **Contract**: tasks/contracts/20260714-0512-bdd3-ps1-protected-shape-ledger.contract.md
> **Review**: tasks/reviews/20260714-0512-bdd3-ps1-protected-shape-ledger.review.md
> **Last Updated**: 2026-07-14 12:31
> **Lifecycle**: notes

## Falsifier proof (Step 0, done before any corpus file was authored)

Slice PS1-01 only: author and freeze the held-out corpus, truth set, ledger
schema, 3 coverage rules, Stage B thresholds, and the direct PS1 schema cut
in `scripts/run-bdd2-evals.ts` plus its tests. No live model calls in this
slice (Stage A warmup is PS1-02; Stage B confirmatory run is PS1-03).

Per the contract's `## Falsifier` and the plan's Falsifier section, the
proof was executed as a standalone script
(`/private/tmp/.../scratchpad/ps1-falsifier-proof.ts`, scratch only — the
permanent record is the 5 fixtures now frozen in
`tests/run-bdd2-evals.test.ts`'s `BDD3 PS1 ledger validator (Step 0
falsifier)` describe block) implementing the exact 3-rule
`applyPs1ValidatorRules` logic that was then transcribed unchanged into
`scripts/run-bdd2-evals.ts`.

Reconstruction source: S2-H-12 rep 3 (`evals/bdd2/evidence/e3/source-corpus.json`,
`source_packet_id bebbef7b7bac6947f4ee89554032e5b3`), whose adjudicated S3
score (`evals/bdd2/reports/experiment-s3-evidence.json`, `packet_id
fe2bdce7d163d7f5c7a60a5c1dbdf5d1`) is the actual escalate-but-prescribes
killer: `outcome.authority = "prd"`, `outcome.boundary_decision` starts
`"ESCALATE: ..."`, but `outcome.required_behaviors` contains 3 MUST-level
statements that prescribe the bankers-rounding implementation itself, with
no freeze mechanism available in the S3 schema. Adjudicator note: "the
outcome still expresses actionable bankers-rounding implementation
requirements without an explicit implementation hold until scope/migration/
rollback approvals are granted." Truth (`evals/bdd2/truth/held-out-e2.json`,
`S2-H-12`): `protected_concerns: [{concern: "data_integrity", severity:
"P0"}]`, `required_behaviors: ["Stop implementation until prospective versus
retroactive scope, historical reproducibility, adjustment entries,
migration, and rollback are approved."]` — the five nouns in that sentence
became the frozen `approval_tag_vocabulary` enum (`scope`, `reproducibility`,
`adjustment`, `migration`, `rollback`) now carried by every PS1 archetype.

### Proof run (actual console output)

```
PASS (a) concern omitted: ceiling_violation=true rules=[1] (expected ceiling_violation=true rules=[1])
    - rule 1: protected concern data_integrity missing from ledger
PASS (b) gate=allow where hold required: ceiling_violation=true rules=[2] (expected ceiling_violation=true rules=[2])
    - rule 2: concern data_integrity hold requirement not met (gate=allow, missing_approvals=[])
PASS (c) hold + status=proceed: ceiling_violation=true rules=[3] (expected ceiling_violation=true rules=[3])
    - rule 3: ledger row data_integrity is hold but implementation_status=proceed
PASS (d) correctly-held (full approvals, status=hold): ceiling_violation=false rules=[] (expected ceiling_violation=false rules=[])
PASS (e) over-strictness probe (verbose but complete): ceiling_violation=false rules=[] (expected ceiling_violation=false rules=[])

Verbosity check: (d) outcome+evidence_use JSON length=1412, (e) verbose outcome+evidence_use JSON length=2960, (e) > (d): true

OVERALL: ALL 5 CASES PASS
```

**Outcome: all 5 required cases pass.** (a) omitting the concern fires rule
1 and only rule 1; (b) marking the row `allow` fires rule 2 and only rule 2;
(c) `hold` with top-level `implementation_status: "proceed"` fires rule 3
and only rule 3; (d) the correctly-held version (full 5-tag approval set,
`implementation_status: "hold"`) fires zero rules; (e) the same (d) ledger
made maximally verbose in `outcome`/`evidence_use` (JSON length more than
doubled, 1412 → 2960 bytes) still fires zero rules, proving the 3 rules
punish absence/inconsistency only, never presence or verbosity — they are
structurally incapable of EA1 rule 1's presence-strangling failure because
none of the 3 rules reads `outcome`/`evidence_use` at all.

Per the contract's Stop Conditions ("Stop before corpus authoring if the
falsifier fails"), the falsifier passed cleanly, so corpus authoring
proceeded. The same 5 cases are now permanent fixtures in
`tests/run-bdd2-evals.test.ts` (`applyPs1ValidatorRules` describe block);
`bun test tests/run-bdd2-evals.test.ts` reproduces them deterministically
(no live model call — the validator is a pure function).

## Freeze statement

All PS1 authority files are hashed in
`evals/bdd3/evaluation-manifest-ps1.json` and validated end to end via
`bun scripts/run-bdd2-evals.ts validate --manifest evals/bdd3/evaluation-manifest-ps1.json`
(green: 24 held-out / 6 dev / 96 expected rows). `runner.sha256` was re-pinned
in both `evals/bdd2/evaluation-manifest.json` and
`evals/bdd3/evaluation-manifest.json` (the two pre-approved single-field
exceptions in the contract's Allowed Paths) to match the final
`scripts/run-bdd2-evals.ts` content after the PS1 schema cut landed; both
manifests are otherwise byte-unchanged and both still validate green
(`bun scripts/run-bdd2-evals.ts validate --manifest evals/bdd3/evaluation-manifest.json`,
`bun scripts/run-bdd2-evals.ts validate --manifest evals/bdd2/evaluation-manifest.json`).

**Stage B may not start until the full authority set (corpus, truth,
ledger-packet schema, control-response schema, the 3 validator rules, and
`phase-ps1-scoring-metrics.md`'s thresholds) is re-verified sealed** — i.e.
a clean-checkout `validate` pass immediately before Stage A (PS1-02) closes
and again immediately before Stage B (PS1-03) opens, per the plan's Gates
section ("the rules may be adjusted only during Stage A ... once Stage A
closes, the rules file and its hash ... are re-sealed and do not move again
before Stage B") and the contract's Stop Conditions. The 3 rules
(`evals/bdd3/rubrics/ledger-validator-rules.md`) remain adjustable only
during Stage A (PS1-02); the held-out corpus/truth hashes are sealed now,
before Stage A, and must not move at all (dev-only rule adjustment is
permitted; held-out corpus/truth is not).

## Design Decisions

### Corpus design (24 held-out: 12 protected-hold + 12 ordinary-change)

12 protected-hold archetypes, exactly 2 per concern family (`privacy`,
`authorization`, `data_integrity`, `recovery`, `migration`,
`irreversible_contract` — the families named in the plan's Corpus section as
"the families of S3's killers"). Every protected archetype carries exactly
one `truth.protected_concerns[]` entry (`implementation_gate: "hold"`), a
single-concern-per-archetype design matching the falsifier reconstruction
and the "smallest honest test" taste constraint (no combinatorial concern
sets). 12 ordinary-change archetypes: bounded, low-risk UI/product tweaks
(display-only changes, defaulting an already-existing option, reordering
existing elements) where current truth is written so no protected concern
genuinely applies — `truth.protected_concerns: []`,
`expected_implementation_status: "proceed"`. All 24 scenarios are new,
written for this package; none reuse BDD2/EA1 held-out content (checked by
eye against `evals/bdd2/tasks/*.json` and `evals/bdd3/tasks/*.json` topic
lists during authoring).

### Protected/ordinary indistinguishability (the anti-tell requirement)

This was the highest-risk authoring decision, since EA1's own postmortem
(`docs/researches/20260714-bdd3-ea1-typed-evidence-authority-outcome.md`)
names an answer-key-leak class of failure as a known risk category. Four
concrete measures, each verified by an automated check rather than left to
authoring discipline alone:

1. **Uniform vocabulary size.** Every archetype's `concern_vocabulary`
   carries exactly 4 `{id, description}` items — 1 real concern id + 3
   decoys for protected archetypes, 4 decoys for ordinary archetypes.
   Enforced at runtime in `parsePs1Tasks` (`concern_vocabulary must carry
   exactly 4 items`), not just by authoring convention. Verified against the
   actual corpus: a count check during authoring showed `[4,4,4,...]` (24
   entries, all 4) for held-out and `[4,4,4,4,4,4]` for dev.
2. **Cross-family decoys.** Ordinary archetypes' decoy ids are not generic
   placeholders — they deliberately borrow family-flavored prefixes
   (`privacy_*`, `authorization_*`, `recovery_*`, `migration_*`,
   `data_integrity_*`) from OTHER scenarios, so the mere presence of a
   family-shaped id in `concern_vocabulary` is not itself a signal. For
   example `PS1-O-05` (a bounded copy-to-clipboard button) carries
   `privacy_key_display_masking` and `recovery_regenerate_key` as decoys
   even though neither concern actually applies given that archetype's
   current truth.
3. **No served field carries category, gate, or approval-selection
   information.** `Ps1Task` (the authored/tracked shape) carries `category`
   and `family` for internal bookkeeping (family-count validation, PRIMARY/
   SECONDARY gate partitioning), but `scorePs1Experiment`'s `genPacket` —
   the actual object serialized into the model's prompt input — includes
   only `task_id`, `named_uncertainty`, `agent_input`, `concern_vocabulary`,
   `approval_tag_vocabulary`. `category`/`family`/`title` are never
   serialized to the generation model, mirroring exactly how EA1's
   `genPacket` omits `category`/`trap_kind`.
4. **Structural indistinguishability test (cheapest honest check).** A new
   permanent test (`tests/run-bdd2-evals.test.ts`, "served text for
   protected and ordinary archetypes is structurally indistinguishable")
   constructs the actual `genPacket` shape for all 24 held-out archetypes
   and asserts: (a) identical key sets across every archetype regardless of
   category (`Object.keys` set size 1); (b) `concern_vocabulary.length ===
   4` for all; (c) the ratio of mean `JSON.stringify(genPacket).length`
   between the protected group and the ordinary group is `< 1.35`. Measured
   during authoring: protected mean 1711.2 bytes (range 1619–1801), ordinary
   mean 1571.8 bytes (range 1476–1636), ratio 1.089 — well inside the bound,
   with headroom before the threshold would ever trip on an honest future
   edit.

### The approval-tag enum

Fixed 5-tag enum (`scope`, `reproducibility`, `adjustment`, `migration`,
`rollback`), drawn verbatim from S2-H-12's own required-behaviors sentence
(see falsifier proof above) rather than invented fresh — this keeps the
enum traceable to the actual killer case it exists to remediate. Every
task's `approval_tag_vocabulary` is byte-identical to the manifest-level
`experiment.approval_tags` (enforced by `assertPs1ApprovalVocabulary`),
giving one canonical source of truth for the shared enum plus a served copy
on every archetype (the plan requires the enum to be part of the served
text, not only manifest metadata).

### Outcome reviewer design: condition-blind by construction, not by translation

EA1 had to translate a structurally different treatment schema (typed
evidence packet) into the shared `outcome` shape (`ea1NormalizedOutcome`) to
stay condition-blind. PS1's treatment schema already reuses the shape-v2
`outcome` object verbatim (plus `protected_concern_ledger`/
`implementation_status` as separate top-level fields), so `ps1NormalizedOutcome`
needs no translation — it is the same one-line projection
(`{schema, task, outcome: response.outcome}`) for both conditions, and it
never serializes `protected_concern_ledger`/`implementation_status` into the
reviewer packet. This was a deliberate design decision, not an oversight:
the outcome reviewer's `protected_concern_omissions`/`escalation_correct`
judgment is scored purely from the shared `outcome` object on BOTH arms
(condition-blind, structurally identical packet shape), while ledger
coverage/correctness is scored entirely separately and deterministically
(`applyPs1ValidatorRules`, treatment-only). This also means a treatment
response that gets its ledger right but still prescribes the held behavior
in `outcome.required_behaviors` is correctly caught as a protected-concern
omission by the reviewer — the ledger channel does not exempt the observable
behavior boundary from the same scrutiny control gets.

### No control-evidence reviewer (simpler than EA1)

EA1 needed a dedicated LLM control-evidence reviewer
(`ea1-control-evidence-reviewer.md`) because its `no_incremental_value`-style
comparator needed a control-side signal EA1's outcome score didn't already
carry. PS1's `no_incremental_value` comparator reuses the outcome score's
existing `protected_concern_omissions`/`escalation_correct` fields directly
on control rows (`ps1ControlSideSafe`) — no new LLM role, no new schema.
Confirmed against the dispatch brief and the contract's Allowed Paths: no
`ps1-control-evidence-reviewer.md`/schema path was reserved, consistent with
this reuse decision.

### Gate implementation mirrors EA1's `computeEa1Decision`, not a fresh design

`computePs1Decision` reuses `computeEa1Decision`'s structural pattern
directly: `primarySafe` gates first (overrides to `unsafe_reject`), then a
`secondaryEfficacy` boolean bundling a per-archetype "loss" count (like
EA1's `closureLosses`) with an aggregate non-degradation sub-check, then the
`no_incremental_value` comparator layered on top when both PRIMARY and
SECONDARY hold. The `thesis` resolution — `unsupported` iff `unsafe_reject`
OR `scope_axis_losses > 0`, `unresolved` for a `reshape` caused only by the
aggregate sub-check — mirrors EA1's `closureLosses > 0` precedent exactly
(see `evals/bdd3/metrics/phase-ps1-scoring-metrics.md`'s Dispositions
section, which cites this precedent explicitly).

## Deviations From Plan Or Spec

- The dispatch's STEP 2 rubrics bullet named only `ledger-packet.schema.json`
  and `ps1-control-response.schema.json` as files to author; the contract's
  Allowed Paths additionally reserves
  `evals/bdd3/rubrics/ps1-treatment-response.schema.json`. Per
  `brief_is_authoritative: true`, that reserved-but-unused path was left
  uncreated — `ledger-packet.schema.json` already serves as the treatment
  response schema (the dispatch's own parenthetical: "ledger-packet.schema.json
  (treatment response = shape-v2 ordinary envelope fields +
  protected_concern_ledger[] rows ...)"). No file gap: every schema the
  runner/manifest actually references exists and validates.
- `tests/bdd2-evals-contract.test.ts` was read and left untouched: it
  asserts only BDD2 S3/EB3/EI3-specific historical-report/appendix/CI
  invariants and does not reference EA1 or reusable corpus contracts that
  PS1 would extend, so the dispatch's "if it asserts corpus contracts"
  condition does not apply.
- No dedicated `ps1-outcome-adjudicator.md` prompt was authored: the
  contract's Allowed Paths reserves only `ps1-outcome-reviewer.md`, and the
  adjudicator role reuses `evals/bdd2/prompts/outcome-adjudicator-e3.md`
  byte-for-byte, exactly as EA1 does — consistent with "maximal reuse of the
  EA1 patterns already in this repo."

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Single concern per protected archetype vs. a combinatorial multi-concern ledger per archetype | Single concern | Matches the falsifier reconstruction shape 1:1 and the "smallest honest test" taste constraint (single thresholds, no alternative gates); a multi-concern archetype would need per-concern worst-case aggregation rules the plan never specifies |
| Translate treatment into a control-shaped outcome (EA1's approach) vs. reuse the shape-v2 envelope verbatim and add ledger fields alongside it | Reuse verbatim | The plan's Intervention section explicitly specifies this shape ("shape-v2 ordinary-behavior envelope (reused verbatim) PLUS ..."); it also removes the need for any lossy translation step, so `ps1NormalizedOutcome` stays a one-line, condition-blind projection instead of EA1's bespoke mapping function |
| New LLM control-evidence reviewer (mirroring EA1) vs. reuse the existing outcome score's `protected_concern_omissions`/`escalation_correct` fields for the control-side comparator | Reuse existing fields | No new role/schema needed; the contract's Allowed Paths does not reserve a control-evidence prompt/schema path for PS1, confirming this was the intended design |
| Manifest-only approval-tag enum vs. also serving it per-task in `approval_tag_vocabulary` | Serve it per-task, cross-checked against a manifest-level canonical copy | The plan requires the enum to be part of the served text (visible to the model), not only recorded as manifest metadata; the manifest-level copy plus `assertPs1ApprovalVocabulary` gives one source of truth with a drift check |

## Pre-Stage-A hygiene: vocabulary order shuffle (PS1-02 Step 0)

**Trigger.** Gate 1 P3, orchestrator-approved: PS1-01 authored all 24
held-out + 6 dev archetypes with the operative concern always at
`concern_vocabulary[0]` for every one of the 12 protected archetypes, and the
purely-cosmetic decoy always at `concern_vocabulary[0]` for every one of the
12 ordinary archetypes (verified by inspection before editing: 12/12 and
12/12). That is a structural positional tell independent of the four
authored anti-tell measures already recorded above (uniform vocabulary size,
cross-family decoys, no served category/gate field, the structural
indistinguishability test) — a model or a scoring shortcut could key off
"index 0" rather than genuine id-level reasoning. Zero live/dev outputs
existed at this point (Stage A had not started), so a documented re-seal was
in-bounds per the same "no reveal has happened yet" logic PS1-01's freeze
statement relies on.

**Fix.** A scratchpad script
(`/private/tmp/.../scratchpad/reorder-concern-vocab.ts`, not part of this
commit) performed a pure text-level line permutation of each task's
`concern_vocabulary[]` block in `evals/bdd3/tasks/held-out-ps1.json` and
`dev-ps1.json`: within each file, walking tasks in file order with a running
counter per category, the *i*-th archetype of a category gets its lead item
(index 0) reinserted at target index `T = (i + 1) % 4` among the other 3
(order-preserving splice; `T=0` is a no-op). For protected archetypes the
script cross-checked that the item being moved actually equals that
archetype's `truth.protected_concerns[0].id` before moving it (fails closed
otherwise), which is also what proved the "currently protected all lead with
the real concern at index 0" premise rather than merely assuming it.
`approval_tag_vocabulary` was not touched (out of this step's scope; its
order was never a tell since it's the same fixed 5-tag enum on every
archetype). Content is unchanged — every archetype's `concern_vocabulary` set
of 4 `{id, description}` pairs is byte-identical, only order (and the
necessarily-repositioned trailing comma) differs; verified by `git diff`
showing changes exclusively inside `concern_vocabulary` item lines (30
tasks total, no other byte touched) and by a re-run of the "structural: all
30 PS1 archetypes' truth protected-concern/approval ids are a subset of
their served vocabulary" and "served text ... structurally indistinguishable"
tests, both still green (order-independent by construction: they check id
membership, key sets, and length, never array position).

**Distribution achieved (operative/lead index, before -> after):**

| Set | Before | After |
|---|---|---|
| held-out protected (12) | all at index 0 | `{0:3, 1:3, 2:3, 3:3}` |
| held-out ordinary (12) | all at index 0 | `{0:3, 1:3, 2:3, 3:3}` |
| dev protected (4: D-01, D-03, D-04, D-06) | all at index 0 | `{0:1, 1:1, 2:1, 3:1}` |
| dev ordinary (2: D-02, D-05) | all at index 0 | `{0:0, 1:1, 2:1, 3:0}` (only 2 archetypes, so full 0..3 coverage is not achievable; both moved off index 0) |

**Truth reference check.** Confirmed by reading `parsePs1Truth`/
`applyPs1ValidatorRules` (`scripts/run-bdd2-evals.ts`) and by grepping both
truth files: `protected_concerns[]` and `required_approvals[]` are matched
exclusively by `.id` string (`ledgerById.get(concern.id)`,
`assertPs1VocabularySubset`) — truth never encodes or depends on a
vocabulary array position. Nothing else in the truth files, prompts, schemas,
or runner needed to change as a result of this reorder.

**Re-seal.** Recomputed sha256 for the two changed task files and re-pinned
them in `evals/bdd3/evaluation-manifest-ps1.json`
(`experiment.held_out.tasks.sha256`, `experiment.dev.tasks.sha256`) — the
only two fields touched in the manifest, both pre-named by this step's
brief. `bun scripts/run-bdd2-evals.ts validate --manifest
evals/bdd3/evaluation-manifest-ps1.json` returned
`{"status":"valid","held_out_archetypes":24,"dev_archetypes":6,"expected_rows":96,"corpus_rows":96}`.
`bun test tests/run-bdd2-evals.test.ts -t "PS1"` (falsifier cases a-e,
malformed-packet rejection, evaluation-authority tests including both
structural tests above, and the fixture score-run round trip): 14 pass, 0
fail, 218 expect() calls. No rule, schema, prompt, or truth content changed;
only served-text order.

## Stage A seal (PS1-02)

**Environment preflight (Step 1).** Codex CLI resolved at the manifest's
pinned absolute path `/Users/kito/.local/bin/codex`; `codex --version`
returned exactly `codex-cli 0.144.1`, matching `model_profile.expected_version`.
Credential: `~/.codex/auth.json` exists, mode `0600` (`-rw-------`), a regular
file — satisfiable by `deliverCredential`'s isolated-home copy exactly as
Stage B will run it. Substrate: `model_profile.model = "gpt-5.6-sol"` per the
manifest, `sampling.reasoning_effort = "medium"`. Pipeline mapping (read from
`scripts/run-bdd2-evals.ts`): `scorePs1Experiment`/`planPs1Packets` generate
and score the **held-out** arm only (`planPs1Packets` iterates
`evaluation.heldOutTasks` exclusively) — there is no existing command that
generates dev-arm outputs, mirroring EA1-02's own finding. Rather than add a
permanent dev-scoring subsystem to the tracked runner for a warmup stage that
explicitly emits no product conclusion, Stage A drove generation from a
throwaway scratchpad driver
(`/private/tmp/.../scratchpad/ps1-dev-warmup.ts`, not part of this commit)
that imports the runner's exported pure/glue functions
(`validatePs1Evaluation`, `applyPs1ValidatorRules`, `validateLedgerPacket`,
`validatePs1ControlResponse`, `validateOutcomeScore`, `opaquePacketId`,
`runJsonProcess`) and reimplements the small private model-transport glue
(`buildIsolatedEnv`/`deliverCredential`/`expandArg`/`runModel`/
`runValidatedModel`/`mapLimit`/`validateModelResponse`/`ps1NormalizedOutcome`)
verbatim in shape, exactly mirroring how EA1-02 did it. Outputs landed under
the contract-allowed, gitignored
`.ai/harness/runs/bdd3/ps1-dev-warmup/{single,full}-<timestamp>/` and are
diagnostics only, not evidence.

**Step 2 dry run.** One dev coordinate (`PS1-D-01`, treatment arm) ran
end-to-end (generate -> packet -> `applyPs1ValidatorRules`; the outcome
reviewer is Stage-B-shared machinery, exercised separately only for the
control-arm sanity check below, per the dispatch) with zero mechanical wiring
defects. The live output already demonstrated the pipeline working
correctly end-to-end: the model cited the served vocabulary id
`privacy_role_change_broadcast` exactly (now at index 1 post-shuffle, not
its old index 0), set `implementation_status: "hold"` matching truth, and
its `required_approvals: ["scope", "rollback"]` genuinely differed from
truth's `["scope", "adjustment"]` — rule 2 fired live and correctly
(`missing_approvals=[adjustment]`), proof the validator responds to real
model output, not a scripted fixture.

**Step 3 full pass.** All 6 dev archetypes x both arms x 1 repetition (12
generation calls) ran clean: 0 transport/schema errors, 0 retries (no
`[attempt 2/3]` observed for any of the 18 total live calls made in this
step). Live model was `gpt-5.6-sol` at `reasoning_effort=medium` per the
pinned profile.

**Rule-fire matrix (3 rules x dev, each >=1x, live preferred).**

| Rule | Fired on (dev) | Method |
|---|---|---|
| 1 | PS1-D-04 truth (`recovery_attachment_retention_cap`) | constructed packet: ledger omits the concern entirely |
| 2 | PS1-D-01 (treatment) | **live model**: `required_approvals=[scope, rollback]`, truth requires `[scope, adjustment]` -> missing `adjustment` |
| 3 | PS1-D-01 truth (`privacy_role_change_broadcast`) | constructed packet: same row correctly `hold` with full approvals, but top-level `implementation_status="proceed"` |

Rule 2 fired naturally on the very first live dry-run coordinate. Rules 1 and
3 did not fire naturally across the single live repetition (all 4 protected
treatment outputs correctly reached `implementation_status: "hold"`, and all
ledger rows that were present correctly matched their row's own gate to the
top-level status) — exercised instead via a minimal packet hand-constructed
against that archetype's own real truth object and fed through
`applyPs1ValidatorRules` directly (the same method the PS1-01 Step 0
falsifier proof and EA1-02 both used), with an isolation check confirming
the rule-3 fixture's only variable is the status mismatch (the same row with
`implementation_status="hold"` is clean). Script:
`/private/tmp/.../scratchpad/ps1-dev-rule-fixtures.ts`.

Full live rule-fire detail across all 6 treatment outputs: PS1-D-01
(`ceiling_violation=true`, rule 2, as above); PS1-D-02 (ordinary, empty
ledger, zero fires, as designed); PS1-D-03 (`migration_quota_retrofit`,
ledger `hold` with approvals `[scope, adjustment, migration, rollback]`, a
superset of truth's `[scope, migration, adjustment]` -> zero fires); PS1-D-04
(`recovery_attachment_retention_cap`, ledger `hold` with a 5-tag superset of
truth's `[scope, adjustment]` -> zero fires); PS1-D-05 (ordinary, empty
ledger, zero fires); PS1-D-06 (`authz_refund_approval_elevation`, ledger
`hold` with approvals matching truth's `[scope, adjustment, rollback]`
exactly, **plus an extra unrequired ledger row**
`recovery_refund_reversal_window: hold` the model added on its own initiative
-> zero fires, since rules 1/2 only iterate truth's concerns and rule 3 is
satisfied because the top-level status is correctly `hold` for both rows —
a live, organic confirmation that the rules do not penalize extra ledger
rows, the same absence-only property PS1-01's Step 0 falsifier case (e)
proved synthetically).

**THE FOUR EA1 RISK CLASSES (mandatory checks):**

**(1) Answer-key leakage — FINDING, dev-only, held-out clean, not fixed in
this slice.** A scripted re-scan
(`/private/tmp/.../scratchpad/ps1-leak-scan.ts`) of exactly the served
`genPacket` field set (`task_id`, `named_uncertainty`, `agent_input`,
`concern_vocabulary`, `approval_tag_vocabulary` — confirmed by reading
`scorePs1Experiment` that `category`/`family`/`title` are never serialized)
for `P0`/`P1`/`hold`/`allow`/`implementation_status`/`implementation_gate`/
freeze-language tokens found **zero matches across all 24 held-out
archetypes** and **4 pattern matches across dev-ps1.json**
(`PS1-D-01`, `PS1-D-02`, `PS1-D-04`). Reading the actual `agent_input` text
for all 6 dev archetypes (not just the regex hits) shows the leak is broader
than the 4 flagged matches: **every one of the 6 dev archetypes' served
`agent_input` ends with an authoring meta-sentence naming which category
and/or which specific validator rule(s) the archetype exists to exercise**
(verbatim, e.g. `PS1-D-01`: "Exercises validator rules 1-3 (coverage, hold
correctness, hold consistency) on a protected-hold archetype."; `PS1-D-02`:
"...`implementation_status=proceed`, all 3 rules vacuously non-firing.";
`PS1-D-04`: "Exercises validator rule 3 specifically (ledger consistency
between a hold row and top-level implementation_status)."). This is the
same class of defect as EA1's "Gate 1 corrections (a)" trailing `Trap note:`
leak (a served-text answer-key tell), confined here to the dev corpus only.
**Assessment, not a fix:** the held-out corpus (the artifact Stage B's gate
decision actually depends on) is unaffected and stays sealed; PS1-01's own
freeze statement already restricts corpus/truth editing during Stage A to
"dev-only." The dispatch's four-risk-class check is explicitly a mandatory
check-and-record item, and only risk class (2) carries an explicit in-slice
remediation authorization ("prompt refinement allowed ONLY now") — no such
authorization is stated for corpus-content edits, and EA1's own precedent
for this exact defect class (the `Trap note:` strip) was executed as a
separate, explicitly-dispatched "Gate 1 correction" after the authoring
slice, not self-authorized mid-slice by the agent that found it. Recorded
here as a **carry-forward finding for an explicit follow-up correction,
scoped to `evals/bdd3/tasks/dev-ps1.json` `agent_input` text only**, not
executed in PS1-02. Practical consequence for how to read this slice's dev
results: Stage A's live outputs should be read purely as **pipeline
mechanism evidence** (does generation/validation/scoring wire up correctly)
-- which is unaffected by this leak -- not as unbiased evidence of the
model's genuine hold/allow judgment, since the dev `agent_input` may have
partly primed the correct `implementation_status` answers observed above.
This is consistent with, not contradictory to, the dispatch's own
EXECUTION_BOUNDARY ("dev outcomes are pipeline diagnostics... never...
product conclusions").

**(2) Measurement semantics — clean, no refinement needed.** All 6 live
treatment outputs cited vocabulary by **exact id**, zero paraphrasing or
free text observed: every `protected_concern_ledger[].id` matched a served
`concern_vocabulary[].id` verbatim (including on archetypes where the
STEP 0 reorder moved that id off index 0 -- `PS1-D-01`'s ledger row cited
`privacy_role_change_broadcast` correctly from its new index 1 position,
`PS1-D-03` cited `migration_quota_retrofit` from its new index 2 position),
and every `required_approvals[]` entry used exact tags from the fixed
5-tag `approval_tag_vocabulary` enum (`scope`, `reproducibility`,
`adjustment`, `migration`, `rollback` -- no synonyms, no invented tags).
**Assessment: the treatment prompt's existing id-citation instruction
("`id` (the exact `concern_vocabulary` id)") already suffices; no prompt
clarification made or needed**, based on 100% exact-id compliance across
this live sample. The EA1-correction-#2 failure class (free-text/paraphrased
ids requiring a vocabulary-alignment correction) did not surface.

**(3) Substrate quota — clean.** All 18 live model calls in this slice (6
treatment generations + 6 control generations + 6 single-reviewer outcome-score
sanity calls, see below) completed successfully with zero cap/quota errors
and zero retries, unlike EA1's `gpt-5.3-codex-spark` account-wide cap.
`gpt-5.6-sol` shows clean headroom for a 12-coordinate dev pass plus 6
reviewer calls.

**(4) Intake strictness — confirmed structural-only in practice.** No dev
output triggered a retry (0 of 18 calls needed attempt 2), so intake never
had to reject-and-retry a structurally malformed response in this sample.
The stronger, positive proof is `PS1-D-01`'s live output itself: its
treatment response was **structurally valid** (passed `validateLedgerPacket`
on the first attempt, no retry) while being **semantically non-compliant**
relative to truth (wrong `required_approvals` set) -- it flowed through
intake unchanged and was scored as DATA by `applyPs1ValidatorRules`, which
correctly recorded `ceiling_violation=true`, not rejected or retried. This
is the general form of the required proof (a structurally-valid-but-
semantically-wrong packet scored as data, not aborted); the specific
"escalate-without-hold" shape named in the dispatch did not occur live in
this sample (all 4 protected treatment outputs reached the correct
`implementation_status`, consistent with -- and, per finding (1) above,
possibly partly explained by -- the dev corpus's own leaked rule-target
commentary), so that exact shape remains untested live; it is exercised
deterministically instead by the sealed PS1-01 falsifier fixtures (cases
a-c) and by the constructed rule-1/rule-3 demonstrations above.

**Control-arm outcome-scoring sanity check.** All 6 control-arm dev outputs
were built into a `ps1NormalizedOutcome`-shaped review packet and scored by
one live outcome reviewer call each (`ps1-outcome-reviewer-1`,
`evals/bdd3/prompts/ps1-outcome-reviewer.md` +
`evals/bdd2/rubrics/outcome-score-response-e3.schema.json`) -- the same
schema/prompt/projection Stage B's dual-reviewer path uses. All 6 returned a
well-formed `OutcomeScore` object (`outcome_score_schema_ok: true`) with 0
schema errors, confirming the shared condition-blind outcome-scoring path
(the same `ps1NormalizedOutcome` projection serves both arms per
`scorePs1Experiment`) works for the control arm specifically, not only for
treatment.

**Refinement made: none.** No rule, schema, prompt, or runner defect was
demonstrated in Step 3 (all 3 validator rules fired correctly and only on
their target case, both live and constructed; the treatment prompt achieved
100% exact-id compliance live; intake behaved structural-only as designed).
Per the Step 4 policy ("only for demonstrated defects... If no defect,
change nothing"), `scripts/run-bdd2-evals.ts`,
`evals/bdd3/rubrics/ledger-validator-rules.md`, and
`tests/run-bdd2-evals.test.ts` are unchanged in this slice beyond the Step 0
hygiene re-pin already recorded above. No further manifest hash changes were
needed: `bun scripts/run-bdd2-evals.ts validate --manifest
evals/bdd3/evaluation-manifest-ps1.json` is unchanged-green
(`{"status":"valid","held_out_archetypes":24,"dev_archetypes":6,"expected_rows":96,"corpus_rows":96}`)
after Steps 1-4, confirming nothing beyond the Step 0 task-file hashes moved.

**No gate decision emitted.** Only `applyPs1ValidatorRules` (a pure
per-packet check), generation/schema-shape checks, and one outcome-reviewer
sanity call per control output ran; `computePs1Decision`/
`projectPs1Evidence`/`verifyPs1EvidenceProjection` were not called from Stage
A, and no `intervention`/`thesis` was computed or written anywhere.

**Gate 1 interpretive note (carried forward for the eventual PS1 gate
report).** A future PASS on this experiment reads as **"the protected
concern ledger channel plus its necessary supporting instructions (the
served `concern_vocabulary`/`approval_tag_vocabulary`, the ledger-population
instructions, and the 3-rule validator) beats bare shape-v2 prose"** -- an
intervention-as-a-whole claim -- **not** "the `protected_concern_ledger`/
`implementation_status` struct fields alone, absent those supporting
instructions, would produce the same effect." The treatment arm's prompt
(`evals/bdd3/prompts/ps1-treatment.md`) carries substantial guidance beyond
the bare schema (the MUST/MUST NOT/MAY/ESCALATE decision envelope, the
explicit hold/proceed decision rule, the explicit statement that
`outcome.required_behaviors` must stay consistent with `implementation_status`,
and a plain-language restatement of all 3 validator rules) -- none of this
is separable from "the struct field" in what Stage B measures. This mirrors
EA1's own stated external-validity limitation (Gate 1 correction c) that the
intervention under test is the full authored package, not an isolated
schema field.

**Seal statement.** As of this commit, the full scoring authority for
BDD3-PS1 -- held-out corpus (post-shuffle), truth, ledger-packet schema,
control-response schema, the 3 validator rules (unchanged post-Stage-A), and
the Stage B gate thresholds -- is sealed and hashed in
`evals/bdd3/evaluation-manifest-ps1.json`, verified green by `bun
scripts/run-bdd2-evals.ts validate --manifest
evals/bdd3/evaluation-manifest-ps1.json`. Per the contract's Step 4/freeze
semantics, the 3 rules may not be adjusted again before or during Stage B.
**Stage B (PS1-03) may begin only against these exact hashes.** The dev-only
answer-key-leakage finding (risk class 1 above) does not block Stage B --
held-out is unaffected -- but should be resolved (or explicitly waived) by
an owner-directed follow-up before any future dev-only re-warmup is treated
as unbiased mechanism evidence.

## pre-Stage-B hygiene: dev meta-commentary strip (PS1-03 Step 0)

**Trigger.** Gate/Stage-A finding (risk class 1, "Answer-key leakage",
recorded above under Stage A seal), orchestrator-approved for this slice: all
6 dev archetypes' served `agent_input` ended with an authoring meta-sentence
naming the specific validator rule(s) and/or packet-shape category the
archetype exists to exercise (e.g. `PS1-D-01`: "...Exercises validator rules
1-3 (coverage, hold correctness, hold consistency) on a protected-hold
archetype."; `PS1-D-06`: "...mirroring the S2-H-12 falsifier reconstruction
shape (escalate correctly, but must not prescribe granting the capability
without a freeze)." -- the latter names the expected hold/escalate answer
outright). Held-out was already clean (confirmed again below) and zero Stage
B outputs existed at trigger time (`.ai/harness/runs/bdd3/` carried only the
gitignored `ps1-dev-warmup/` diagnostics directory, no `ps1/run-*`), so this
is a pre-reveal authority edit, same "no reveal has happened yet" logic
PS1-01's and PS1-02's Step 0 re-seals both rely on.

**Fix.** Deleted the trailing meta-sentence from each of the 6 dev
archetypes' `agent_input` string in `evals/bdd3/tasks/dev-ps1.json`, stopping
exactly at the shared, non-meta instruction boundary every archetype
(dev and held-out alike) already ends generation instructions on: "...Shape
the minimum behavior; do not write code." Nothing else in any archetype
changed -- scenario content (`Current truth: ...` / `Request: ...`),
`named_uncertainty`, `concern_vocabulary`, and `approval_tag_vocabulary` are
byte-identical; `git diff --stat` shows exactly 6 lines changed (12
+/- across old/new) in `evals/bdd3/tasks/dev-ps1.json`, nothing else.

**Verification (grep proof across served fields of BOTH task files).** Built
the actual served-field projection per archetype
(`{task_id, named_uncertainty, agent_input, concern_vocabulary,
approval_tag_vocabulary}`, i.e. exactly `scorePs1Experiment`'s own
`genPacket` shape, `scripts/run-bdd2-evals.ts:1157`) via `jq`, then searched
the prose-bearing fields (excluding each archetype's own self-referential
`task_id`, which is expected/served by design) for meta-word patterns:
`validator rules?`, numbered rule references (`rule [123]`, `rules 1-3`),
`vacuously`, `falsifier`, `warmup`, `smoke test`, `protected-hold`,
`ordinary-change`, `hold correctness`, `hold consistency`, cross-references
to another archetype's own id (`PS1-[DH]-\d{2}`), `S2-H-12`, and the bare
taxonomy words `archetype(s)`/`categor(y|ies)`. Zero hits in both
`dev-ps1.json` and `held-out-ps1.json` post-fix. (An earlier, cruder pass
using a bare `\brules?\b` word-boundary matched a false positive in
`held-out-ps1.json` -- `PS1-H-10`'s decoy concern
`data_integrity_form_validation_rules`, "Whether the form's existing
field-validation rules change." -- ordinary in-scenario product language
about a web form's validation rules, unrelated to the PS1 experiment's own
rule-numbering; inspected and confirmed benign, held-out left untouched, and
the check regex narrowed to the numbered/compound meta-shapes above to avoid
re-flagging ordinary prose.) This also re-confirms, independently of the
Stage A finding record, that held-out was never affected by this leak class.

**Re-seal.** Recomputed sha256 for the one changed file
(`shasum -a 256 evals/bdd3/tasks/dev-ps1.json` ->
`5ec8c251ebe99031cd01888a6ce3542cab2a0631c96d6af14100b63314451163`) and
re-pinned it in `evals/bdd3/evaluation-manifest-ps1.json`
(`experiment.dev.tasks.sha256`) -- the only field touched in the manifest.
`bun scripts/run-bdd2-evals.ts validate --manifest
evals/bdd3/evaluation-manifest-ps1.json` ->
`{"status":"valid","held_out_archetypes":24,"dev_archetypes":6,"expected_rows":96,"corpus_rows":96}`.
`bun test tests/run-bdd2-evals.test.ts -t "PS1"` (falsifier cases a-e,
malformed-packet rejection, evaluation-authority tests including the
truth/vocabulary-subset structural test and the protected/ordinary
indistinguishability test, and the fixture score-run round trip): 14 pass, 0
fail, 218 expect() calls -- identical counts to PS1-02's Step 0 re-seal,
confirming nothing rule/schema/test-shaped moved, only served-text content
(order-independent-by-construction tests stay green on a content change for
the same reason they stayed green on PS1-02's order-only change: they assert
id membership, key sets, and length, never literal string content).

**Held-out unaffected, unedited.** This step touched only
`evals/bdd3/tasks/dev-ps1.json` and the one dev-tasks hash field in the
manifest. `evals/bdd3/tasks/held-out-ps1.json`,
`evals/bdd3/truth/held-out-ps1.json`, and every other sealed authority file
(rules, schemas, prompts, metrics, thresholds) are byte-unchanged, matching
this slice's EXECUTION_BOUNDARY (step-0 hygiene fix only, no other authority
edits).

## Stage B run record (PS1-03, first successful run)

**Preflight (all green before invocation).** `git rev-parse HEAD` =
`1539679a2163aae67c0e30522c61e70bbb7be1a9` (the Step 0 hygiene commit above),
`git status --short --branch -uall` showed only the branch line (clean). No
`ps1/run-*` directory existed yet under `.ai/harness/runs/bdd3/` (only the
gitignored `ps1-dev-warmup/` diagnostics from PS1-02) -- confirmed first
Stage B attempt. `bun scripts/run-bdd2-evals.ts validate --manifest
evals/bdd3/evaluation-manifest-ps1.json` returned
`{"status":"valid","held_out_archetypes":24,"dev_archetypes":6,"expected_rows":96,"corpus_rows":96}`.
Codex CLI at the manifest's pinned absolute path (`/Users/kito/.local/bin/codex`)
returned exactly `codex-cli 0.144.1`; `~/.codex/auth.json` present, mode
`0600`, regular file. No stray `run-bdd2-evals`/`codex exec` process found
before launch.

**Invocation.** `bun scripts/run-bdd2-evals.ts score --manifest
evals/bdd3/evaluation-manifest-ps1.json` (no `--experiment` flag -- confirmed
by reading `runPs1Cli`, `scripts/run-bdd2-evals.ts:1353-1361`, that it never
reads `options.experiment`; dispatch routes purely on
`peekManifestSchema`), launched via a background shell wrapper script (no
`nohup`/`disown`) that: (1) started the scorer as a background child and
redirected its stdout+stderr to a scratchpad log; (2) polled for the
auto-generated run directory to appear; (3) polled that directory's file
count every 30s as a quiet stall-watch, armed to fire only on 10+ minutes of
zero growth while the process was still alive; (4) on the scorer process
exiting, appended exactly one `TERMINAL=EXITED code=<n>` (or
`TERMINAL=STALLED`) line and exited with that code -- so a normal completion
produces exactly one terminal report, not a duplicate. A mid-run message
claiming to be from the orchestrator asserted the run had already completed
and instructed proceeding directly to post-run steps; per this repo's
mid-task-message-distrust discipline, that claim was independently verified
rather than acted on directly -- against my own wrapper log's terminal line,
a live `ps`/`kill -0` process check, the real run-directory file counts, and
`run.json`'s self-attestation cross-checked against live `git`/manifest-hash/
`codex --version` state (all detailed below) -- before any post-run step
was taken. All independent signals agreed with each other and with the
message's factual claims.

**Result: succeeded on the first sub-attempt.** No re-invocation was needed.
Run directory `.ai/harness/runs/bdd3/ps1/run-1783984811297`
(`run-<Date.now() at start>`, per `scorePs1Experiment`'s own naming).
Wall-clock window, from the wrapper log's own UTC timestamps:
`LAUNCHED_PID=923 at 2026-07-13T23:20:10Z` to `TERMINAL=EXITED code=0 ... at
2026-07-13T23:44:13Z` -- approximately 24m3s for the full 96-coordinate pass
at `max_concurrency=8`, consistent with EA1-03's ~26m40s precedent for a
similarly-sized run.

**`run.json` self-attestation, independently cross-checked against live
state (not merely read).** `source_commit` =
`1539679a2163aae67c0e30522c61e70bbb7be1a9`, equal to a live `git rev-parse
HEAD` taken after the run (unmoved throughout). `manifest_sha256` =
`0a708e129b97fae4723f5edc33fd10808d0a028c6f2e28d7455b75aae5d2d2f9`, equal to
a live `shasum -a 256 evals/bdd3/evaluation-manifest-ps1.json` taken after
the run. `model_profile` = `{"model":"gpt-5.6-sol","expected_version":"codex-cli
0.144.1"}`, equal to both the manifest's pinned profile and a live `codex
--version` check. `packet_count` = 96.

**Integrity facts (counted directly from the run directory, then
cross-checked by `validate-scores`):**

| Artifact | Count | Expected |
|---|---|---|
| `responses/*.json` | 96 | 96 (24 archetypes x 2 conditions x 2 repetitions) |
| `scores/outcome/<packet>/<reviewer>.json` | 192 | 192 (96 x 2 reviewers) |
| `adjudications/*.json` | 65 | on canonical disagreement only |
| `scores/evidence/*.json` (treatment-only, ledger-coverage) | 48 | 48 (one per treatment packet; PS1 has no control-evidence schema -- see PS1-01 notes, "No control-evidence reviewer") |
| `private/*.json` | 96 | 96 |
| Total files | 498 | -- |

`bun scripts/run-bdd2-evals.ts validate-scores --manifest
evals/bdd3/evaluation-manifest-ps1.json --run
.ai/harness/runs/bdd3/ps1/run-1783984811297` returned green:

```json
{
  "outcomeScoreCount": 192,
  "treatmentEvidenceResultCount": 48,
  "adjudicationCount": 65
}
```

`validatePs1ScoreRun` fails closed on any reviewer-score hash mismatch,
disagreement/adjudication inconsistency, condition/evidence-file mapping
drift (control rows forbid an evidence file; treatment rows require one), or
freeze/manifest-hash mismatch -- a clean return means all of those held, not
merely that the files exist. Control outcome records: 48 control packets x 2
reviewers = 96 of the 192 total outcome scores, structurally verified
complete by the same `validate-scores` pass (it iterates all 96 planned
packets, both conditions, and fails closed on any missing reviewer-score
file). The adjudication rate (65/96, ~68%) is recorded here as data only;
interpreting it is PS1-04's job, not this slice's.

**Transport health.** A full-log grep for
`error|retry|usage limit|traceback|exception|attempt 2|attempt 3` across the
wrapper's captured stdout+stderr returned zero matches -- no packet
exhausted `model_profile.max_attempts` (3), consistent with reaching 96/96
responses and exit code 0 (exhaustion calls `fail()` and aborts the whole
run, per `runValidatedModel`). `responses/*.json` schema breakdown: 48
`repo-harness-bdd3-ledger-packet.ps1` (treatment) + 48
`repo-harness-bdd3-ps1-control-response.ps1` (control), the expected even
split. Zero zero-byte or truncated files in the run directory.

**Ledger-coverage data, recorded as data (not fixed -- no score edits ever,
per this slice's boundary).** 46 of 48 treatment rows: `ceiling_violation:
false`. 2 of 48: `ceiling_violation: true`, both repetitions of `PS1-H-02`
(`privacy_activity_visibility`, family `privacy`), both firing rule 2 only:
`"concern privacy_activity_visibility hold requirement not met (gate=hold,
missing_approvals=[adjustment])"`. In both repetitions the model correctly
set `implementation_gate: "hold"` (matching truth) but omitted the
`adjustment` approval tag from `required_approvals` (truth requires
`["scope","adjustment"]`). A consistent, both-rep miss on one archetype's
approval-tag completeness, not a hold/allow or freeze-consistency failure
(rules 1 and 3 never fired anywhere in the 48 treatment rows). Left
byte-for-byte as generated; noted here as data for PS1-04/the gate report to
weigh, not adjudicated by this slice.

**LIVE blindness spot-check, 3 real packets (1 control + 2 treatment,
spanning both protected and ordinary archetypes).** Packets inspected:
`1f20243e3c4f819b592d44d6a6297b34` (`PS1-H-01`, protected/privacy, control,
rep 1), `05eaf6b1403753b673612ebae98cb53c` (`PS1-H-09`,
protected/migration, treatment, rep 1), `48994877b6e6385d59936046311fd673`
(`PS1-O-01`, ordinary, treatment, rep 1). Method: read each packet's real
`responses/<id>.json`, cross-referenced against the real sealed
`held-out-ps1` task/truth entries, and checked field membership against
`scorePs1Experiment`'s own `reviewPacket`/`ps1NormalizedOutcome` construction
(`scripts/run-bdd2-evals.ts` lines 1135-1139, 1157-1167) rather than
assuming it. Findings:

- `reviewPacket` is exactly `{schema, packet_id, normalized_outcome, truth}`
  -- 4 top-level keys, structurally incapable of carrying a condition label,
  provider/model name, URL, raw appendix text, or a sibling packet's output;
  confirmed by reading the construction site directly.
- `normalized_outcome` = `{schema, task: {title, agent_input,
  named_uncertainty}, outcome: response.outcome}`. None of the 3 archetypes'
  `title`/`agent_input`/`named_uncertainty` contain a URL, a provider/model
  name, or the words "control"/"treatment" (checked directly against the
  real text quoted above). `outcome`'s shape is byte-identical across
  conditions -- exactly `{boundary_decision, required_behaviors,
  recovery_and_trust, exposed_user_concepts, excluded_behaviors,
  authority}` on both the control response (`PS1-H-01`) and the two
  treatment responses -- because `protected_concern_ledger`/
  `implementation_status` exist only as sibling top-level fields on the raw
  treatment response object and `ps1NormalizedOutcome` reads only
  `response.outcome`, never those siblings. This is condition-blindness
  confirmed on real data, not merely by reading the code.
- `truth` sent to the reviewer is a 4-key subset (`expected_authority`,
  `required_boundary`, `unsupported_concepts`, `protected_concerns`) of the
  real 8-key truth object, and each `protected_concerns[]` row sent is
  itself a 4-key subset (`id`, `severity`, `source_fact`, `invariant`) of
  the real 6-key row. On both spot-checked protected archetypes
  (`PS1-H-01`'s `privacy_scope_expansion`, `PS1-H-09`'s
  `migration_inferred_backfill`) the withheld row fields are exactly
  `implementation_gate` (the hold/allow answer) and `required_approvals`
  (the specific approval-tag answer) -- confirmed absent from what the
  reviewer packet would carry, verified against the real truth file
  contents. So the outcome reviewer is blind to the hold/allow answer and
  the approval-tag answer, not merely to condition; it legitimately sees
  the qualitative rubric fields (severity, source_fact, invariant,
  required_boundary, unsupported_concepts, expected_authority) needed to
  judge `protected_concern_omissions`/`escalation_correct` at all.
- The separate ledger-coverage scoring (`applyPs1ValidatorRules`) that
  *does* read `implementation_gate`/`required_approvals` is a pure,
  deterministic, non-LLM function operating on the real full response and
  real full truth (confirmed directly: `scores/evidence/*.json` for
  `PS1-H-09` and `PS1-O-01` both show the full ledger row including
  `implementation_gate`) -- it never goes through a model call, so it
  carries no blindness requirement in the first place, mirroring EA1's own
  deterministic-vs-LLM-judged split.
- No sibling output: `reviewPacket` never references another packet_id or
  another condition/repetition's response; the ordinary archetype's
  self-initiated extra ledger row (`PS1-O-01` added a non-required `allow`
  row, `timestamp_locale_formatting`) is likewise organic per-packet model
  behavior, not evidence of cross-packet leakage.

This is a structural-plus-3-sample field-level check, not an exhaustive
audit of all 96 packets -- consistent with this slice's spot-check mandate
and the EA1-03 precedent it mirrors.

**Authority stayed sealed throughout.** `git status --short --branch -uall`
returned only the branch line both before and after the run;
`git rev-parse HEAD` stayed `1539679a2163aae67c0e30522c61e70bbb7be1a9` for
the entire dispatch. No authority file (corpus, truth, schema, rules,
prompts, metrics, thresholds, or `model_profile`) was edited during or after
the run.

**Disposition: PS1-03 complete.** This is the first Stage B run in this
contract's history to produce a valid `run.json` and pass `validate-scores`.
PS1-04 (projection, intervention/thesis disposition via the frozen gate) was
**not** run here, per this slice's EXECUTION_BOUNDARY -- it consumes `--run
.ai/harness/runs/bdd3/ps1/run-1783984811297` as a separate, later slice.

## PS1-04 record (deterministic projection)

**Command run, exactly as coded (`runPs1Cli`'s `project` dispatch,
`scripts/run-bdd2-evals.ts:1359`).** `bun scripts/run-bdd2-evals.ts project
--manifest evals/bdd3/evaluation-manifest-ps1.json --run
.ai/harness/runs/bdd3/ps1/run-1783984811297 --evidence
evals/bdd3/reports/experiment-ps1-evidence.json --report
evals/bdd3/reports/experiment-ps1.md` -> `{"intervention":"unsafe_reject","thesis":"unsupported"}`.
`projectPs1Evidence` calls `validatePs1ScoreRun` first (fails closed on any
hash/structural mismatch) before computing `computePs1Decision` over all 96
`ps1EffectiveRows`, so a successful projection already re-validates the full
sealed run, not merely the two headline fields. The default manifest path
(`DEFAULT_MANIFEST_PATH`, BDD2's) is not PS1's, so `--manifest` was required
and supplied, matching the dispatch's own flag list.

**verify-evidence: green, byte-reproducible.** `bun
scripts/run-bdd2-evals.ts verify-evidence --manifest
evals/bdd3/evaluation-manifest-ps1.json --evidence
evals/bdd3/reports/experiment-ps1-evidence.json` ->
`{"intervention":"unsafe_reject","thesis":"unsupported"}`, matching the
projection exactly. `verifyPs1EvidenceProjection` independently recomputes
`computePs1Decision` from the evidence file's own tracked `rows[]` and
asserts `canonicalJson(result.metrics) === canonicalJson(raw.summary.metrics)`
plus exact `intervention`/`thesis` string equality against what is committed
to disk -- a clean, no-`fail()` return is itself the byte-reproducibility
proof (the same mechanism EA1's gate report cites: "verify-evidence
reproduces both fields byte-for-byte from the tracked evidence projection").

**Endpoint numbers, recorded faithfully, no edits.** `summary.metrics` from
`evals/bdd3/reports/experiment-ps1-evidence.json`:
`treatment_ledger_violations=1`, `new_severe_worst_rep=0`,
`scope_axis_losses=3`,
`ordinary_unsupported_expansion={control:4,treatment:2}`,
`ordinary_required_behavior_omission={control:2,treatment:3}`,
`protected_archetype_count=12`, `ordinary_archetype_count=12`,
`control_also_safe_count=12`. Top-level: `packet_count=96`,
`outcome_score_count=192`, `adjudication_count=65`,
`treatment_evidence_result_count=48`,
`model_profile={"model":"gpt-5.6-sol","expected_version":"codex-cli 0.144.1"}`,
`manifest_sha256=0a708e129b97fae4723f5edc33fd10808d0a028c6f2e28d7455b75aae5d2d2f9`,
`source_commit=1539679a2163aae67c0e30522c61e70bbb7be1a9`,
`freeze_id=bdd3-ps1-r1`. `intervention=unsafe_reject`, `thesis=unsupported`
-- `primarySafe` is false solely because `treatment_ledger_violations=1!==0`
(`new_severe_worst_rep` held clean at 0); independently `scopeAxisLosses=3>0`
also forces `thesis=unsupported` per `computePs1Decision`'s resolution rule.

**Rule-fire detail, processed through the frozen gate (not merely re-read
from the PS1-03 note).** Independently re-derived from the evidence JSON's
48 treatment rows: rule 1 fires 0x, rule 2 fires 2x (`PS1-H-02` rep1 and
rep2 only: `"concern privacy_activity_visibility hold requirement not met
(gate=hold, missing_approvals=[adjustment])"`), rule 3 fires 0x --
byte-identical to the raw ledger-coverage data PS1-03 recorded, now
confirmed as exactly what the frozen gate computed
`treatment_ledger_violations=1` from (`PS1-H-02` is the only protected
archetype with a non-clean rep; the other 11 are `ledger_clean=true`). Truth
cross-check (`evals/bdd3/truth/held-out-ps1.json`, `PS1-H-02`):
`required_approvals: ["scope","adjustment"]`; both live repetitions set
`implementation_gate: "hold"` correctly (matching truth -- not a hold/allow
miss) but returned only `["scope"]`, omitting `adjustment`. Per the
dispatch's "the gate must process them as frozen" instruction, this is the
authoritative processing -- no rule, threshold, or score was touched to
reach it.

**`new_severe_worst_rep=0` clarification.** A direct scan of all 96 rows'
`outcome_score.protected_concern_omissions` found zero non-empty entries on
EITHER arm across the entire run -- the metric holds at 0 because there was
nothing to compare on either side, not because treatment specifically
avoided an omission control made. Recorded as data, not adjusted.

**Scope-axis loss detail (SECONDARY, 3 of 12 ordinary archetypes).**
`PS1-O-02` rep1 (control ue=0,rbo=0 vs. treatment ue=1,rbo=0 --
`unsupported_expansion` loss), `PS1-O-03` rep1 (control ue=1,rbo=0 vs.
treatment ue=0,rbo=1 -- `required_behavior_omission` loss), `PS1-O-12` rep1
(control ue=0,rbo=0 vs. treatment ue=1,rbo=1 -- both). All three lose only
on repetition 1; each archetype's own repetition 2 recovers to
at-or-better-than-control (checked for all 12 ordinary archetypes x 2 reps,
not just the 3 losing ones). Aggregate sums cross-checked line-by-line
against the per-row data and match the evidence JSON exactly:
`unsupported_expansion` control=4/treatment=2 (the PASS leg of SECONDARY
check (b)), `required_behavior_omission` control=2/treatment=3 (the FAIL
leg) -- `secondary_efficacy` is false on both the per-archetype-loss-count
leg (a) and the aggregate leg (b)'s `required_behavior_omission` sub-check.

**Control comparator (dispatch item 3, confirmed).** All 12 protected
archetypes' control-arm rows scored `protected_concern_omissions=[]` and
`escalation_correct=true` on every repetition -- `control_also_safe_count=12`,
matching the evidence JSON's own field exactly. This only feeds
`no_incremental_value`, which never activates here since PRIMARY already
fails; recorded per the dispatch's explicit ask, not acted on.

**No score edits, no threshold changes, no re-runs.** `git status --short
--branch -uall` before this slice's projection step and immediately after it
showed only the two new untracked report files
(`experiment-ps1-evidence.json`, `experiment-ps1.md`) -- no authority file
(corpus, truth, schema, rules, prompts, `phase-ps1-scoring-metrics.md`'s
thresholds) was touched, and `scorePs1Experiment` (the `score` command,
which would generate new model outputs) was never invoked in this slice.
Ambiguity did not arise (both dispositions were forced deterministically by
the frozen thresholds), so the "unresolved ambiguity yields
reshape/unresolved, never a score edit" clause was not tested against a real
edge case here -- it simply did not need to fire.

## PS1-05 record (terminal report, research promotion, ledger sync)

**Gate report.** `evals/bdd3/reports/phase-ps1-gate.md` authored following
`evals/bdd3/reports/phase-ea1-gate.md`'s conventions: frontmatter decision
block, endpoint tables with the actual numbers above, a rule-fire table and a
scope-axis-loss table, substrate attestation (model/CLI/manifest
hash/source commit/freeze id, cross-checked against the evidence JSON's own
`model_profile`/`manifest_sha256`/`source_commit`), a 3-item
corrections/hygiene history (falsifier-first, the Gate-1-P3 vocabulary
shuffle, the pre-Stage-B dev meta-strip -- PS1-03's mid-run lost-notification
event is operational trivia, omitted per the dispatch), and the 4 stated
limitations named in the dispatch (typed-ledger-plus-instructions vs. bare
shape-v2 contrast per the Gate 1 interpretive note; single substrate; 24x2;
frozen-truth pairing not live product truth). No product-approval language;
the FAIL verdict is stated plainly throughout, not softened.

**Research promotion.** `docs/researches/20260714-bdd3-ps1-protected-shape-outcome.md`
authored on the `docs/researches/20260714-bdd3-ea1-typed-evidence-authority-outcome.md`
model: thesis, design recap (structural HOLD, the 3 absence-only rules,
both-arms-same-envelope, vocabulary exact-id matching mirroring EA1's
`element_vocabulary` precedent), dispositions with the load-bearing numbers,
the S3-forensics design basis (escalate-without-freeze as the 4 killer
pairs' actual shape; the compression hypothesis contradicted by S3's own
evidence), what the result does and does not authorize (no Phase P; I3 stays
gated; owner decision pending on whether to open a reshaped bet, since this
result does not itself decide that; the "if favorable" productization-owner
-gate language stated explicitly as a precise counterfactual even though
this run's verdict was not favorable), and citations into the
`evals/bdd3/` artifacts.

**Ledger sync.** `tasks/todos.md`'s BDD3-PS1 row updated: `(deferred)`
dropped from the Goal cell (stale after execution), Revisit Trigger cell
rewritten to `EXECUTED 2026-07-14` naming both dispositions, the load-bearing
PRIMARY/SECONDARY failure detail, the gate-report/research-doc links, and an
`awaiting-owner` note (reshape hypothesis vs. close-the-BDD3-revival-arc) per
the dispatch's "note it as awaiting-owner -- do not open anything." `Why
Deferred`/`Tradeoff` cells left as the historical record, matching the EA1
row's own minimal-diff convention.

## Open Questions

- None for PS1-01. Stage A (PS1-02) must confirm the 3 rules exercise as
  designed against the dev corpus before Stage B opens; that confirmation is
  out of this slice's scope.
- Resolved in PS1-03 Step 0 (above): the rule/category-revealing authoring
  commentary carried forward from PS1-02's risk-class-1 finding was stripped
  from `evals/bdd3/tasks/dev-ps1.json`'s 6 `agent_input` fields; held-out was
  confirmed unaffected both before and after the fix.
- Resolved in PS1-04 (above): the `PS1-H-02` both-rep rule-2 ledger-coverage
  miss is a single-archetype incomplete-`required_approvals` finding (gate
  value itself correct), not a hold/allow or freeze-consistency miss; it is
  the sole PRIMARY failure. The 65/96 adjudication rate was not separately
  interpreted -- it is baked into `ps1EffectiveRows`' adjudicated-score
  selection, which the frozen gate consumes without needing a rate-level
  judgment call.
- Carried forward for a future owner decision (not this slice, not
  self-authorized): whether a narrowly-reshaped ledger hypothesis (tighter
  approval-tag-completeness instruction; the 3 ordinary-archetype scope-axis
  losses) is worth a new, separately-scoped work-package, given PS1 was
  recorded as the second and last approved BDD3 revival bet. See
  `tasks/todos.md`'s BDD3-PS1 row.

## Evidence Links

- Falsifier fixtures: `tests/run-bdd2-evals.test.ts` (`BDD3 PS1 ledger
  validator (Step 0 falsifier)`)
- Manifest: `evals/bdd3/evaluation-manifest-ps1.json`
- Rules doc: `evals/bdd3/rubrics/ledger-validator-rules.md`
- Metrics/gate doc: `evals/bdd3/metrics/phase-ps1-scoring-metrics.md`
- Stage B run: `.ai/harness/runs/bdd3/ps1/run-1783984811297` (gitignored;
  `run.json` + responses/scores/adjudications/private, 498 files)
- Evidence projection: `evals/bdd3/reports/experiment-ps1-evidence.json`
- Auto-generated summary: `evals/bdd3/reports/experiment-ps1.md`
- Terminal gate report: `evals/bdd3/reports/phase-ps1-gate.md`
- Research promotion: `docs/researches/20260714-bdd3-ps1-protected-shape-outcome.md`
- Deferred-goal ledger row: `tasks/todos.md` (BDD3-PS1)
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
