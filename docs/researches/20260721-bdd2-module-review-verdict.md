# BDD² Module Review Verdict — need fit and external-skill orchestration boundary

> **Date**: 2026-07-21
> **Method**: explorer evidence map (cited file:line sweep of product surfaces, runtime chain, sealed eval reports) + deep-reasoner analysis on primary files + orchestrator adjudication. Conversational review; this note records the durable conclusions and the follow-through decision.

## Question 1 — does the shipped module fulfill "no developer-view extras in frontend work"?

Verdict: the post-kill shape is correct and stays; coverage is asymmetric and one advisory is mis-scoped.

- The three sealed rounds (Phase E audit Kill at 35.3% precision; E3 shape/browser/imagegen Kills; BDD3 EA1 and PS1 `unsafe_reject`) validated removing all enforcement machinery. That verdict is not relitigated; `evals/bdd2` and `evals/bdd3` stay byte-frozen.
- The anti-extras intent is carried by convention, not detection: `design-brief.template.md` "Forbidden extras / non-goals" + `UX-{{SLUG}}-N1` negative scenario, `ux-feature-guard.md` hard stops, the PRD frontend route (`assets/skill-commands/repo-harness-prd/SKILL.md` step 15), the `task_profile: frontend` files_exist gate (`scripts/verify-contract.sh:875-888`), and the delegated-surface EXECUTION_BOUNDARY clause. "Developer view" never appears as a first-class concept; a dedicated detector is exactly the classifier class the evals killed.
- Coverage hole (accepted, monitored): daily non-contract frontend work sees only the advisory echo; the eval record says heavier enforcement is net-negative, so no new machinery. Brief→contract scenario-ID propagation gets no check until an observed drift (pure ID-presence projection only, per the EA1 lesson, if that day comes).
- Actionable defect: the `[UXFeatureGuard]` echo fires on the generic feature regex (`src/cli/hook/prompt-intents.ts:546` — matches `实现`/`执行`/`build` on any work), so it prints on backend/CLI prompts and trains agents to ignore it. Fix is subtraction: gate that echo on a frontend/UI noun, keep the `[BDD]` line generic.

## Question 2 — should the preview workflow (peer-research → imagegen samples → PRD → taste) become a module?

Verdict: independent, but outside the harness — a user-level skill; no harness module.

- ~80% of the workflow already has product-surface carriers: design-options Step 1 Reference Evidence + PRD Adjacent Patterns/`sidecar_research` (peer research), design-options Step 2 STIMULUS variants + brief Preview Attachment (imagegen), repo-harness-prd (PRD), and the named optional-enhancer slots for taste/imagegen skills. Missing: a named end-to-end sequence and a thicker research step.
- A real harness module (policy keys, routing, gates over external skills) is rejected hard: it recreates the killed adapter/catalog pattern, violates the settled "external skills stay out of the harness" decision (`plans/plan-20260706-0140-frontend-task-profile.md:15`), and makes the harness a second authority over `~/.claude/skills` content it cannot version.
- Extending design-options would dilute its survivor thesis (genuine multi-direction choice, human closes); a sibling convention doc either restates canonical homes or carries no information.
- Landing: `~/.claude/skills/design-proposal/` composing the existing user-level skills (`design-taste-frontend`, `gpt-taste`, `imagegen-frontend-web`, `imagegen-frontend-mobile` — all present in `~/.claude/skills`; the Codex side lacks this set, so no Codex install). Harness side gets at most ~6 pointer lines in the existing optional-slot phrasing. No policy key, no routing row, no vendoring, no verify-contract gate, no adapter/classifier.

## Residue findings

- `tasks/todos.md` rows 17-18 (BDD² revival, BDD3-PS1): revisit triggers fired and both bets closed `unsafe_reject` (`docs/researches/20260714-bdd3-ea1-typed-evidence-authority-outcome.md`, `20260714-bdd3-ps1-protected-shape-outcome.md`); rows are stale and close. Row 19 (VH1, conditional on observed visual-hierarchy rework pain) stays open.
- `plans/plan-20260714-1353-design-options-proactive-choice.md` header still `Executing` while its review is a terminal pass; archive via the standard helper.
- The design-options review's third residue (second routing-defaults map missing `design_options_choice`) is already fixed on current main (`scripts/lib/project-init-lib.sh:2153`); no action.

## Follow-through

Captured as the work-package plan with slug `bdd2-followthrough` (frontend-scoped advisory narrowing + design-proposal user-level skill with harness pointers + ledger closeout). Sealed eval authorities and the kill verdicts are inputs to that plan, not subjects of it.

## Cross-review adjudication (GPT Pro, 2026-07-21)

Input: `docs/researches/20260721-GPT-BDD.review.md`, adjudicated as a menu to prune, not a floor to build on. Both reviews agree on the base verdicts (BDD² stays a frozen eval laboratory; design-options/ux-feature-guard direction correct but soft; no generic external-skills framework; no adapter/ledger/catalog revival).

Adopted into the `bdd2-followthrough` plan:

1. **Pipeline ordering fix** — imagegen runs only after a lightweight product-boundary freeze (draft PRD): synthetic previews must never become feature authority (the agent would otherwise visualize unrequested features and write them back into the PRD). design-proposal order becomes peer-research → boundary freeze → STIMULUS variants → human choice → taste refinement. This corrects the order in the original review (and in the owner's initial description).
2. **Taste-class authority ceiling** — refinement providers may adjust visual hierarchy, spacing, typography, tokens, component selection, and presentation of frozen interactions/copy; they may not add features, states, roles, routes, fields, settings, product policy, persistence semantics, retry rules, or diagnostic modes; semantic changes return as proposals only. Canonical home: a refinement-provider block in `design-options.md` (both mirrors); the operational table lives in the design-proposal skill.
3. **Role-aware concept fields in the design-brief Guard Card** — audience/role, allowed visible concepts, forbidden backstage concepts, role-gated exceptions. Role-relative judgment, not a global denylist (`model`/`trace ID` are legitimate product concepts in developer tools). Makes "developer view" a first-class named declaration per surface, from which the N1 test is directly derivable.
4. **Anti-overcorrection clause** — anti-extras never deletes required recovery: error states, retry paths, status visibility, accessibility stay protected (goes into the skill's EXECUTION_BOUNDARY section).
5. **Rendered-surface verification as a deferred goal, not a build** — recorded in `tasks/todos.md` with revisit trigger "first observed post-brief developer-view leakage in real work". The existing designed path is the brief's N1 scenario carried into a hand-written test; a reusable assertion helper is considered only if recurrence proves it.

Rejected, with reasons:

1. **`repo-harness-preview` harness module + six-state preview core state machine** (`boundary_frozen → … → brief_confirmed`) — recreates the PS1-killed lifecycle/ledger shape, contradicts the settled external-skills-stay-out decision, and makes the harness a second authority over user-level skill versions; design-options already owns the human-choice protocol as prose. The orchestration owner GPT correctly asks for exists as the user-level design-proposal skill.
2. **`assertUxSurface` helper built now** — enforcement machinery ahead of any observed recurrence, plus a hidden runtime dependency (page-driver) for downstream repos; the N1-as-test convention is the deterministic path. Deferred behind the todos trigger above.
3. **`evals/ux-preview-v1` eval suite** — an eval program for a user-level skill with zero observed failures repeats the PR #66 over-engineering pattern; same conditional-on-observed-pain discipline as BDD3-VH1.
4. **`run-bdd2-evals.ts` refactor and manifest path portability** — cosmetic changes to a sealed, independent evaluation authority; no product value; stays frozen.
5. **Typing `design_options` routing into the workflow contract** — the reported policy/contract drift (convention routing only, closed six-field interface, GPT-reported) matters only if preview became a harness module; it does not, so the deliberate out-of-scope stands.

## Sprint-proposal round (GPT Pro, second artifact, 2026-07-21)

GPT Pro's sprint proposal reviewed (delivered as `plans/sprints/sprint-20260721-bdd2-followthrough-adjudicated.md`, since relocated to `docs/researches/20260721-GPT-bdd2-followthrough-sprint.md`). The content is faithful to this adjudication: the forbidden-scope list carries every rejected item, and no machinery is smuggled back. Corrections folded into `plans/plan-20260721-1907-bdd2-followthrough.md`:

1. **Noun-regex substring defect (real bug in the prior plan spec)** — `build` and `suite` contain `ui`, so the original single case-insensitive alternation would fire the UX advisory on virtually every English build prompt. Fixed with split ZH/EN patterns, explicit English word boundaries, and testing `ctx.text` (stripped prompt) so host-injected context cannot create UX intent; new negative fixtures (`build a CLI command`, `build a test suite`, injected-context case) pin this.
2. **Canonical homes moved up** — the boundary-before-imagegen prerequisite and the taste apply/proposal-only ceiling live in `design-options.md` (both mirrors); the design-proposal skill references them instead of restating.
3. **Template parity via projection** — the design-brief mirrors propagate through the existing `bun run sync:helpers`, not hand-edited copies.
4. **Verification widened with real commands** — `bun run check:type` and `sync:helpers`/`check:helpers` added; all named scripts verified present in `package.json`.
5. **Skill-contract refinements** — zero variants on a single genuine direction, STIMULUS labels with one-line trade-offs, incidental image content never writes back into the PRD, `SKIPPED:` degradation lines, `PROPOSED_PRODUCT_CHANGE` labels.

Rejected from the sprint proposal: the sprint container itself — the document declares "one work-package, one PR", this repo's sprints are `<stamp>-<slug>.sprint.md` backlog tables operated by `repo-harness run sprint-backlog`, and a second execution authority beside the landed plan would be dual authority; also the Gate-0 rows duplicating the standard `plan-to-todo`/`contract-worktree` flow, and the acceptance-matrix rows asserting future runtime behavior of the skill that this PR can only encode as convention text, not verify. Disposition (done 2026-07-21): the GPT document now lives at `docs/researches/20260721-GPT-bdd2-followthrough-sprint.md` as proposal reference; `plans/sprints/` holds only tool-operated backlogs.
