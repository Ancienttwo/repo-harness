# Design Brief: {{TITLE}}

> **Status**: Draft
> **Slug**: {{SLUG}}
> **Owner**: {{OWNER}}
> **Date**: {{TIMESTAMP}}

<!--
Design brief usage: produce this file as docs/design/DESIGN-{{SLUG}}.md before any
frontend task_profile sprint or contract executes. Every item in the
Confirmation Checklist needs an explicit human check before execution proceeds;
this gate carries the same weight as plan approval. imagegen-type skills (for
example `imagegen-frontend-web`, `design-taste-frontend`) may produce the
Preview Attachment below, but they are optional enhancers, never a substitute
for the checklist.

Before filling this template, read `repo-harness docs show ux-feature-guard`.
The UX Feature Guard section below is the behavior/authority hand-off to BDD;
do not create a parallel guard artifact.
-->

## Purpose & Audience

- Page/surface:
- Primary audience:
- Job to be done:

## UX Feature Guard

- Requested outcome:
- Frozen behavior / rules that must not change:
- Requested action:
- Exact payload acted on (if none, write `N/A`):
- Forbidden extras / non-goals:

### Role-aware User-visible Concept Boundary

- Audience / role for this surface:
- Allowed visible concepts:
- Required outcome/recovery concepts that must stay visible:
- Backstage-only concepts that must never appear as user-visible:
- Role-gated exceptions, or `none`:
- Authority for each exception, or `N/A`:

`UX-{{SLUG}}-N1` (the negative/non-goal scenario below) derives from the
backstage-only and non-goal fields above: it asserts that a backstage-only
concept or forbidden extra must NOT surface, not merely that some unrelated
input is invalid.

### Authority & Reuse Map

Name exact repo paths. A new surface needs a concrete mismatch or cross-module
invariant; “cleaner” and “easier” are not justification.

| Responsibility / datum | Existing authority or reuse target | Decision (reuse / extend / new) | New-surface justification |
|------------------------|------------------------------------|---------------------------------|---------------------------|
|                        |                                    |                                 |                           |

### Observable & Copy Contract

- Happy/loading/empty states that can actually occur:
- Invalid/unavailable state: (what happened, where, next action)
- Machine-readable output contract, if any: (required presence and absence)
- Canonical copy source / sync sites:
- Fail-loud rule: (name the authoritative failure; no synthesized fallback)

### BDD Acceptance Scenarios

Write concrete Given/When/Then scenarios. These implement the frozen decisions;
they do not invent missing product rules.

- Positive scenario ID + Given/When/Then: (`UX-{{SLUG}}-P1`)
- Negative / non-goal scenario ID + Given/When/Then: (`UX-{{SLUG}}-N1`)
- Authority-failure scenario ID + Given/When/Then: (`UX-{{SLUG}}-F1`)

Carry these IDs unchanged into the task contract, test names/tags, and review
evidence. Those surfaces prove the scenarios; they do not redefine them.

## Reference Sources (what to learn / what to avoid)

Name concrete products, sites, or design systems — not vague adjectives. Mark unverifiable claims `[UNVERIFIED]`.

| Source | Learn | Avoid |
|--------|----------------|-----------------|
|        |                |                 |

## Color

- Palette:
- Usage rules: (which color for which state/action; contrast/accessibility floor)

## Typography

- Typeface(s):
- Scale / weights:
- Language-specific notes: (for example CJK pairing, line-height)

## Layout

- Grid / breakpoints:
- Spacing scale:
- Key components and hierarchy:

## Motion

- Trigger -> effect pairs:
- Duration / easing:
- What must stay static:

## Anti-patterns

List concrete things this design must NOT do. Vague taste complaints ("it looks ugly") are not acceptable entries; name the specific pattern.

-

## Confirmation Checklist

Every item must be checked before this brief unblocks sprint/contract execution.

- [ ] Value proposition is clear
- [ ] Primary reference is decided
- [ ] Color is accurate to the reference
- [ ] Anti-pattern / don't list is explicit
- [ ] Motion spec is explicit
- [ ] Product rules/non-goals are frozen; instruction and payload are separate
- [ ] Existing component/domain authorities have exact reuse paths; every new surface is justified
- [ ] Positive, negative, and authority-failure Given/When/Then scenarios are explicit and fail loudly
- [ ] Role-aware visible/backstage-only concept boundary is explicit; `UX-{{SLUG}}-N1` matches a backstage-only or non-goal concept

## Preview Attachment

Optional. Reference an imagegen-generated preview or screenshot here; imagegen-type skills are enhancers for this brief, never a substitute for the checklist above. `design-proposal` can run the peer-research -> boundary-freeze -> STIMULUS-preview -> taste-refinement pipeline ahead of this section; it is an optional enhancer too, never a substitute for this brief or the Confirmation Checklist.

- Preview path/link:
