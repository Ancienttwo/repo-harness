> **Archived**: 2026-08-09 05:50
> **Related Plan**: plans/archive/plan-20260809-0327-axr7-consumer-e2e-adoption-dogfood.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260809-0550

# Implementation Notes: axr7-consumer-e2e-adoption-dogfood

> **Status**: Active
> **Plan**: plans/plan-20260809-0327-axr7-consumer-e2e-adoption-dogfood.md
> **Contract**: tasks/contracts/20260809-0327-axr7-consumer-e2e-adoption-dogfood.contract.md
> **Review**: tasks/reviews/20260809-0327-axr7-consumer-e2e-adoption-dogfood.review.md
> **Last Updated**: 2026-08-09 05:03
> **Lifecycle**: notes

## Design Decisions

- ArchContext model mutations used the reviewed one-way helper and daemon ChangeSets only. No `.archcontext` entity was written directly.
- P1/P2 output is Mermaid source only: one `flowchart` and one `sequenceDiagram` per capability. The legacy standalone HTML architecture artifact was retired. The external `mermaid` skill remains an authoring/review surface; `@mermaid-js/mermaid-cli@11.16.0` is the exact dev validator, not a production dependency or vendored skill body.
- repo-harness self-hosting enables `projection_provider=archctx` and `projection_apply=automatic` with advisory failure/freshness gates. Registry publication and strict gates remain AXR8.
- Projection readiness aggregates provider state, pending/running/dead-letter counts, adoption/human-action receipts, and request-card freshness in `check-architecture-sync`.
- The full CLI hook fallback now reads host stdin exactly like the bundled `repo-harness-hook`; otherwise a missing bundle silently dropped PostToolUse paths and produced no projection job.

## Deviations From Plan Or Spec

- Producer baseline advanced from `2173613` through the model/adoption/layout fixes to `cb2c135`. The final fix excludes projection-owned outputs from `sourceTreeDigest`; the former test claimed this invariant but did not actually declare `docs/architecture/**` in the source footprint.
- Existing main already selected `context.capability_source=archcontext`; AXR7 preserved this single authority instead of performing a second cutover.
- repo-harness remains `0.13.2` in AXR7 packed proof. AXR8 owns the `0.14.0` version bump and registry publication.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add the HTML-first `architecture` skill as a package dependency | Reject | User requires Mermaid source and no HTML; skills are external authoring policy, not runtime semantics. |
| Keep relation/flow YAML ignored | Reject | A consumer clone would lose required semantic authority. `.gitignore` now tracks nodes, relations, and flows together. |
| Accept a two-pass projection fixed point | Reject | Stop must finish with a byte-stable second apply; generated docs cannot feed their own source digest. |

## Open Questions

- None. The only intentionally incomplete state is registry/provider availability, owned by AXR8.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Producer revisions: `cdccc08` (reviewed model helper), `38b7abe` (dark/light Mermaid sequence theme), `cb2c135` (projection-owned output exclusion).
- Model proposal digests: `sha256:9ffab548...` (initial), `sha256:0e2497...` (flow repair), `sha256:8d46729...` (bootstrap cleanup), `sha256:076c338...` (selector repair). Full typed proposals are the four task-local JSON artifacts beside this file.
- Adoption: plan `adoption_plan.22fa132ccd1ed6a9f0c7a6b69fd2c8d23d4f1d746dd3fd597125c08e45ef41f7`; adoption receipt `sha256:0db60e71...`; final projection/no-op fixed-point receipt `sha256:6db36ecf2ff59933dab8d3064de88503cea9010fd9682ff12846b8dbd567f5b2`.
- Mermaid: 23/23 sources rendered by `mmdc@11.16.0`; representative P1/P2 renders visually inspected; architecture HTML artifact count is zero.
- Packed packages: `archctx-contracts@0.4.0` integrity `sha512-tZSDY57RhN1MYoydgyjdgAcXZ1VI48N5QTg5kopG2tfVrMlrqXvxitVzR/ZsfRs/Vk+I7L6lH5eeIiHzUFlgKQ==`; `archctx@0.4.0` integrity `sha512-E8F/Q+IY9wuwT7EvtauV72xFPuAK3p5JH73+9OXFz/pXJSeaGBD0WCcpT/N88UfBfNgGRSqbRzHP8ye1d23CiA==`; repo-harness `0.13.2` integrity `sha512-H2KpDsKQhv2uEa147VojPf6/WLwrUSFWHtBvqOhjo91HmQrXXLw1V7A8PkP+pK2cWW0tBTDWwmxXc9KGCqXqsw==`.
- Clean Stop job `job-9ffc031b503fa7d93e3950be`, receipt `sha256:77e5fbc54cefb374b34bd703845342b92ec572d5022bf284c01a893b1554e9f3` (`noop`); single-capability job `job-a7a71ec94f1c72f52a1071ac`, receipt `sha256:3f0112442f5570c7961b11fc2da7a550632b948458dd3e1099aa4cbfe68ce02c` (`applied`); multi-capability job `job-4d96f70bfccb93e7c20a9c4e`, receipt `sha256:0e931e670dca6d94058b2e857dcf7fe19f0c1740d6e96724627cee4f4efc7b12` (`applied`). Every immediate rerun was `noop`, 0 files, 0 human actions, byte-identical.
- Full CI first pass reached 2,311 pass / 1 skip and exposed two consumer regressions: a self-host policy-coupled status test and adoption loss of the skill-eval authority paragraph. The status test now uses an isolated explicit policy fixture; the authority paragraph lives in the marker-external P3 appendix and survives subsequent projection. Both focused regressions pass 24/24. The complete rerun passed 2,313 / 1 skipped / 0 failed, including typecheck, projection parity, workflow gates, repository inspection and packed tarball smoke.
- Packed resolution readback: all three package roots were inside the disposable consumer; sibling checkout resolution was false.
- Request cards `workflow-engine-contract-assets` and `root` were archived as Resolved against their durable architecture modules.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
