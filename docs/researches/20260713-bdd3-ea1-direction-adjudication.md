# BDD3-EA1 Direction Adjudication

> **Decision date**: 2026-07-13
> **Method**: Dual-track adjudication (external cross-model review + independent internal file-verified cross-check)
> **Prior state**: `docs/researches/20260713-bdd2-phase-e-closeout.md` (BDD² Phase E terminal closeout, all treatments Kill)
> **Approved package**: `plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md` (BDD3-EA1, eval-only)
> **Phase P**: Not approved; unchanged by this adjudication

## Conclusion

After the BDD² Phase E terminal Kill decisions, exactly one new eval-only
work-package is worth opening: BDD3-EA1, Typed Browser Evidence Authority.
Everything else that could be read as "reviving" BDD² either stays dead
(general ImageGen preference/trust) or stays deferred behind EA1's outcome
(BDD3-PS1, BDD3-VH1, I3, Phase P). The adjudication changed EA1's shape, not
just its approval: a ties diagnosis of EB3's frozen evidence found zero
convertible ties, which moved EA1's primary endpoint from closure wins to
authority-violation safety.

## Question Adjudicated

Browser evidence and image generation are no longer bespoke product
surfaces; both are now plain host tool calls available in the coding agent
itself (Chrome MCP for browser control, built-in image generation). Given
that, is anything from the killed BDD² Browser Evidence Adapter or ImageGen
Prototype Adapter worth reviving, and if so, as what kind of intervention?

## Dual-Track Method

An external cross-model review and an independent internal analysis ran in
parallel and converged on the same direction. Eight load-bearing claims from
the external review were checked against frozen repo artifacts (evidence
JSON, gate specs, corpus manifests) rather than accepted at face value:
seven were confirmed as direct reads of the frozen data, and one — the EB3
sole-kill-trigger attribution recorded in
`docs/researches/20260713-bdd2-phase-e-closeout.md` — was confirmed as a
correct *inference* from the frozen EB3/EI3 gate trigger list
(`evals/bdd2/metrics/phase-e3-scoring-metrics.md:22-29`) rather than a
value restated verbatim from a report. That distinction is why the closeout
doc labels it an inference instead of a quoted gate output.

## Core Reframe

Neither Browser evidence capture nor image generation is itself a product
gap: both are host capability, present in Claude Code and Codex today. The
only candidate product value left in the killed BDD² line is a thin typed
evidence *authority* layer sitting on top of that host capability — a
contract of the shape evidence type -> maximum closure authority -> claim
source -> fail-closed validation. This is a governance layer, not a new
capability adapter. The killed Browser Evidence Adapter and ImageGen
Prototype Adapter stay dead: no provider adapter, no browser catalog, no
CLI/MCP/Skill surface is reopened by this adjudication.

## Ties Diagnosis

EB3 closed 5 wins / 0 losses / 7 ties across 12 pairs
(`evals/bdd2/reports/experiment-eb3-evidence.json`, `summary.metrics`), and
missed the >=6-win Pass threshold by exactly one. Re-reading the frozen
per-pair rows shows why that threshold was never reachable: the closure
win/tie axis is the `uncertainty_closed` flip between control and treatment.
All 5 wins are pairs where control failed to close and treatment did. In
all 7 ties, control had *already* closed — so there is no headroom to
convert a tie into a win; 0 of 7 ties are convertible under the closure-flip
metric. A `>=6` net-wins bar is structurally unreachable against a control
this strong, independent of any treatment quality.

The 7 ties split into two classes on inspection of the underlying reviewer
scores:

- **3 boundary-completeness gaps** — `EB-H-02` r1/r2 and `EB-H-04` r1, each
  carrying a nonzero `required_behavior_omission` and/or an unaddressed
  protected-concern item in the frozen reviewer scores. `EB-H-04` r1 is the
  kill row itself: the same packet whose treatment output asserted the
  unapproved one-retry policy that failed evidence compliance.
- **4 grader disposition-label artifacts** — `EB-H-01` r1/r2, `EB-H-05` r2,
  `EB-H-06` r1, where both reviewers already scored the pair fully closed
  with zero omissions; the tie reflects agreement, not a gap.

Consequence for EA1: a net-closure-wins endpoint would re-run into the same
structurally unreachable bar. EA1's safety endpoint (authority violations —
`feature_need_inference_count`, unsupported policy/number/duration/retry
assertions, `ceiling_violation`) is therefore PRIMARY. The efficacy endpoint
is redefined as non-degradation of closure plus boundary completeness plus
authority-trap honesty, not net closure wins.

## Decisions

- **BDD3-EA1 Typed Browser Evidence Authority — approved.** The single new
  eval-only work-package this adjudication authorizes. Captured as
  `plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md`
  (Status: Approved, Artifact Level: work-package). Execution starts only on
  a separate, explicit owner order.
- **BDD3-PS1 Protected Shape — deferred behind EA1.** A protected-concern
  ledger exempt from compression, paired with a coverage validator. Held
  back so BDD3 sequences one bet at a time; revisits only after EA1 reaches
  its gate report.
- **General ImageGen preference/trust thesis — terminated.** EI3 closed
  net-negative (1 win / 3 losses / 8 ties) plus an unevidenced user-value
  claim (`user_evidence_claim`) that triggered an unconditional Kill. Unlike
  Browser, nothing in the ImageGen line survives as a governance-layer
  candidate; this thesis does not reopen.
- **BDD3-VH1 fixed-boundary visual-hierarchy micro-test — conditional.**
  ImageGen variants vs. a structured text wireframe, measured on downstream
  implementation-correction rate. Gated on an actually observed
  visual-hierarchy rework pain in real work, not a calendar date or a
  speculative use case.
- **I3 and Phase P — remain gated.** Unchanged from the Phase E closeout:
  both stay behind `S3=Pass AND (EB3=Pass OR EI3=Pass)` on a *new*
  work-package's outcome, not behind any rescoring of the killed S3/EB3/EI3
  treatments.

## Design Constraint Recorded

EA1 is scoped as the smallest honest test of the reframed thesis, not the
largest plausible one: single thresholds with no alternative/fallback gates,
a validator expressed as 6 deterministic rules (a checklist, not a
framework), and maximal reuse of `scripts/run-bdd2-evals.ts` as a direct
schema cut rather than a new runner. The only place EA1 spends more than
BDD2 did is corpus size — 24 unique archetypes instead of EB3's 6 — because
the ties diagnosis above shows that is precisely where EB3 was
under-powered; every other surface stays minimal by construction.

## Reproducible Evidence

- Prior closeout: `docs/researches/20260713-bdd2-phase-e-closeout.md`
- Approved EA1 plan: `plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md`
- EB3/EI3 gate ladder: `evals/bdd2/metrics/phase-e3-scoring-metrics.md:22-29`
- EB3 frozen evidence and per-pair rows: `evals/bdd2/reports/experiment-eb3-evidence.json`
- EI3 frozen evidence: `evals/bdd2/reports/experiment-ei3-evidence.json`
- Terminal gate: `evals/bdd2/reports/phase-e3-gate.md`
- Deferred-goal ledger: `tasks/todos.md`
