# Plan: Proactive Design-Options: visual directions for the user to choose

> **Status**: Executing
> **Created**: 20260714-1353
> **Slug**: design-options-proactive-choice
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260713-bdd3-ea1-direction-adjudication.md
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Content parity (assets<->docs) + routing registration (agentic-development-flow.md <-> policy.json + root contract clause) + adopt --dry-run discoverability + root required checks prove the convention reaches both hosts with zero new runtime machinery.
> **Rollback Surface**: Revert the branch; pure prose/config — no data migration, no runtime code, no schema; BDD2/EA1/PS1 evidence remains byte-frozen.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md`
> **Task Review**: `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md`
> **Implementation Notes**: `tasks/notes/20260714-1353-design-options-proactive-choice.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: docs/researches/20260713-bdd3-ea1-direction-adjudication.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260714-1353-design-options-proactive-choice.md`
- Sprint contract: `tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md`
- Sprint review: `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md`
- Implementation notes: `tasks/notes/20260714-1353-design-options-proactive-choice.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-1353-design-options-proactive-choice.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-1353-design-options-proactive-choice.md`.

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
- Contract file: `tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md`
- Review file: `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md`
- Implementation notes file: `tasks/notes/20260714-1353-design-options-proactive-choice.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-1353-design-options-proactive-choice.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the branch; pure prose/config — no data migration, no runtime code, no schema; BDD2/EA1/PS1 evidence remains byte-frozen.
- **Verification boundary**: Content parity (assets<->docs) + routing registration (agentic-development-flow.md <-> policy.json + root contract clause) + adopt --dry-run discoverability + root required checks prove the convention reaches both hosts with zero new runtime machinery.
- **Review/acceptance boundary**: `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-1353-design-options-proactive-choice.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md`, `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md`, and `tasks/notes/20260714-1353-design-options-proactive-choice.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the branch; pure prose/config — no data migration, no runtime code, no schema; BDD2/EA1/PS1 evidence remains byte-frozen.

## Captured Planning Output

## Outcome
Make the agent PROACTIVELY, but only when warranted, turn a genuine multi-direction visual/UX decision into a choice FOR THE USER: gather real-world reference patterns (Chrome MCP / browse — a plain host tool), generate 2-3 visual preview variants (host ImageGen — a plain host tool), and present options + evidence + one-line tradeoffs. The USER's pick is the only closure event; the agent never closes the preference/taste/product-fit question itself. Ships as one repo-local prose convention reaching both Claude Code and Codex hosts. No new runtime machinery.

## Lineage delineation (this is NOT a Phase P violation)
The killed BDD2 surfaces (inline Shape card, Behavior Audit, Browser Evidence Adapter, ImageGen Prototype Adapter, generic counting linter — docs/researches/20260713-bdd2-phase-e-closeout.md) all failed because the AGENT tried to CLOSE questions with synthetic evidence: EI3's unevidenced user-value claim was an unconditional kill; EB3 died on a screenshot-derived feature-need claim; EA1/PS1 died because enforced validator machinery strangled legitimate work or under-covered. This work-package builds the OPPOSITE — the "prototype generation + human response capture" path the adjudication (docs/researches/20260713-bdd3-ea1-direction-adjudication.md) explicitly left open: the human closes (inverts EI3's kill); tools are plain host calls, never adapters; authority ceilings are guidance prose, never an enforced validator; no ledger/lifecycle/sidecar/catalog. It does not reopen or rescore BDD2/EA1/PS1 (byte-frozen) and does not unlock I3/Phase P. The owner's product decision of 2026-07-14 is the authorizing event.

## Frozen product decisions (the five constraints as product DNA)
1. THE AGENT NEVER CLOSES preference/trust/value/taste/product-fit questions. Synthetic images are stimulus; the user's choice is the only closing evidence.
2. Evidence-authority ceilings are GUIDANCE PROSE, not validator machinery. Reference/screenshot evidence may establish only: pattern-exists, visual-structure, candidate-fit. It may never establish: feature-need, product-policy, numbers/durations/retry/thresholds, or accessibility semantics. When a candidate would need such a claim, mark it not-established and route it to the user.
3. Trigger discipline: proactive but bounded. Fires only on a genuine multi-direction visual/UX decision that hinges on user taste/brand/product-fit; never on one-correct-answer tasks, purely logical/backend decisions, already-specified directions, or bug/refactor tasks.
4. Chrome MCP and ImageGen are invoked as plain host tools — no adapter, catalog, sidecar, lifecycle, or linter.
5. The user's choice is RECORDED in the workflow ledger as user_evidence (chosen option + date + human-authority closure) so downstream implementation cites human authority, not a synthetic image.

## Architecture map (smallest honest artifact set)
- The behavior is a convention the agent applies mid-task, registered where this repo registers proactive routing: one row in agentic-development-flow.md's Skill Routing table (+ the .ai/harness/policy.json agentic_development.routing mirror) pointing to ONE procedure doc design-options.md.
- design-options.md is authored in assets/reference-configs/ (source of truth, served by repo-harness docs show design-options) and mirrored to docs/reference-configs/ (self-host copy). Downstream repos reach it via docs show; add the shipped pointer stub only if wanted (DO-03).
- Proactivity anchor: extend the EXISTING routing sentence in root CLAUDE.md and AGENTS.md (kept in sync) with one clause routing multi-direction visual/UX choices to the design-options convention — root already carries routing clauses and is loaded every session, making the trigger real without new machinery.
- NO skill: the trigger is internal/mid-task, not a user-phrase; a skill drags in install-profile, sync scripts, host mapping and tests the requirement does not need. If routing-row proactivity proves empirically weak, a skill is an evidence-gated fast-follow.

## The convention design-options.md must specify
- Trigger heuristic (fires only when ALL hold): a genuine design/UX/visual decision is in play (layout, component style, visual hierarchy, IA, interaction pattern, aesthetic direction); 2-3+ real alternatives exist; the pick is a taste/brand/fit judgment the agent must not close from evidence; a visual preview would materially help. Does NOT fire on one-correct-answer tasks, purely logical/backend decisions, already-specified directions, bug/refactor tasks.
- Step 1 — reference evidence (browser host tool), with the authority ceiling from decision (2) written inline as guidance.
- Step 2 — variant generation (ImageGen host tool): 2-3 variants, one per direction, each labeled STIMULUS with a one-line tradeoff. Never more than 3; never generate for a single-direction decision.
- Step 3 — presentation: the decision (one line); the options each with preview + ceiling-honored evidence citation + one-line tradeoff; an explicit "what I am NOT concluding" statement; NO agent pick. Neutral decision factors allowed ("if X matters more -> A"); a recommendation is not.
- Step 4 — choice capture: record the user's pick as user_evidence in the active plan's tasks/notes/<plan-stem>.notes.md (or a one-line decision inline when no plan is active). Reuse tasks/notes — no new artifact type.
- Fallback — user absent: present options and STOP. Never auto-pick, never default.
- Design-brief hand-off: one-line pointer — the chosen direction feeds the existing design-brief template / frontend task_profile gate as its decided direction; no duplication of that checklist.
- A worked-example transcript: trigger -> browser evidence (ceiling honored) -> 2-3 variants with tradeoffs -> presentation with the NOT-concluding statement -> user picks -> recorded as user_evidence -> plus the absent-user STOP branch.

## Task Breakdown
- [ ] DO-01: Author assets/reference-configs/design-options.md (everything above, including the worked example, ceiling guidance, and lineage delineation) and mirror to docs/reference-configs/design-options.md. Verification: assets<->docs content parity; bun src/cli/index.ts docs show design-options resolves; bun test parity suite green.
- [ ] DO-02: Register the trigger — one row in the Skill Routing table of agentic-development-flow.md (assets + docs copies), the mirroring key in .ai/harness/policy.json agentic_development.routing, and the one-clause extension of the existing routing sentence in root CLAUDE.md + AGENTS.md (kept in sync). Confirm whether assets/workflow-contract.v1.json + .ai/harness/workflow-contract.json also carry routing; sync them only if they do. Verification: routing row <-> policy key parity; check-architecture-sync; prompt-routing/workflow-contract/global-working-rules test suites green; root CLAUDE.md == AGENTS.md on the edited lines.
- [ ] DO-03: Make discovery real + tests green. Confirm design-options is reachable via docs show; add the shipped pointer stub in src/core/adoption/standard-plan.ts (one line) ONLY if downstream discoverability needs it; update whichever content-contract tests enumerate the reference-config/routing set. Verification: adopt --repo . --dry-run clean; bun test green; check-task-workflow --strict.
- [ ] DO-04: Full verification + promotion. Root required checks; an existing-profile disposable install smoke via harness-evaluator (adoption-inspection profile) confirming the convention installs and is discoverable — not a behavioral eval, no new eval sprint. Promote the durable conclusion to docs/researches/ only if a non-obvious decision emerged (else skip — the convention doc IS the durable artifact); external cross-model review confirms the diff adds no adapter/catalog/skill-install/validator and does not resurrect a killed surface; archive fulfilled workflow artifacts. Verification: all required checks pass; external review clean.

## Allowed paths
assets/reference-configs/design-options.md; docs/reference-configs/design-options.md; assets/reference-configs/agentic-development-flow.md; docs/reference-configs/agentic-development-flow.md; CLAUDE.md; AGENTS.md; .ai/harness/policy.json (agentic_development.routing only); assets/workflow-contract.v1.json + .ai/harness/workflow-contract.json (only if routing is mirrored there); src/core/adoption/standard-plan.ts (only the reference-config shipped-set line, only if DO-03 adds the stub); tests/output-parity.test.ts, tests/prompt-routing-explicit-first.test.ts, tests/action-command-skills.test.ts, tests/workflow-contract.test.ts, tests/global-working-rules-distribution.test.ts, tests/cli/docs.test.ts (update only those that break); plans/plan-*-design-options-proactive-choice.md; tasks/current.md; tasks/contracts/*-design-options-proactive-choice.contract.md; tasks/reviews/*-design-options-proactive-choice.review.md; tasks/notes/*-design-options-proactive-choice.notes.md; .ai/harness/handoff/.

## Out of scope (killed surfaces — do not build)
No inline Shape card / Behavior Brief / Shape catalog; no Behavior Audit integration; no Browser Evidence Adapter / ImageGen Prototype Adapter / provider adapter; no evidence-authority validator / counting linter / typed-packet enforcement; no protected-concern ledger / lifecycle / sidecar; no new CLI command, MCP tool, hook, skill install, capability domain, or eval sprint; no I3/Phase P unlock; no reopening/rescoring of BDD2/EA1/PS1; the agent does not close preference/trust/value/taste questions, does not auto-pick, does not cite a synthetic image as authority.

## Stop conditions
Stop before authoring if the routing home or policy mirror cannot be confirmed, or a content-contract test's expected set cannot be reconciled within Allowed Paths. Stop and escalate to the owner if making the behavior real appears to require an adapter, catalog, sidecar, lifecycle, linter, new CLI/MCP/hook, or skill-install change — that means the minimal-convention premise is wrong and needs a fresh owner decision. Stop the work-package at merged convention + green checks + passing review.

## Rollback
Revert the branch. Pure prose/config: no data migration, no runtime code, no schema, no eval evidence touched. BDD2/EA1/PS1 evidence remains byte-frozen and authoritative.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] DO-01: Author assets/reference-configs/design-options.md (everything above, including the worked example, ceiling guidance, and lineage delineation) and mirror to docs/reference-configs/design-options.md. Verification: assets<->docs content parity; bun src/cli/index.ts docs show design-options resolves; bun test parity suite green.
- [ ] DO-02: Register the trigger — one row in the Skill Routing table of agentic-development-flow.md (assets + docs copies), the mirroring key in .ai/harness/policy.json agentic_development.routing, and the one-clause extension of the existing routing sentence in root CLAUDE.md + AGENTS.md (kept in sync). Confirm whether assets/workflow-contract.v1.json + .ai/harness/workflow-contract.json also carry routing; sync them only if they do. Verification: routing row <-> policy key parity; check-architecture-sync; prompt-routing/workflow-contract/global-working-rules test suites green; root CLAUDE.md == AGENTS.md on the edited lines.
- [ ] DO-03: Make discovery real + tests green. Confirm design-options is reachable via docs show; add the shipped pointer stub in src/core/adoption/standard-plan.ts (one line) ONLY if downstream discoverability needs it; update whichever content-contract tests enumerate the reference-config/routing set. Verification: adopt --repo . --dry-run clean; bun test green; check-task-workflow --strict.
- [ ] DO-04: Full verification + promotion. Root required checks; an existing-profile disposable install smoke via harness-evaluator (adoption-inspection profile) confirming the convention installs and is discoverable — not a behavioral eval, no new eval sprint. Promote the durable conclusion to docs/researches/ only if a non-obvious decision emerged (else skip — the convention doc IS the durable artifact); external cross-model review confirms the diff adds no adapter/catalog/skill-install/validator and does not resurrect a killed surface; archive fulfilled workflow artifacts. Verification: all required checks pass; external review clean.
