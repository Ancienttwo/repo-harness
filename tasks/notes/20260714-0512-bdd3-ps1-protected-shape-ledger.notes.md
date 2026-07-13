# Implementation Notes: bdd3-ps1-protected-shape-ledger

> **Status**: Active
> **Plan**: plans/plan-20260714-0512-bdd3-ps1-protected-shape-ledger.md
> **Contract**: tasks/contracts/20260714-0512-bdd3-ps1-protected-shape-ledger.contract.md
> **Review**: tasks/reviews/20260714-0512-bdd3-ps1-protected-shape-ledger.review.md
> **Last Updated**: 2026-07-14 05:31
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

## Open Questions

- None for PS1-01. Stage A (PS1-02) must confirm the 3 rules exercise as
  designed against the dev corpus before Stage B opens; that confirmation is
  out of this slice's scope.

## Evidence Links

- Falsifier fixtures: `tests/run-bdd2-evals.test.ts` (`BDD3 PS1 ledger
  validator (Step 0 falsifier)`)
- Manifest: `evals/bdd3/evaluation-manifest-ps1.json`
- Rules doc: `evals/bdd3/rubrics/ledger-validator-rules.md`
- Metrics/gate doc: `evals/bdd3/metrics/phase-ps1-scoring-metrics.md`
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
