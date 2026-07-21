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

## Purpose & Audience (頁面目的與受眾)

- Page/surface:
- Primary audience:
- Job to be done:

## UX Feature Guard (行為前圍欄)

- Requested outcome (使用者可見結果):
- Frozen behavior / rules that must not change (不可改變的玩法與語義):
- Requested action (指令):
- Exact payload acted on (資料內容; if none, write `N/A`):
- Forbidden extras / non-goals (禁止新增):

### Role-aware User-visible Concept Boundary (角色可見概念邊界)

- Audience / role for this surface (可見角色):
- Allowed visible concepts (允許可見的概念範圍):
- Required outcome/recovery concepts that must stay visible (必須保留的結果與復原概念):
- Backstage-only concepts that must never appear as user-visible (僅限後台，不得對使用者可見):
- Role-gated exceptions, or `none` (角色限定例外，無則填 `none`):
- Authority for each exception, or `N/A` (每個例外的核准依據，無則填 `N/A`):

`UX-{{SLUG}}-N1` (the negative/non-goal scenario below) derives from the
backstage-only and non-goal fields above: it asserts that a backstage-only
concept or forbidden extra must NOT surface, not merely that some unrelated
input is invalid.

### Authority & Reuse Map (權威與復用)

Name exact repo paths. A new surface needs a concrete mismatch or cross-module
invariant; “cleaner” and “easier” are not justification.

| Responsibility / datum | Existing authority or reuse target | Decision (reuse / extend / new) | New-surface justification |
|------------------------|------------------------------------|---------------------------------|---------------------------|
|                        |                                    |                                 |                           |

### Observable & Copy Contract (可觀測狀態與文案)

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

## Reference Sources (參考來源:學什麼/避什麼)

Name concrete products, sites, or design systems — not vague adjectives. Mark unverifiable claims `[UNVERIFIED]`.

| Source | Learn (學什麼) | Avoid (避什麼) |
|--------|----------------|-----------------|
|        |                |                 |

## Color (色彩)

- Palette:
- Usage rules: (which color for which state/action; contrast/accessibility floor)

## Typography (字型排印)

- Typeface(s):
- Scale / weights:
- Language-specific notes: (for example CJK pairing, line-height)

## Layout (佈局)

- Grid / breakpoints:
- Spacing scale:
- Key components and hierarchy:

## Motion (動效)

- Trigger -> effect pairs:
- Duration / easing:
- What must stay static:

## Anti-patterns (明確禁止清單)

List concrete things this design must NOT do. Vague taste complaints ("不好看") are not acceptable entries; name the specific pattern.

-

## Confirmation Checklist (確認標準)

Every item must be checked before this brief unblocks sprint/contract execution.

- [ ] Value proposition is clear (價值主張清晰)
- [ ] Primary reference is decided (主參考已定)
- [ ] Color is accurate to the reference (色彩準確)
- [ ] Anti-pattern / don't list is explicit (明確的 don't 清單)
- [ ] Motion spec is explicit (動效規格明確)
- [ ] Product rules/non-goals are frozen; instruction and payload are separate (玩法不變，指令與內容分離)
- [ ] Existing component/domain authorities have exact reuse paths; every new surface is justified (優先復用現有權威)
- [ ] Positive, negative, and authority-failure Given/When/Then scenarios are explicit and fail loudly (BDD 場景完整且錯誤可見)
- [ ] Role-aware visible/backstage-only concept boundary is explicit; `UX-{{SLUG}}-N1` matches a backstage-only or non-goal concept (角色可見/僅限後台概念邊界明確，N1 對應非目標或僅限後台概念)

## Preview Attachment (可選)

Optional. Reference an imagegen-generated preview or screenshot here; imagegen-type skills are enhancers for this brief, never a substitute for the checklist above. `design-proposal` can run the peer-research -> boundary-freeze -> STIMULUS-preview -> taste-refinement pipeline ahead of this section; it is an optional enhancer too, never a substitute for this brief or the Confirmation Checklist.

- Preview path/link:
