# Plan: BDD2 Phase E2 Shape and Adapter Evaluation

> **Status**: Archived
> **Created**: 20260712-2319
> **Slug**: bdd2-phase-e2-shape-adapter-evaluation
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: evaluation-revision
> **Source Ref**: evals/bdd2/reports/phase-e-gate.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Freeze and validate independent S2, Browser, ImageGen, and conditional page-pilot evidence before any Phase P proposal.
> **Rollback Surface**: Before execution archive or remove the Draft plan; after execution revert the E2 evaluation PR and delete ignored E2 run evidence.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md`
> **Task Review**: `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md`
> **Implementation Notes**: `tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md`

## Agentic Routing
- Selected route: product-discovery-evaluation
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: evals/bdd2/reports/phase-e-gate.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md`
- Expected task contract after approval: `tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md`
- Expected task review after approval: `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md`
- Implementation notes: `tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Adapter output reveals treatment identity | High | Reviewer bias can manufacture an efficacy result | Split normalized outcome scoring from evidence-compliance scoring and disclose residual inferability |
| External Browser/ImageGen output cannot be regenerated exactly | High | Later summaries cannot prove what evidence the agent actually saw | Capture before seal, content-hash raw assets, and reproduce reports from captured evidence rather than provider reruns |
| Pilot coordinates share filesystem state | Medium | One implementation contaminates the next | Materialize a fresh content-hashed fixture workspace for every I2 coordinate |

## Task Contracts
- Contract file: `tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md`
- Review file: `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md`
- Implementation notes file: `tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md --strict`
- Active plan rule: owner approval and `plan-to-todo` established the active plan and
  worktree markers; this plan is now the execution authority.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution archive or remove the Draft plan; after execution revert the E2 evaluation PR and delete ignored E2 run evidence.
- **Verification boundary**: Freeze and validate independent S2, Browser, ImageGen, and conditional page-pilot evidence before any Phase P proposal.
- **Review/acceptance boundary**: `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md`, `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md`, and `tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution archive or remove the Draft plan; after execution revert the E2 evaluation PR and delete ignored E2 run evidence.

## Captured Planning Output

## Objective

Run a separately authorized BDD² Phase E2 that answers the three unresolved
hypotheses: whether an inline-only Behavior Card retains Shape's benefit, whether a
Browser reference closes a named pattern uncertainty, and whether an ImageGen
prototype closes a named interaction uncertainty. Only after those gates may one
small page-feature implementation pilot run. Phase P remains unauthorized.

## P1 / P2 / P3

- **P1 architecture map**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
  owns the original product thesis; `evals/bdd2/reports/phase-e-gate.md` owns the
  completed Phase E decision; a new approved Phase E2 authority revision will own
  prompts, unseen tasks, truth, scoring, providers, model/runtime coordinates, and
  gates; ignored `.ai/harness/runs/bdd2/` owns raw evidence; tracked E2 reports own
  durable claims. Product skills, CLI/MCP, hooks, catalogs, sidecars, and `/check`
  remain outside this boundary.
- **P2 concrete trace**: named page uncertainty -> pre-seal Browser/ImageGen capture
  -> content-hashed adapter artifact -> frozen baseline or inline Shape packet ->
  model-transport-only isolated agent output -> normalized outcome score plus separate evidence
  compliance score -> private condition reveal -> independent hypothesis decision ->
  only `Shape=Pass AND at least one adapter=Pass` may open one implementation pilot
  -> pilot evidence may propose, but does not automatically approve, a minimal Phase
  P slice.
- **P3 decision**: replace the old `Shape AND Audit` prerequisite with independent
  gates. The killed Audit treatment is excluded rather than renamed. The first 10x
  failure is an expensive benchmark that repeatedly blocks useful adapters or
  launders synthetic/reference material into requirement authority; separate gates,
  immutable revisions, unseen fixtures, provenance rules, and human adjudication at
  decision conflicts protect that invariant.

## Frozen Product Decisions

1. **Inline Shape only**: the treatment may return one compact Behavior Card inside
   chat, an active plan, or a task contract. It must not create a tracked Behavior
   Card/Brief, catalog entry, JSON sidecar, lifecycle state, or new command surface.
2. **Audit stays killed**: do not execute, tune, rename, or integrate the Phase E
   Behavior Audit treatment. A future audit proposal must be a new hypothesis in a
   separate plan.
3. **Adapters are independent evidence hypotheses**: Browser and ImageGen each answer
   one pre-named uncertainty and receive separate decisions. Neither depends on
   Audit, and they are not required to pass together.
4. **Evidence is not authority**: a screenshot can prove an observed pattern exists,
   not that this product needs it. An ImageGen output is synthetic stimulus, not user
   evidence or validation.
5. **No Phase P by implication**: passing evaluation authorizes only an owner review
   of the smallest passed combination. It does not authorize public product code.

## Evaluation Revision

Before any held-out run, freeze a new manifest revision with:

- exact source commit, model/version/effort, system prompt, environment allowlist,
  stdin-only isolated workspace, randomness/repetition policy, and provider identity;
- new development and held-out fixtures not used in Phase E agent or reviewer runs;
- deterministic normalized outcome packets that exclude private truth,
  provider/treatment labels, URLs, asset references, evidence appendices, and sibling
  outputs;
- separate score authorities and decision functions for Shape, Browser, ImageGen,
  and the conditional pilot;
- hashes for all prompts, tasks, truth, rubrics, schemas, and metric definitions;
- no reader or compatibility fallback for the retired Phase E manifest schema.

Phase E reports remain byte-preserved historical evidence. E2 uses new report and run
IDs and never rewrites Phase E decisions.

## Adapter Acquisition and Adjudication Boundary

The existing runner is hard-coded to `S` and `A`, two prompt conditions, one response
packet, and one locked score. E2 therefore makes a direct schema cut to `S2`, `EB`,
`EI`, and `I2`; it does not add aliases or fall back to the Phase E manifest.

Browser and ImageGen providers do not run inside the evaluated Agent subprocess. For
each eligible held-out task, provider acquisition happens once before the authority is
sealed. The provider receives only the named uncertainty and public task context, never
private truth or expected decisions. Raw provider output remains ignored run evidence;
the selected redacted/compressed evaluation asset and appendix are tracked under
`evals/bdd2/evidence/` so a clean checkout can validate the exact evidence seen:

```text
named uncertainty
  -> provider capability preflight
  -> Browser capture or ImageGen generation
  -> privacy/synthetic-evidence review
  -> raw asset + metadata + content hash in ignored run evidence
  -> frozen task-specific adapter appendix
  -> model-transport-only Agent evaluation coordinates
```

This tests whether captured evidence improves the decision. The remote model transport
remains necessary; the frozen Agent profile disables browser, web-search, MCP, and
other external tools, exposes no provider credentials, and runs in an isolated
temporary workspace. This is a model-transport-only boundary, not an OS-level network
sandbox. Autonomous provider selection and live tool orchestration remain Phase P
questions.

Adapter presence is inherently inferable from screenshots, prototypes, citations,
and response style, so E2 must not claim complete treatment blindness. Scoring is
split into two independently locked layers:

1. **Outcome scoring** receives a deterministic projection containing only the task
   and final behavior boundary/decision. It excludes evidence sections, provider
   names, URLs, image references, and provenance fields. Two independent truth-aware
   reviewers score uncertainty closure, required/unsupported behavior, protected
   concerns, and correction cost while condition labels remain private.
2. **Evidence-compliance scoring** receives the full task-specific adapter appendix
   and raw-asset hashes. It checks provenance, privacy, question binding,
   `Adopt / Adapt / Avoid`, synthetic labeling, falsifiers, and unsupported claims;
   it does not score whether the final product decision is preferable.

Every schema-defined disagreement between the two outcome reviewers requires owner
adjudication while the condition and pair mapping remain private. Gate impact and
distance cannot be known honestly before reveal, so they are never used to select
which disagreements receive human review. After reveal all primary and adjudicated
scores are immutable; any unresolved ambiguity produces `Inconclusive`/`Reshape`, not
a score edit. Reviewer IDs, overlap, pre-adjudication disagreement, adjudication
reason, and the residual treatment-inference limitation are recorded in the report.
The normalized projection is produced deterministically from a structured response
schema, never by an LLM rewrite, and both projection and full response are hashed.

## Experiment S2 — Inline Shape Reshape

Use `12 new held-out tasks × 2 conditions × 3 repetitions = 72 outputs`:

- S2-0: current lightweight repo-harness planning prompt;
- S2-1: the same prompt plus the inline-only Behavior Card treatment.

Score the final proposed behavior, not template completeness. Preserve the Phase E
semantic exposure inventory and require all of the following:

- unsupported-expansion count improves at least 30%, with paired wins > losses;
- required-behavior omission does not increase and no stable new treatment omission
  appears;
- zero new P0/P1 protected-concern omissions;
- zero treatment-created tracked behavior artifacts;
- median deterministic correction-cost points do not increase;
- at least 10 of 12 treatment tasks have two or more of their three adjudicated
  outputs with `authority_fit=inline`, `escalation_correct=true`, and
  `unnecessary_tracked_artifact_count=0`.

Any core or protected-concern failure yields `Reshape` or `Kill`; it cannot be
overridden to Pass by aggregate style preference.

For proposal experiments, reviewers do not guess free-form minutes. They select
correction operations from a frozen taxonomy; the runner deterministically computes
`correction_cost_points` from the pre-registered operation table. S2 gates compare the
median points. Actual elapsed correction minutes are measured only in I2's bounded
human correction pass.

## Experiment EB — Browser Evidence Adapter

Use `6 new pattern-uncertainty tasks × 2 conditions × 2 repetitions = 24 decisions`:

- EB-0: frozen inline Shape without Browser evidence;
- EB-1: the same Shape packet plus one capability-matched Browser Evidence Adapter
  result. Chrome MCP is the first provider when available, but the authority freezes
  the provider actually used.

Every EB-1 packet must record the named uncertainty, source URL, title, capture time,
viewport/region, privacy review, observed pattern, `Adopt / Adapt / Avoid`, applicability
constraints, supported claim, and unsupported claim. Pass requires:

- uncertainty-closure paired wins >= 6 of 12 and losses <= 2;
- pre-adjudication uncertainty-closure disagreement rate, defined as the fraction of
  outputs where the two reviewers differ on `uncertainty_closed`, is lower than EB-0
  when EB-0 is nonzero; equal zero is accepted when both conditions are zero;
- unsupported user concepts and decisions do not increase;
- 100% provenance, question binding, and privacy-review compliance;
- zero feature-need claims inferred solely from a competitor screenshot;
- zero new P0/P1 protected-concern omissions.

## Experiment EI — ImageGen Prototype Adapter

Use `6 new interaction-uncertainty tasks × 2 conditions × 2 repetitions = 24 decisions`:

- EI-0: frozen inline Shape without a generated prototype;
- EI-1: the same Shape packet plus 2–3 low-fidelity ImageGen directions generated
  from the same behavior boundary.

Every EI-1 direction must state its hypothesis, decisions removed, concepts added,
backstage state hidden, recovery/trust information retained, and falsifier. It must be
marked synthetic. Pass requires:

- uncertainty-closure paired wins >= 6 of 12 and losses <= 2;
- pre-adjudication uncertainty-closure disagreement rate, defined as the fraction of
  outputs where the two reviewers differ on `uncertainty_closed`, is lower than EI-0
  when EI-0 is nonzero; equal zero is accepted when both conditions are zero;
- unsupported user concepts and decisions do not increase;
- 100% synthetic-evidence labeling and falsifier coverage;
- zero claims that generated output proves user value, preference, or usability;
- zero new P0/P1 protected-concern omissions.

EB and EI may execute after the common E2 authority and inline treatment are frozen;
they do not wait for each other's result or for Behavior Audit.

## Experiment I2 — Conditional Page-feature Pilot

Run only when S2 passes and at least one of EB/EI passes. Select one real, bounded,
reversible page feature with one primary actor, no new role, no payment/auth migration,
and acceptance tests that can run in an isolated fixture or dedicated worktree.

Use `1 real page feature × 2 conditions × 2 repetitions = 4 implementation outputs`
from the same clean source commit. The authority includes a content-hashed fixture
workspace and acceptance command; the runner materializes a fresh copy for every
coordinate and captures its patch, tests, command results, and semantic surface
inventory:

- I2-0: normal repo-harness implementation workflow;
- I2-1: inline Shape plus only the adapter(s) that passed.

The pilot passes only if I2-1 has no baseline-absent serious acceptance failure, no
required/protected regression, no unnecessary tracked artifact, and lower unsupported
surface or lower human correction cost without worsening the other. Record functional
acceptance, semantic surface delta, correction minutes, and files/lines removed during
the bounded correction pass immediately following each run (`not_applicable` when no
correction is needed). Do not claim knowledge of future deletion. This pilot is a
bounded proof, not a non-inferiority claim.

If both EB and EI pass, I2-1 may use both as one approved bundle. The I2 report may
claim only bundle-level feasibility; four outputs cannot attribute the effect to
Browser versus ImageGen separately.

## Allowed Paths

```yaml
allowed_paths:
  - plans/prds/20260712-0409-bdd2-shape-audit.prd.md
  - plans/plan-*-bdd2-phase-e2-shape-adapter-evaluation.md
  - evals/bdd2/evaluation-manifest.json
  - evals/bdd2/prompts/
  - evals/bdd2/evidence/
  - evals/bdd2/fixtures/
  - evals/bdd2/tasks/
  - evals/bdd2/truth/
  - evals/bdd2/rubrics/
  - evals/bdd2/metrics/
  - evals/bdd2/reports/experiment-s2.md
  - evals/bdd2/reports/experiment-s2-evidence.json
  - evals/bdd2/reports/experiment-eb.md
  - evals/bdd2/reports/experiment-eb-evidence.json
  - evals/bdd2/reports/experiment-ei.md
  - evals/bdd2/reports/experiment-ei-evidence.json
  - evals/bdd2/reports/experiment-i2.md
  - evals/bdd2/reports/phase-e2-gate.md
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - tasks/current.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
  - .ai/harness/runs/bdd2/
```

Contract/review/notes files created by the approved projection may also be changed.
No other product, skill, CLI, MCP, hook, catalog, sidecar, or `/check` path is allowed.

## Task Breakdown

- [x] E2-01: revise the PRD evaluation section and freeze a new fail-closed E2
      manifest, unseen datasets, pre-sealed provider artifacts, two-layer scoring,
      metric functions, reviewer separation, fixture workspace, and
      human-adjudication protocol.
- [x] E2-02: execute and adjudicate all 72 S2 outputs; publish `Pass / Reshape / Kill`
      without changing thresholds after reveal.
- [x] E2-03: execute and adjudicate all 24 EB decisions and all 24 EI decisions;
      publish independent adapter decisions even if S2 does not pass.
- [x] E2-04: if and only if S2 and at least one adapter pass, execute the two-condition
      page-feature pilot and publish its bounded result; otherwise record gated-not-run.
- [x] E2-05: record one Phase E2 gate report, preserve Phase E history, run focused and
      repository workflow checks, obtain external review, and stop before Phase P.

## Verification

- `bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts`
- `bun scripts/run-bdd2-evals.ts validate`
- dry-run coordinate plans exactly match S2=72, EB=24, EI=24, and I2=4 outputs when
  its prerequisite is open;
- locked score counts exactly match S2 outcome=144, EB outcome=48 plus EB-1
  output-specific evidence-use=12, and EI outcome=48 plus EI-1 output-specific
  evidence-use=12; owner adjudications cover every schema-defined primary-reviewer
  disagreement and are additional immutable records that never replace either score;
- every frozen input hash validates from a clean source commit;
- blind packets contain no truth, condition, provider label, repo path, or sibling
  output; normalized outcome packets contain no evidence appendix, URL, or asset
  reference; subprocess environments contain only the allowlist and the Agent profile
  permits model transport but disables browser/web/MCP/external tools;
- every outcome has two independently locked reviewer scores, with owner adjudication
  for decision-critical conflicts before condition reveal;
- Browser screenshots and ImageGen outputs have raw content hashes, frozen provider
  metadata, privacy/synthetic reviews, tracked selected evaluation assets, and task
  bindings; reports reproduce from captured assets without rerunning a provider;
- every I2 coordinate starts from the identical fixture tree hash in a fresh workspace;
- generated evidence projections reproduce tracked reports byte-for-byte;
- `repo-harness run check-task-workflow --strict` and root required checks pass;
- external review confirms no current Audit treatment or Phase P product surface
  entered the diff.

## Stop Conditions

- Stop before runs if owner approval, a clean frozen commit, new held-out material,
  provider capability, captured adapter assets, privacy handling, two independent
  reviewers, human adjudication, or any frozen hash is missing.
- Stop only the affected adapter when its provider is unavailable; record
  `gated-not-run`, never substitute fabricated evidence.
- Stop I2 unless S2=Pass and at least one adapter=Pass.
- Stop the work-package after the Phase E2 gate report. A Phase P proposal requires a
  separate owner decision and separate plan.

## Rollback

Before execution, delete or archive the Draft plan. After execution, revert the E2
evaluation PR and delete ignored E2 raw runs. Historical Phase E evidence and all
product runtime remain unchanged; no data migration or compatibility rollback exists.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] E2-01: revise the PRD evaluation section and freeze the fail-closed E2 authority, unseen datasets, pre-sealed provider artifacts, two-layer scoring, fixture workspace, metrics, and human-adjudication protocol.
- [x] E2-02: execute and adjudicate all 72 S2 outputs, then publish `Pass / Reshape / Kill` without post-reveal threshold changes.
- [x] E2-03: execute and adjudicate all 24 EB and 24 EI decisions, then publish independent adapter decisions regardless of the S2 outcome.
- [x] E2-04: only when S2 and at least one adapter pass, execute the two-condition page-feature pilot; otherwise record it as gated-not-run.
- [x] E2-05: publish the Phase E2 gate report, preserve Phase E history, run focused and repository checks plus external review, and stop before Phase P.
