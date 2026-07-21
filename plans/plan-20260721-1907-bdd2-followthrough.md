# Plan: BDD2 review follow-through: frontend-scoped UX guard advisory, design-proposal skill, ledger closeout

> **Status**: Draft
> **Created**: 20260721-1907
> **Slug**: bdd2-followthrough
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260721-bdd2-module-review-verdict.md
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: bun test tests/cli/prompt-intents.test.ts tests/ux-feature-guardrail.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts + bun run sync:hooks/check:hooks parity + root required checks prove the advisory split and pointer parity; the design-proposal skill is repo-external and verified by listing smoke.
> **Rollback Surface**: Revert branch codex/bdd2-followthrough; delete ~/.claude/skills/design-proposal/ (repo-external); no data migration, no schema; sealed evals/bdd2 and evals/bdd3 untouched.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260721-1907-bdd2-followthrough.contract.md`
> **Task Review**: `tasks/reviews/20260721-1907-bdd2-followthrough.review.md`
> **Implementation Notes**: `tasks/notes/20260721-1907-bdd2-followthrough.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: docs/researches/20260721-bdd2-module-review-verdict.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260721-1907-bdd2-followthrough.md`
- Sprint contract: `tasks/contracts/20260721-1907-bdd2-followthrough.contract.md`
- Sprint review: `tasks/reviews/20260721-1907-bdd2-followthrough.review.md`
- Implementation notes: `tasks/notes/20260721-1907-bdd2-followthrough.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260721-1907-bdd2-followthrough.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260721-1907-bdd2-followthrough.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260721-1907-bdd2-followthrough.md`.

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
- Contract file: `tasks/contracts/20260721-1907-bdd2-followthrough.contract.md`
- Review file: `tasks/reviews/20260721-1907-bdd2-followthrough.review.md`
- Implementation notes file: `tasks/notes/20260721-1907-bdd2-followthrough.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260721-1907-bdd2-followthrough.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260721-1907-bdd2-followthrough.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert branch codex/bdd2-followthrough; delete ~/.claude/skills/design-proposal/ (repo-external); no data migration, no schema; sealed evals/bdd2 and evals/bdd3 untouched.
- **Verification boundary**: bun test tests/cli/prompt-intents.test.ts tests/ux-feature-guardrail.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts + bun run sync:hooks/check:hooks parity + root required checks prove the advisory split and pointer parity; the design-proposal skill is repo-external and verified by listing smoke.
- **Review/acceptance boundary**: `tasks/reviews/20260721-1907-bdd2-followthrough.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260721-1907-bdd2-followthrough.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260721-1907-bdd2-followthrough.contract.md`, `tasks/reviews/20260721-1907-bdd2-followthrough.review.md`, and `tasks/notes/20260721-1907-bdd2-followthrough.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260721-1907-bdd2-followthrough.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert branch codex/bdd2-followthrough; delete ~/.claude/skills/design-proposal/ (repo-external); no data migration, no schema; sealed evals/bdd2 and evals/bdd3 untouched.

## Captured Planning Output

## Agentic Routing
- Selected route: waza-think structuring of a frozen module-review direction
- Routing reason: direction was fixed by the BDD² module review (`docs/researches/20260721-bdd2-module-review-verdict.md`); this plan only structures execution. Daily small/medium planning routes to Waza `/think` per root contract.
- Due diligence:
  - P1 map: product surfaces (`ux-feature-guard.md`, `design-options.md`, `design-brief.template.md`, `repo-harness-prd` step 15), runtime chain (`prompt-intents.ts` → `prompt-guard-decision.ts` facts → `prompt-guard.sh` `pg_fact` echoes), sealed eval authorities (`evals/bdd2`, `evals/bdd3` — untouched inputs).
  - P2 trace: `shouldEmitBddFeatureAdvice` (`src/cli/hook/prompt-intents.ts:566`) → `bdd_feature_advice` fact (`src/cli/commands/prompt-guard-decision.ts:193`) → `pg_fact BDD_FEATURE_ADVICE` echo block (`assets/hooks/prompt-guard.sh:1340-1345`). Template parity sites enforced by `tests/ux-feature-guardrail.test.ts:56-77`; hook projection enforced by `bun run sync:hooks` / `bun run check:hooks`.
  - P3 decision rationale: subtraction-only runtime change (advisory noise removal), orchestration kept outside the harness per the settled external-skills decision, ledger closeout of fired revisit triggers. No enforcement machinery — the three sealed kill rounds bind.

## Approach
### Strategy
One work-package, one worktree branch (`codex/bdd2-followthrough`), one PR, three tracks:

- **Track A — frontend-scope the UX guard advisory** (capability `runtime-harness-hook-adapters`): split the `[UXFeatureGuard]` echo out of the generic `BDD_FEATURE_ADVICE` fact into a new `ux_feature_guard_advice` fact that additionally requires a frontend/UI noun. `[BDD]` stays generic. Pure noise reduction; no blocking behavior anywhere.
- **Track B — design-proposal user-level skill + harness convention deltas** (capability `workflow-engine-contract-assets` for the repo half): author `~/.claude/skills/design-proposal/SKILL.md` (repo-external) composing the existing user-level taste/imagegen skills with the adjudicated ordering (boundary freeze before imagegen) and provider ceilings; harness side gets the PRD-skill pointer, role-aware concept fields plus the pointer in the design-brief template, and a refinement-provider authority-ceiling block in `design-options.md`. The GPT Pro cross-review adjudication (adopted/rejected menu) is recorded in the Source Ref note.
- **Track C — ledger closeout**: close `tasks/todos.md` rows 17-18 (triggers fired, outcomes sealed), archive `plans/plan-20260714-1353-design-options-proactive-choice.md` through the standard helper, record that the `project-init-lib.sh` routing-map residue is already fixed.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| One work-package, three tracks | One review boundary for one review's follow-through; minimal ceremony | PR crosses two capabilities (hook-adapters + contract-assets) | **Chosen** — explicit plan cover satisfies the cross-boundary rule; all tracks are small |
| Separate package per track | Clean capability boundaries | 3× plan/contract/worktree ceremony for ~200 changed lines total | Rejected — violates minimalism bias |
| Harness module for the preview workflow | Discoverable in every adopted repo | Recreates the killed adapter/catalog pattern; violates the external-skills-stay-out decision; second authority over `~/.claude/skills` versions | Rejected in review — not relitigated here |
| GPT Pro `repo-harness-preview` module + six-state preview core (cross-review menu) | Explicit orchestration owner shipped downstream | Same lifecycle shape PS1 killed; restates canonical homes; the valid asks fold into existing surfaces instead | Pruned — adopted items: ordering fix, taste ceiling, role-aware brief fields, deferred rendered-surface trigger (see Source Ref note) |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `src/cli/hook/prompt-intents.ts` | edit | Add `UX_FEATURE_NOUN` regex + `shouldEmitUxFeatureGuardAdvice()`; `shouldEmitBddFeatureAdvice` unchanged |
| `src/cli/commands/prompt-guard-decision.ts` | edit | Add `ux_feature_guard_advice` to the verdict facts record (after line 193) |
| `assets/hooks/prompt-guard.sh` | edit | Split the `:1340-1345` echo block: `[BDD]` under `BDD_FEATURE_ADVICE`, `[UXFeatureGuard]` under new `UX_FEATURE_GUARD_ADVICE` |
| `.ai/hooks/prompt-guard.sh` | generated | `bun run sync:hooks` projection; verify `bun run check:hooks` |
| `tests/cli/prompt-intents.test.ts` | edit | New cases: frontend positive, non-UI negative, exclusion invariants (existing `:161-162` assertions stay) |
| `tests/ux-feature-guardrail.test.ts` | edit | Update `[UXFeatureGuard]` string assertions (`:79-90`) to the new fact block; add pointer-line assertions if the suite pins template content |
| `~/.claude/skills/design-proposal/SKILL.md` | create (repo-external) | Orchestration skill per content contract below |
| `assets/skill-commands/repo-harness-prd/SKILL.md` | edit | One sentence in step 15 naming `design-proposal` as the recommended end-to-end preview sequence (optional-slot phrasing) |
| `assets/templates/design-brief.template.md` | edit | Pointer line naming `design-proposal` plus a `Role-aware User-visible Concept Boundary` subsection in the UX Feature Guard area (surface audience/role, allowed visible concepts, required outcome/recovery concepts, backstage-only concepts, role-gated exceptions with their authority), N1-derivation guidance, matching Confirmation Checklist items; propagate to `.claude/templates/design-brief.template.md` and the two `ensure-task-workflow.sh` heredocs via `bun run sync:helpers` — byte parity is test-enforced |
| `assets/reference-configs/design-options.md` + `docs/reference-configs/design-options.md` | edit | Canonical home for two additions: a product-boundary prerequisite before variant generation (audience/outcome/rules/non-goals/concept boundary/recovery frozen, else stop — imagegen never explores missing semantics) and the refinement-provider (taste-class) ceiling as an apply vs proposal-only table; semantic proposals return to human authority |
| `tasks/todos.md` | edit | Close rows 17-18 with outcome citations; row 19 (VH1) unchanged; add a rendered-surface verification deferred row (revisit trigger: first observed post-brief developer-view leakage in real work) |
| `plans/plan-20260714-1353-design-options-proactive-choice.md` | archive | `repo-harness run archive-workflow --plan plans/plan-20260714-1353-design-options-proactive-choice.md --outcome Completed` |

### Code Snippets
`src/cli/hook/prompt-intents.ts` (after `BDD_FEATURE`, mirroring the `HEALTH_VERB`+`HEALTH_NOUN` two-condition shape):

```ts
const UX_FEATURE_NOUN_ZH = re(
  '(页面|界面|前端|网页|落地页|组件|按钮|弹窗|表单|布局|排版|样式|交互|仪表盘)',
);
const UX_FEATURE_NOUN_EN = re(
  String.raw`(^|[^A-Za-z0-9_])(ui|ux|user interface|frontend|front-?end|web ?page|landing page|screen|button|modal|dialog|form|layout|dashboard|css)([^A-Za-z0-9_]|$)`,
);

/** Frontend-scoped UX guard advisory: BDD feature intent AND a UI noun in the stripped prompt. */
export function shouldEmitUxFeatureGuardAdvice(ctx: PromptIntentContext): boolean {
  if (!shouldEmitBddFeatureAdvice(ctx)) return false;
  return UX_FEATURE_NOUN_ZH.test(ctx.text) || UX_FEATURE_NOUN_EN.test(ctx.text);
}
```

Three invariants bind the executor (from the GPT sprint-proposal review): the noun test reads `ctx.text`, not `ctx.raw` — host-injected context blocks must never create UX intent; English tokens carry explicit word boundaries — `build` and `suite` must never match via the `ui` substring; the noun set is frozen as initial scope and expands only with a real missed-case fixture first. The fact is echo-only — it must not enter routing or blocking decisions. Composition through `shouldEmitBddFeatureAdvice` keeps the passive/advisory exclusions single-sourced.

`src/cli/commands/prompt-guard-decision.ts` facts record:

```ts
      bdd_feature_advice: bit(shouldEmitBddFeatureAdvice(ctx)),
      ux_feature_guard_advice: bit(shouldEmitUxFeatureGuardAdvice(ctx)),
```

`assets/hooks/prompt-guard.sh` replacement for lines 1340-1345:

```bash
if pg_fact BDD_FEATURE_ADVICE; then
  echo "[BDD] Feature intent detected. Define Given-When-Then acceptance scenarios first."
  echo "  检测到新功能请求：先定义 Given-When-Then 验收场景。"
fi
if pg_fact UX_FEATURE_GUARD_ADVICE; then
  echo "[UXFeatureGuard] For user-visible behavior, first freeze rules/non-goals, separate instruction from payload, and inventory existing UI/domain reuse targets."
  echo "  Read: repo-harness docs show ux-feature-guard (fail loudly; no parallel authority or compatibility fallback)."
fi
```

Executor precondition for T3: confirm `pg_fact` derives shell names by uppercasing the JSON fact key (`bdd_feature_advice` → `BDD_FEATURE_ADVICE`) and follow the same derivation; if the mapping is an explicit table, register the new fact there.

### design-proposal SKILL.md content contract (repo-external artifact)
Frontmatter: `name: design-proposal`; `description`: end-to-end frontend design-proposal pipeline — peer research with cited real cases, imagegen sample variants, a PRD, then taste-skill UI/UX design; composes user-level skills, never replaces repo design-brief checklists. `when_to_use`: design proposal, preview 方案, 出设计方案, 前端方案, 设计预览, mockup pipeline.

Body sections, all required:
1. **Outcome contract** — output is a decision-ready proposal packet: cited reference cases, a frozen draft product boundary, 2-3 preview variants, a human-closed direction, and a taste refinement pass; each step's artifact is listed with its location.
2. **Step 1 peer-research** — browse for real-world cases of the target pattern; cite every source (product/site + what to learn / what to avoid), aligned with the design-brief "Reference Sources" table shape. Evidence ceiling: pattern, structure, and candidate fit only — never feature need, product policy, thresholds, or accessibility conclusions. No fabricated competitor facts; unverifiable claims marked `[UNVERIFIED]`.
3. **Step 2 boundary freeze (draft PRD)** — before any image is generated, freeze a lightweight product boundary: target user, user outcome, non-goals, forbidden expansions. Inside a repo-harness repo route through `repo-harness-prd` (which owns the frontend design-brief gate); outside, produce a standalone draft PRD with the same prior-art and negative-scenario rules. Rationale: synthetic previews must never become feature authority.
4. **Step 3 imagegen samples** — invoke `imagegen-frontend-web` (or `imagegen-frontend-mobile` for mobile) only when 2-3 genuine directions exist (single direction → zero synthetic variants), at most 3, each labelled STIMULUS with a one-line trade-off, within the frozen boundary (per design-options: previews are stimuli, never authority); controls, settings, routes, or copy appearing incidentally in generated images never write back into the PRD; attach to the brief's Preview Attachment when a brief exists; present neutrally with an explicit "what is not concluded" line — no recommendation, and only the human closes the choice (design-options flow governs).
5. **Step 4 taste refinement** — hand the chosen direction to `design-taste-frontend` (or `gpt-taste` on explicit request) under the refinement ceiling canonicalized in `design-options.md` (apply vs proposal-only table): visual hierarchy, spacing, typography, tokens, component selection, and presentation of already-frozen interactions and copy may be applied; features, states, roles, routes, fields, settings, product policy, persistence semantics, retry rules, and diagnostic modes may not — semantic changes return labelled `PROPOSED_PRODUCT_CHANGE`, back to human authority, never applied directly.
6. **EXECUTION_BOUNDARY** — absent requirements are forbidden design space; unrequested extras (developer views, debug panels, speculative options) fail closed at every step. Anti-extras never deletes required recovery: error states, retry paths, status visibility, and accessibility stay protected.
7. **Degradation** — a missing sub-skill skips its step with an explicit `SKIPPED: <step> — <reason>` line; never fabricate a step's output; never silently substitute; an unclosed multi-direction choice never proceeds to implementation.
8. **Boundaries** — never a substitute for the design-brief Confirmation Checklist; inside repo-harness repos the repo conventions (`ux-feature-guard`, `design-options`) take precedence; no auto-selection of direction.

### Data Flow
User prompt → `prompt-guard.sh` → `prompt-guard-decide` verdict facts → `pg_fact` advisory echoes (Track A touches only the last hop plus the classifier). Skill pipeline: peer-research citations → imagegen variants → PRD → taste pass, each feeding the design-brief when one exists (Track B, entirely convention-level).

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Noun set misses a real frontend phrasing (false negative → no advisory) | Medium | Low — advisory only, conventions still bind | Frozen initial set + test fixtures; extend only with a demonstrated miss case |
| Template parity break across the 4 design-brief sites | Medium | Low — caught pre-merge | `tests/ux-feature-guardrail.test.ts` parity suite + `bun run check:hooks` in T9 |
| `pg_fact` name derivation differs from assumption | Low | Low — T3 precondition catches it | Executor verifies derivation before wiring; test asserts the echo fires end-to-end if a hook-runtime fixture exists |
| `archive-workflow` moves more than the one plan's artifact set | Low | Medium | Run with explicit `--plan`; review `git status` before commit; helper is the sanctioned path (same as AutoArchive) |
| Pointer names drift if the skill is later renamed | Low | Low | Pointer lines name the skill once, in optional-slot phrasing; rename updates ≤6 lines |

## Promotion Gate
- **Merge/PR unit**: one branch `codex/bdd2-followthrough`, one PR containing Tracks A + B(repo half) + C.
- **Rollback surface**: revert the branch; delete `~/.claude/skills/design-proposal/` (repo-external, untracked by this repo); no data migration, no schema, sealed evals untouched.
- **Verification boundary**: capability suites (`tests/cli/prompt-intents.test.ts`, `tests/ux-feature-guardrail.test.ts`, `tests/hook-runtime.test.ts`, `tests/hook-contracts.test.ts`) + `bun run check:type` + `bun run sync:hooks`/`check:hooks` + `bun run sync:helpers`/`check:helpers` + root required checks.
- **Review/acceptance boundary**: gatekeeper acceptance after execution; contract verify via the header-linked contract file.
- **High-risk surface**: none — advisory echo + prose + ledger edits; no blocking gate touched.
- **Why not checklist row**: crosses two capabilities plus a repo-external artifact, and carries its own review/rollback boundary from a completed module review.

## Evidence Contract
- **State/progress path**: header-linked contract file `exit_criteria`; worktree per `plan-to-todo` projection.
- **Verification evidence**: test run outputs for the four suites, `check:hooks` output, parity test output, `repo-harness run check-task-workflow --strict` result.
- **Evaluator rubric**: gatekeeper `PASS` on diff-vs-goal with the verification commands above; no new enforcement machinery introduced (grep guard: no new `exit 2` paths in `prompt-guard.sh` for these facts).
- **Stop condition**: all Task Breakdown rows checked, strict workflow check green, gatekeeper recommendation recorded in the review file.
- **Rollback surface**: as in Promotion Gate.

## Task Breakdown
- [ ] T1 `prompt-intents.ts`: add `UX_FEATURE_NOUN` + `shouldEmitUxFeatureGuardAdvice` composed over `shouldEmitBddFeatureAdvice`; export unchanged surfaces untouched
- [ ] T2 `prompt-guard-decision.ts`: emit `ux_feature_guard_advice` fact; confirm `pg_fact` name derivation (uppercase mapping or explicit table) and register accordingly
- [ ] T3 `assets/hooks/prompt-guard.sh`: split the echo block per snippet; `bun run sync:hooks && bun run check:hooks`
- [ ] T4 tests: `prompt-intents.test.ts` fixtures — `实现一个新功能页面` → both facts; `实现一个 CLI 子命令` → bdd only; `build a dashboard` → both; `build a CLI command` and `build a test suite` → bdd only (proves no `ui` substring hit); host-injected frontend context + CLI-only request → no UX fact; existing exclusion cases unchanged; update `ux-feature-guardrail.test.ts` string assertions
- [ ] T5 author `~/.claude/skills/design-proposal/SKILL.md` per the adjudicated content contract (boundary freeze before imagegen; provider ceilings); smoke: skill listing shows it and its four named sub-skills resolve in `~/.claude/skills`
- [ ] T6 harness convention deltas: `repo-harness-prd/SKILL.md` step 15 pointer (with the boundary-before-imagegen ordering) + design-brief template role-aware concept-boundary subsection and pointer propagated via `bun run sync:helpers` + design-options boundary-prerequisite and taste-ceiling table in both mirrors; parity and content tests green
- [ ] T7 `tasks/todos.md`: close rows 17-18 citing `20260714-bdd3-ea1-typed-evidence-authority-outcome.md` / `20260714-bdd3-ps1-protected-shape-outcome.md`; VH1 row untouched; add the rendered-surface verification deferred row (trigger: first observed post-brief developer-view leakage); note `project-init-lib.sh:2153` residue already fixed
- [ ] T8 archive `plans/plan-20260714-1353-design-options-proactive-choice.md` with `--outcome Completed`; verify `tasks/current.md` refresh with `--write` if the helper prompts it
- [ ] T9 full verification: four capability suites + `bun run check:type` + hook/helper parity checks + root required checks + `repo-harness run check-task-workflow --strict`; hand diff + evidence to gatekeeper for acceptance

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] T1 `prompt-intents.ts`: add `UX_FEATURE_NOUN` + `shouldEmitUxFeatureGuardAdvice` composed over `shouldEmitBddFeatureAdvice`; export unchanged surfaces untouched
- [ ] T2 `prompt-guard-decision.ts`: emit `ux_feature_guard_advice` fact; confirm `pg_fact` name derivation (uppercase mapping or explicit table) and register accordingly
- [ ] T3 `assets/hooks/prompt-guard.sh`: split the echo block per snippet; `bun run sync:hooks && bun run check:hooks`
- [ ] T4 tests: `prompt-intents.test.ts` fixtures — `实现一个新功能页面` → both facts; `实现一个 CLI 子命令` → bdd only; `build a dashboard` → both; `build a CLI command` and `build a test suite` → bdd only (proves no `ui` substring hit); host-injected frontend context + CLI-only request → no UX fact; existing exclusion cases unchanged; update `ux-feature-guardrail.test.ts` string assertions
- [ ] T5 author `~/.claude/skills/design-proposal/SKILL.md` per the adjudicated content contract (boundary freeze before imagegen; provider ceilings); smoke: skill listing shows it and its four named sub-skills resolve in `~/.claude/skills`
- [ ] T6 harness convention deltas: `repo-harness-prd/SKILL.md` step 15 pointer (with the boundary-before-imagegen ordering) + design-brief template role-aware concept-boundary subsection and pointer propagated via `bun run sync:helpers` + design-options boundary-prerequisite and taste-ceiling table in both mirrors; parity and content tests green
- [ ] T7 `tasks/todos.md`: close rows 17-18 citing `20260714-bdd3-ea1-typed-evidence-authority-outcome.md` / `20260714-bdd3-ps1-protected-shape-outcome.md`; VH1 row untouched; add the rendered-surface verification deferred row (trigger: first observed post-brief developer-view leakage); note `project-init-lib.sh:2153` residue already fixed
- [ ] T8 archive `plans/plan-20260714-1353-design-options-proactive-choice.md` with `--outcome Completed`; verify `tasks/current.md` refresh with `--write` if the helper prompts it
- [ ] T9 full verification: four capability suites + `bun run check:type` + hook/helper parity checks + root required checks + `repo-harness run check-task-workflow --strict`; hand diff + evidence to gatekeeper for acceptance
