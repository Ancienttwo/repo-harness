# Design Options

Turn a genuine multi-direction visual/UX decision into a choice for the user
instead of an agent pick. The agent gathers reference evidence, generates 2-3
preview variants, and presents them without closing the decision; the user's
choice is the only event that closes it. If no human is available to choose,
the agent presents the options and stops — it never auto-selects, and it
never recommends one option over another.

## When This Fires

Fires only when ALL of these hold:

- A genuine design/UX/visual decision is in play: layout, component style,
  visual hierarchy, information architecture, interaction pattern, or
  aesthetic direction.
- 2-3+ real alternatives exist.
- The pick is a taste, brand, or product-fit judgment the agent must not
  close from evidence alone.
- A visual preview would materially help the user decide.

Does NOT fire on:

- One-correct-answer tasks.
- Purely logical or backend decisions.
- Directions the user or a design brief already specified.
- Bug fixes or refactors.

## Lineage

This is not a revival of BDD² and not a rescoring of BDD3-EA1 or BDD3-PS1;
their evidence stays byte-frozen and authoritative. Three sealed experiment
rounds killed the machinery this convention deliberately avoids:

- BDD² Phase E killed the inline Shape card, Behavior Audit, Browser
  Evidence Adapter, ImageGen Prototype Adapter, and a generic counting
  linter — each failed because the AGENT tried to close a preference or
  feature-need question with synthetic evidence
  (`docs/researches/20260713-bdd2-phase-e-closeout.md`).
- BDD3-EA1 killed a typed evidence-authority packet plus a 6-rule
  deterministic validator — enforced validator machinery tripped on
  legitimate work at Stage B scale
  (`docs/researches/20260714-bdd3-ea1-typed-evidence-authority-outcome.md`).
- BDD3-PS1 killed a protected-concern ledger with its own hold-correctness
  validator — the same enforced-machinery failure mode, this time as a
  lifecycle/ledger
  (`docs/researches/20260714-bdd3-ps1-protected-shape-outcome.md`).

The direction adjudication between BDD² and BDD3
(`docs/researches/20260713-bdd3-ea1-direction-adjudication.md`) reframed
Chrome MCP and image generation as plain host tool calls, not bespoke
product surfaces, and explicitly left open a "prototype generation + human
response capture" path where the human closes the decision. This convention
is that path: tools stay plain host calls, authority ceilings stay guidance
prose applied by judgment, there is no ledger/lifecycle/sidecar/catalog, and
the human — never the agent — closes the preference question. It does not
unlock I3 or Phase P.

## Step 1: Reference Evidence

Gather real-world reference patterns with the browser (Chrome MCP, or the
equivalent host browsing capability) as a plain host tool call — not an
adapter, not a pipeline, not a scored evidence packet.

Authority ceiling — guidance the agent applies by judgment; nothing enforces
it:

- Reference and screenshot evidence MAY establish: pattern-exists,
  visual-structure, candidate-fit.
- It may NEVER establish: feature-need, product-policy,
  numbers/durations/retries/thresholds, or accessibility semantics.
- When a candidate direction would need one of those claims to stand, mark
  it not-established and route the question to the user instead of
  asserting it.

## Step 2: Variant Generation

Render preview variants with the host's image generation as a plain host
tool call, one variant per direction.

- 2-3 variants. Never more than 3.
- Never generate variants for a single-direction decision — with only one
  direction there is nothing to choose between, so Step 1 evidence stands on
  its own and this step does not run.
- Label every image STIMULUS: a prompt for the user's reaction, not a
  proposal or a finished asset.
- Give each variant a one-line tradeoff.

## Step 3: Presentation

Present:

- The decision, in one line.
- Each option: its preview, the ceiling-honored evidence citation from Step
  1, and a one-line tradeoff.
- An explicit "what I am NOT concluding" statement naming the taste/brand/
  product-fit question the user is closing, not the agent.

Do not pick. Neutral decision factors are allowed — "if X matters more, A
fits better; if Y matters more, B fits better" — a recommendation is not:
"I'd go with A" or "A is the better choice" have no place here.

## Step 4: Choice Capture

Record the user's pick as `user_evidence`:

- If a plan is active, append it to that plan's
  `tasks/notes/<plan-stem>.notes.md` — reuse the existing notes artifact, do
  not create a new artifact type.
- If no plan is active, record it as a one-line inline decision in the
  response instead.

Record the chosen option, the date, and that a human closed it. Never cite a
synthetic preview image as authority for the choice itself — the image was
stimulus, the user's pick is the evidence.

## Fallback: User Absent

If nobody is present to choose after Step 3, present the options and stop.
Never auto-pick, never default to one option, never treat silence or a
timeout as approval, and never proceed to implementation until a human
closes the choice.

## Design-Brief Hand-off

The chosen direction feeds the existing `design-brief.template.md` /
frontend `task_profile` gate as its decided direction — this convention does
not duplicate that checklist.

## Worked Example

**Trigger.** The task is "build the settings screen for eight configuration
groups." Three real layout directions exist (tabs, sidebar nav, accordion),
the pick is a taste/information-architecture judgment, and a preview would
help. All four trigger conditions hold — proceed.

**Step 1 — reference evidence.** The browser tool visits three live settings
screens that use each pattern. Findings: a tabbed pattern-exists in product
A; a sidebar-nav pattern-exists in product B; an accordion pattern-exists in
product C. All three are candidate-fit for eight groups. Ceiling honored:
the evidence does not establish which pattern this product's users prefer,
so that claim is left to the user, not asserted.

**Step 2 — variant generation.** Image generation renders three previews:

- STIMULUS A — Tabs. Tradeoff: fewer clicks per group, but eight tabs crowd
  a narrow header.
- STIMULUS B — Sidebar nav. Tradeoff: scales cleanly past eight groups, but
  costs horizontal space on narrow viewports.
- STIMULUS C — Accordion. Tradeoff: works on mobile without a layout
  change, but hides everything below the fold by default.

**Step 3 — presentation.**

> Decision: which navigation pattern organizes the eight settings groups.
>
> - **A — Tabs** [preview]. Evidence: tabbed pattern-exists and is
>   candidate-fit (Product A, screenshot). Tradeoff: fewer clicks, crowds a
>   narrow header at eight items.
> - **B — Sidebar nav** [preview]. Evidence: pattern-exists and is
>   candidate-fit (Product B, screenshot). Tradeoff: scales past eight
>   groups, costs horizontal space on narrow viewports.
> - **C — Accordion** [preview]. Evidence: pattern-exists and is
>   candidate-fit (Product C, screenshot). Tradeoff: works on mobile
>   unchanged, hides content below the fold by default.
>
> What I am NOT concluding: which tradeoff matters more for this product's
> users, whether eight groups will grow, and whether narrow-viewport usage
> is common enough to weigh — those are yours to weigh, not evidence I can
> close from three reference screenshots. If mobile usage matters more, C
> avoids a layout change; if discoverability matters more, A or B keep every
> group visible at once.

**User picks B.**

**Step 4 — choice capture.** Recorded in `tasks/notes/<plan-stem>.notes.md`:

```
user_evidence: settings navigation = sidebar nav (option B)
date: 2026-07-14
closed_by: user (chose over tabs/accordion; ceiling-honored evidence in
  Step 1, no synthetic image cited as authority)
```

**Downstream.** The frontend task_profile / design-brief for the settings
screen cites "sidebar nav, per `tasks/notes/<plan-stem>.notes.md`" as its
decided direction — not the ImageGen preview.

**Absent-user branch.** If nobody is present to choose after Step 3 presents
the three options, the agent stops there. It does not pick B by default,
does not treat the strongest evidence citation as a tiebreaker, and does not
proceed with implementation until a human closes the choice.
