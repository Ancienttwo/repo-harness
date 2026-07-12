# BDD² Phase E Gate Decision

> **Decision date**: 2026-07-12
> **Protocol authority**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
> **Shape evidence**: `evals/bdd2/reports/experiment-s.md`
> **Audit evidence**: `evals/bdd2/reports/experiment-a.md`
> **Phase P authorization**: Not approved

## Decision

| Hypothesis | Decision | Evidence-backed reason | Authorized next state |
|---|---|---|---|
| Shape / Behavior Card | **Reshape** | The treatment passed six gates and materially reduced unsupported expansion, but created one unnecessary tracked artifact. The frozen run also lacks human adjudication, reviewer overlap, truth-aware scoring at decision time, and a fully isolated reviewer boundary. | A new Shape evaluation revision may redesign the protocol and rerun. No public Shape product surface is authorized. |
| Behavior audit | **Kill** | Treatment precision was 35.3%, clean false positives 25%, correct no-findings 75%, and two P0/P1 underestimations occurred. Four pre-registered gates failed. | Do not productize the current audit treatment or integrate it into `/check`. Any future proposal starts as a new hypothesis, not a continuation of this authority. |
| Browser Evidence Adapter | **Defer** | Experiment E was gated on both Shape and Audit passing. They did not, so no Browser comparison ran and no efficacy claim exists. | Retain Browser evidence as an important unverified adapter hypothesis. It may be evaluated only under a new approved protocol with a named pattern uncertainty. |
| ImageGen Prototype Adapter | **Defer** | Experiment E was gated on both Shape and Audit passing. It did not run, so synthetic-evidence labeling and uncertainty-closure value remain unverified. | Retain ImageGen as an important unverified adapter hypothesis. It may be evaluated only under a new approved protocol with a named interaction uncertainty. |
| Implementation pilot | **Defer** | Experiment I required separate Shape and Audit passes. The prerequisite failed, so comparing baseline, Shape, and Shape+Audit would violate the frozen stop rule. | No implementation pilot or Phase P product code is authorized. |

## Phase Decision

Phase E is complete for the approved protocol. The current productization proposal is
**stopped**: no hypothesis produced the required core pass combination, so Phase P
cannot start. This is not a conclusion that Browser references, ImageGen prototypes,
or lightweight behavior shaping have no product value. It is a conclusion that the
current evidence does not authorize turning them into a public skill, catalog, CLI,
MCP tool, hook, lifecycle, sidecar, or `/check` integration.

E-04 and E-05 are resolved as gated-not-run, not silently omitted. Their `Defer`
decisions preserve the hypotheses without laundering missing evidence into a pass or
misreporting a prerequisite stop as a negative experiment result.

## Evidence Summary

- Shape: 72/72 outputs and scores; decision `Reshape`; one tracked-artifact gate
  failed and the Agent-panel protocol has material causal/evidence limitations.
- Audit: 48/48 outputs and scores; decision `Kill`; precision, clean-FP,
  no-findings, and severe-underestimation gates failed.
- Browser/ImageGen: 0 runs by design because S/A did not both pass.
- Implementation pilot: 0 runs by design because S/A did not both pass.
- No thresholds were changed after reveal and no failed gate was manually overridden.

## Allowed Follow-up

The only evidence-backed follow-up is a separately approved evaluation revision.
It must name the exact hypothesis being reshaped, freeze new authority, and preserve
the current reports as historical results. Product implementation is not an allowed
follow-up from this gate.

