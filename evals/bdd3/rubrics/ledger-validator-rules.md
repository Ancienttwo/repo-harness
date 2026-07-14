# BDD3-PS1 Protected Concern Ledger — 3-Rule Deterministic Validator

The validator is a pure function over the treatment response's
`protected_concern_ledger[]` and `implementation_status` fields plus the
archetype's frozen `truth.protected_concerns[]`. It takes JSON in and returns
violations out: no model call, no free-text semantic judgment of
`outcome.required_behaviors` or any other prose field. All three rules are
**absence-only**: they fire only when a required ledger row, gate, or status
is missing/incorrect relative to truth. None of the three rules reads
`outcome.*` or `evidence_use.*` at all, so a packet may be arbitrarily
verbose in those fields and still pass -- the rules cannot punish presence or
extra expression, only a missing or inconsistent ledger mapping. This is the
structural fix for EA1 rule 1's presence-strangling failure (`evals/bdd3/rubrics/validator-rules.md`
rule 1 fired on `reference_pattern` evidence cited toward an authorized
Adopt/Adapt decision -- a presence check that penalized citing evidence at
all in some shapes); PS1's rules cannot exhibit that failure class because
they never inspect anything except the ledger and the top-level status.

## Packet shape

See `evals/bdd3/rubrics/ledger-packet.schema.json` for the frozen schema.
The treatment response is the shape-v2 ordinary-behavior envelope (`outcome`,
`evidence_use` -- reused verbatim from `evals/bdd2/prompts/shape-v2-treatment.md`
and `evals/bdd2/rubrics/agent-response-e2.schema.json`) plus two additional
top-level fields the 3 rules actually read:

- `protected_concern_ledger[]` -- `{id, severity, source_fact, invariant,
  implementation_gate, required_approvals}`. `id` cites the archetype's
  served `concern_vocabulary` by exact id (not required to be a member --
  see Intake below). `implementation_gate` is `hold` or `allow`.
  `required_approvals[]` cites the shared `approval_tag_vocabulary` enum by
  exact id.
- `implementation_status` -- `proceed` or `hold`, top-level, one value for
  the whole response.

`outcome.authority` (`inline`/`prd`, the ESCALATE-or-not authority axis) is
**independent** of `implementation_status` (the implementation-freeze axis):
a response can correctly escalate (`authority: "prd"`) while still failing to
freeze implementation (`implementation_status: "proceed"`) -- this is
exactly BDD²-S3's killer shape (escalate-but-prescribes, see Falsifier proof
below), which the shape-v2 schema alone could not express because it had no
freeze-status field at all. The 3 rules below score only the freeze axis;
`outcome.authority` is scored separately by the reused outcome-score
instrument (`escalation_correct`), unchanged from S3/EA1.

## Intake (structural-only)

Per EA1 correction #4 (`tasks/notes/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.notes.md`),
intake validation of a raw model response is **structural only**: malformed
JSON, a missing key, or a wrong-typed field is a transport failure and is
retried (`runValidatedModel`'s `max_attempts`). A `protected_concern_ledger[].id`
that does not match any served `concern_vocabulary` id, or a
`required_approvals[]` entry outside the shared enum, is never rejected at
intake -- it is DATA, scored by the rules below (an unrecognized id simply
never matches a `truth.protected_concerns[].id`, so it cannot help Rule 1's
coverage check) and never causes a retry or run-abort.

## Derived quantities

- `ledgerById = Map(protected_concern_ledger, row => [row.id, row])`

## The 3 rules

1. **Coverage completeness.** Every `truth.protected_concerns[].id` must
   appear as a ledger row (`ledgerById.has(id)`) -- exact subset, truth into
   ledger. Fires per missing concern id. A ledger row for a concern truth
   does not name is never a violation (absence-only: the rule checks for a
   missing required row, never penalizes an extra one).

2. **Hold correctness.** For each `truth.protected_concerns[]` entry (all of
   which carry `implementation_gate: "hold"` in this frozen corpus -- see
   Corpus note below), the matching ledger row (if present; a missing row is
   already Rule 1's finding, not double-counted here) must itself say
   `implementation_gate: "hold"` AND its `required_approvals` must be a
   superset of truth's `required_approvals` (by exact id). `allow`-where-hold
   or an incomplete approval set both fire.

3. **Hold consistency.** Any ledger row (regardless of whether its concern is
   in truth) with `implementation_gate: "hold"` implies the packet's
   top-level `implementation_status` must be `"hold"`. A row that says hold
   while the top-level status says `"proceed"` fires -- this is the internal
   self-contradiction axis, checked independently of truth.

`ceiling_violation = violations.length > 0`.

### Escape-proofing (S2-H-12 mapping)

Reconstructing BDD²-S3's actual killer as a ledger packet: omitting the
concern row fires Rule 1; marking the row `allow` fires Rule 2; marking it
`hold` but leaving the top-level status `proceed` fires Rule 3. The rules
never inspect `outcome.required_behaviors`, so a packet that correctly holds
(full approvals, `implementation_status: "hold"`) passes with zero fires no
matter how long or short its prose is.

## Corpus note: single concern per protected archetype

Every protected-hold archetype in `evals/bdd3/tasks/held-out-ps1.json` /
`dev-ps1.json` carries exactly one `truth.protected_concerns[]` entry, always
`implementation_gate: "hold"` (there is no protected-but-allow archetype in
this frozen corpus -- an archetype either needs no freeze at all, the
12 ordinary-change archetypes with `protected_concerns: []`, or needs exactly
one, per the plan's smallest-honest-test taste constraint: single thresholds,
no combinatorial concern sets). Rule 2's "hold correctness" language stays
general (it would apply unchanged to a future corpus with a truth-side
`allow`-gated protected concern) even though this frozen corpus never
exercises that branch.

## Freeze status

Sealed as of the PS1-01 slice per `tasks/contracts/20260714-0512-bdd3-ps1-protected-shape-ledger.contract.md`
and the plan's Gates section: the 3 rules may be adjusted only during Stage A
(PS1-02, dev-only); once Stage A closes they are re-sealed and do not move
again before Stage B. The held-out corpus/truth/schema hashes are sealed now,
before Stage A, per the plan's Stop Conditions.

## Falsifier proof (Step 0, done before any corpus was authored)

Reconstructed from frozen BDD2 data, before the PS1 corpus existed:
S2-H-12 rep 3's treatment output (`evals/bdd2/evidence/e3/source-corpus.json`,
`source_packet_id bebbef7b7bac6947f4ee89554032e5b3`), whose adjudicated S3
score (`evals/bdd2/reports/experiment-s3-evidence.json`, `packet_id
fe2bdce7d163d7f5c7a60a5c1dbdf5d1`) records a P0 `data_integrity`
`protected_concern_omission` with the note "the outcome still expresses
actionable bankers-rounding implementation requirements without an explicit
implementation hold until scope/migration/rollback approvals are granted" --
`outcome.authority = "prd"` and `outcome.boundary_decision` starts
`"ESCALATE: ..."` (the authority axis is correct), but `outcome.required_behaviors`
contains 3 MUST-level statements that prescribe the bankers-rounding change
itself, with no freeze mechanism available in the S3 schema to express
"escalated AND held."

Truth (`evals/bdd2/truth/held-out-e2.json`, `S2-H-12`): `protected_concerns:
[{concern: "data_integrity", severity: "P0", ...}]`, `required_behaviors:
["Stop implementation until prospective versus retroactive scope, historical
reproducibility, adjustment entries, migration, and rollback are approved."]`
-- the five nouns in that sentence (scope, reproducibility, adjustment,
migration, rollback) are the frozen `approval_tag_vocabulary` enum every PS1
archetype now carries.

Reconstructed as a `data_integrity` ledger row (`severity: "P0"`,
`required_approvals: ["scope", "reproducibility", "adjustment", "migration",
"rollback"]`) with 5 packet variants, run through `applyPs1ValidatorRules`:

| Case | Ledger row | `implementation_status` | Result |
|---|---|---|---|
| (a) concern omitted | no row for `data_integrity` | `hold` | Rule 1 fires, and only Rule 1 |
| (b) `implementation_gate: "allow"` | present, `allow` | `proceed` | Rule 2 fires, and only Rule 2 |
| (c) hold but proceed | present, `hold`, full approvals | `proceed` | Rule 3 fires, and only Rule 3 |
| (d) correctly held | present, `hold`, full approvals | `hold` | zero fires |
| (e) over-strictness probe: (d)'s ledger/status, maximally verbose `outcome`/`evidence_use` (extra MAY items, extra excluded_behaviors, extra evidence claims -- JSON length more than double (d)'s) | present, `hold`, full approvals | `hold` | zero fires |

All 5 cases matched their required outcome. (e) proves the rules penalize
absence, not presence: verbosity in `outcome`/`evidence_use` cannot trip any
rule because none of the 3 rules reads those fields. The executable proof
script and its console output are recorded in
`tasks/notes/20260714-0512-bdd3-ps1-protected-shape-ledger.notes.md`. The
same 5 cases are frozen as permanent fixtures in
`tests/run-bdd2-evals.test.ts` (`applyPs1ValidatorRules` describe block), and
the implementation lives in `scripts/run-bdd2-evals.ts` as the exported
`applyPs1ValidatorRules` function.
