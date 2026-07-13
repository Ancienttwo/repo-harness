# BDD² Phase E Terminal Closeout

> **Decision date**: 2026-07-13
> **Merged**: PR #66, commit `0cf69cf` ("eval: close BDD2 Phase E with terminal E3 authority (#66)")
> **Terminal gate**: `evals/bdd2/reports/phase-e3-gate.md`
> **Review record**: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
> **Phase P**: Not approved

## Conclusion

BDD² Phase E is closed. All three E3-scored treatments — inline Shape, the
Browser Evidence Adapter, and the ImageGen Prototype Adapter — are killed as
product candidates. The Implementation Pilot (I3) stayed gated-not-run
because its prerequisite failed, and Phase P productization is not approved.
Captured screenshots, prototypes, and evaluation appendices remain as
historical evidence; they authorize no Skill, CLI, MCP tool, catalog,
sidecar, lifecycle, linter, or other Phase P surface. Reviving BDD² requires
a new product thesis and a new intervention in a new eval-only work-package,
not another scoring revision of the current treatments.

## What Phase E Tested

Phase E ran a chain from frozen source material to a terminal product
decision:

1. **120-item frozen source corpus** — E3 reused E2's Agent outputs
   byte-for-byte (72 Shape rows + 24 Browser rows + 24 ImageGen rows),
   verified against the `full_response_sha256`/`normalized_outcome_sha256`
   recorded at E2 seal time. No treatment Agent was rerun in E3; only the
   scoring authority changed. Source: `evals/bdd2/evidence/e3/source-corpus.json`,
   bound in `evals/bdd2/evaluation-manifest.json`.
2. **Independent scoring + adjudication** — two condition-blind primary
   reviewers scored every row; a canonical (byte-equal after recursive
   key-sort) disagreement triggered exactly one frozen adjudicator score,
   replacing E2's unfrozen conservative-union algorithm that had invalidated
   the E2 gate. Agreement forbade adjudication. Source:
   `evals/bdd2/metrics/phase-e3-scoring-metrics.md`.
3. **Repeatable evidence projection** — each experiment's scores, pairing,
   and decision are captured in a tracked JSON projection reproducible from
   a clean checkout via `bun scripts/run-bdd2-evals.ts verify-evidence`.
   Source: `evals/bdd2/reports/experiment-s3-evidence.json`,
   `experiment-eb3-evidence.json`, `experiment-ei3-evidence.json`.
4. **S3 / EB3 / EI3 verdicts** — the frozen gate rules (also in
   `phase-e3-scoring-metrics.md`) converted the projected scores into
   Pass/Reshape/Kill for each experiment.
5. **Phase P gate** — I3 (the implementation pilot) requires `S3=Pass AND
   (EB3=Pass OR EI3=Pass)`; Phase P productization requires I3=Pass plus a
   separate owner decision on top of that.

## Terminal Decisions

| Hypothesis | Execution | Decision |
|---|---:|---|
| S3 — Inline Shape | 72 reused outputs, 144 fresh outcome scores | Kill |
| EB3 — Browser Evidence Adapter | 24 reused outputs, 48 outcome + 12 evidence scores | Kill |
| EI3 — ImageGen Prototype Adapter | 24 reused outputs, 48 outcome + 12 evidence scores | Kill |
| I3 — Implementation Pilot | 0/4, gated-not-run | Defer |
| Phase P productization | — | Not approved |
| Current Behavior Audit | unchanged since Phase E | Kill (out of E3 scope) |

Source: `evals/bdd2/reports/phase-e3-gate.md`.

## Why Each Treatment Died

### S3 — Inline Shape (Kill)

Aggregate signal looked favorable: unsupported expansion fell 50%
(control 2 → treatment 1), paired wins beat losses 1–0 across 36 pairs (35
ties), and required omissions fell (23 → 21). But the same pairing produced
**4 pairs with a new P0/P1 protected-concern omission**
(`new_severe_pairs: 4`). The S3 gate kills on "any new P0/P1 omission"
independent of every other metric — a hard-kill the 50% unsupported-expansion
improvement cannot override. Source: `evals/bdd2/metrics/phase-e3-scoring-metrics.md`
(S3 gate), `evals/bdd2/reports/experiment-s3-evidence.json` (`summary.metrics`),
`evals/bdd2/reports/experiment-s3.md`.

### EB3 — Browser Evidence Adapter (Kill)

Closure was 5 wins / 0 losses / 7 ties across 12 pairs — zero losses, but the
Pass threshold requires at least 6 closure wins, so EB3 missed it by exactly
one. Independently, evidence compliance failed (`evidence_compliance: false`):
treatment output EB-H-04 asserted an unapproved one-retry policy and inferred
a feature need directly from a screenshot. The EB gate kills outright on any
screenshot-derived feature-need claim, regardless of the win/loss count — an
evidence-compliance hard-kill. Source: `evals/bdd2/metrics/browser-adapter-metrics.md`
(EB gate), `evals/bdd2/reports/experiment-eb3-evidence.json` (`summary.metrics`),
`evals/bdd2/reports/experiment-eb3.md`.

### EI3 — ImageGen Prototype Adapter (Kill)

Closure was net-negative: 1 win / 3 losses / 8 ties, well short of the
6-win Pass threshold. Evidence compliance also failed: treatment output
EI-H-01 asserted a "lower-friction" user-value claim with no user evidence
behind it, which the EI gate treats as an unconditional kill trigger
(`user_evidence_claim`). The two frozen non-closable synthetic
preference/trust tasks correctly stayed unclosed in both repetitions.
Source: `evals/bdd2/metrics/imagegen-adapter-metrics.md` (EI gate),
`evals/bdd2/reports/experiment-ei3-evidence.json` (`summary.metrics`),
`evals/bdd2/reports/experiment-ei3.md`.

### I3 — Implementation Pilot (Defer, gated-not-run)

I3 requires `S3=Pass AND (EB3=Pass OR EI3=Pass)`. All three immutable E3
decisions are Kill, so the prerequisite closed before any fixture workspace
was materialized: 0 of 4 planned outputs were generated. Source:
`evals/bdd2/reports/experiment-i3.md`, `evals/bdd2/metrics/phase-e3-scoring-metrics.md`
(I3 gate).

### Phase P (Not approved)

Phase P productization sits behind I3=Pass plus a separate owner decision.
Since I3 never ran, Phase P has no authorizing evidence. Source:
`evals/bdd2/reports/phase-e3-gate.md`.

## Revival Condition

Per the E3 review record's residual-risk note, no active follow-up belongs
to this closed Sprint: "A future BDD² attempt requires a new product thesis
and new intervention, not another scoring revision." Reviving BDD² requires
the owner to state a new product thesis and open a new eval-only
work-package with a new intervention. I3 and Phase P stay gated behind that
new work-package; they do not reopen from a rescoring of the already-killed
Shape/Browser/ImageGen treatments. Source:
`tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
(Residual Risks / Follow-ups).

## Out of Approved Scope

The terminal gate explicitly excludes, and this closeout does not reopen: a
public Behavior Brief/Shape catalog, a sidecar, a lifecycle state machine, a
generic counting linter, Current Behavior Audit integration (already Kill
since Phase E and unchanged), any CLI or MCP tool surface, and Phase P
itself. Captured Browser screenshots and ImageGen prototype assets remain
retained as historical evaluation evidence only; they do not justify any of
the above. Source: `evals/bdd2/reports/phase-e3-gate.md`,
`evals/bdd2/reports/phase-e-gate.md`.

## Reproducible Evidence

- Terminal gate: `evals/bdd2/reports/phase-e3-gate.md`
- Review record: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
- Plan: `plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md`
- Evaluation manifest / corpus binding: `evals/bdd2/evaluation-manifest.json`,
  `evals/bdd2/evidence/e3/source-corpus.json`
- Gate specs: `evals/bdd2/metrics/phase-e3-scoring-metrics.md`
- Evidence projections: `evals/bdd2/reports/experiment-s3-evidence.json`,
  `experiment-eb3-evidence.json`, `experiment-ei3-evidence.json`
- Decision reports: `evals/bdd2/reports/experiment-s3.md`, `experiment-eb3.md`,
  `experiment-ei3.md`, `experiment-i3.md`
- Runner: `bun scripts/run-bdd2-evals.ts validate` (120 corpus rows) and
  `bun scripts/run-bdd2-evals.ts verify-evidence` (S3/EB3/EI3 reproduce
  Kill/Kill/Kill)
- Merge: PR #66, commit `0cf69cf`
