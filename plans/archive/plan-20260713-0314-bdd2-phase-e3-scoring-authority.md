# Plan: BDD2 Phase E3 Scoring Authority Correction

> **Status**: Archived
> **Created**: 20260713-0314
> **Slug**: bdd2-phase-e3-scoring-authority
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: evaluation-revision
> **Source Ref**: evals/bdd2/reports/phase-e2-gate.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Corrected scoring authority and conditional I3 gate
> **Rollback Surface**: Revert E3 commits and delete ignored E3 runs
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md`
> **Task Review**: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md`

## Agentic Routing
- Selected route: product-discovery-evaluation
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: evals/bdd2/reports/phase-e2-gate.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md`
- Sprint contract: `tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md`
- Sprint review: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
- Implementation notes: `tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md`.

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
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md`
- Review file: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
- Implementation notes file: `tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert E3 commits and delete ignored E3 runs
- **Verification boundary**: Corrected scoring authority and conditional I3 gate
- **Review/acceptance boundary**: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md`, `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`, and `tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert E3 commits and delete ignored E3 runs

## Captured Planning Output

# BDD2 Phase E3 scoring-authority correction

## Outcome

Produce valid immutable decisions for inline Shape, Browser Evidence Adapter, and
ImageGen Prototype Adapter by rescoring the already-frozen E2 Agent outputs under a
corrected, pre-sealed scoring authority. Run the four-output implementation pilot only
when inline Shape passes and at least one adapter passes. End with a Sprint-level gate;
do not productize Phase P.

## P1 Architecture Map

- Historical Phase E and E2 reports are immutable evidence.
- `evals/bdd2/evaluation-manifest.json` is the current evaluation authority and may
  direct-cut from E2 to E3; no dual parser or compatibility fallback.
- `scripts/run-bdd2-evals.ts` owns corpus verification, blinded score packets, score
  validation, effective-score projection, I3 gating, and deterministic reports.
- E2 ignored raw runs provide source material only. A tracked, redacted E3 corpus must
  bind every reused full/normalized output to its E2 hashes so clean-checkout
  verification does not depend on ignored runtime state.
- Product skills, public CLI/MCP, hooks, catalogs, sidecars, lifecycle, and Phase P are
  outside this work-package.

## P2 Concrete Trace

E2 full response + normalized response → source hash verification → tracked E3 corpus
→ fresh randomized condition-blind reviewer packet → two locked primary scores →
frozen adjudicator fresh score only on canonical disagreement → effective score →
S3/EB3/EI3 gate → conditional fresh-fixture I3 pilot → Phase E3 gate.

Evidence-use scoring separately receives the full response and task-bound appendix.
An explicit limitation is not an unsupported assertion. Proposal-only artifact count
is absent from reviewer judgment; filesystem artifact delta is runner-derived only for
I3.

## P3 Decision

Use a scoring-only revision and reuse E2 Agent outputs. Do not rerun the treatment
Agents, because the defect is in score authority, not the frozen interventions. Freeze
the adjudicator as a fresh-score resolver instead of conservative union. Preserve all
old scores and decisions byte-for-byte. Fail closed on corpus/hash drift, reviewer
identity reuse, pre-reveal leakage, missing adjudication, or report mismatch.

## Task Breakdown

- [x] E3-01: Freeze E3 manifest, tracked source corpus, schemas, prompts, metrics, and
      direct-cut runner contract.
- [x] E3-02: Generate condition-blind score packets and execute complete S3, EB3, and
      EI3 primary/evidence scoring with frozen adjudication.
- [x] E3-03: Reproduce immutable experiment decisions and conditionally run I3 from
      four fresh fixture copies.
- [x] E3-04: Publish Phase E3 gate, update Sprint/PRD truth, run full checks and
      independent external review.
- [x] E3-05: Ship the completed work-package to main and archive/close workflow
      artifacts without authorizing Phase P.

## Acceptance

- No new S2/EB/EI Agent output is generated; every E3 corpus row matches its E2
  `full_response_sha256` and `normalized_outcome_sha256`.
- Two distinct primary outcome reviewers score every row. Any canonical disagreement
  requires exactly one frozen adjudicator fresh score; agreement forbids adjudication.
- Outcome score schema contains no proposal-only tracked-artifact judgment.
- Evidence score distinguishes explicit limitations from unsupported assertions and
  only unsupported assertions fail compliance.
- Conditions, pair identity, provider identity, URLs, and appendix content remain
  absent from normalized outcome reviewer packets.
- S3, EB3, EI3 each receive Pass/Reshape/Kill. I3 runs exactly four outputs only when
  S3=Pass and one adapter=Pass; otherwise it records gated-not-run.
- Historical Phase E/E2 artifacts remain byte-identical.
- No public BDD/Phase P surface is added.
- Focused tests, TypeScript, deterministic evidence reproduction, root required
  checks, and cross-model review pass.

## Rollback

Revert the E3 commits and delete ignored E3 scoring/pilot runs. Historical Phase E and
E2 evidence remains authoritative and unchanged.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] E3-01: Freeze E3 authority and tracked source corpus.
- [x] E3-02: Execute corrected outcome/evidence scoring and adjudication.
- [x] E3-03: Publish S3/EB3/EI3 decisions and conditional I3 result.
- [x] E3-04: Complete verification, external review, and Sprint gate.
- [x] E3-05: Ship to main and close workflow artifacts without Phase P.
