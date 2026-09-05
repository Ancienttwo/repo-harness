# Plan: Reader-scoped language policy for shipped templates and docs

> **Status**: Executing
> **Created**: 20260905-1421
> **Slug**: reader-scoped-language
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: conversation:2026-09-05-reader-scoped-language
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused template/init/hook tests, repository integrity checks, CJK residue audit, and the full Bun suite
> **Rollback Surface**: Revert the single PR; policy.json gains one optional field with default en and no data migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260905-1421-reader-scoped-language.contract.md`
> **Task Review**: `tasks/reviews/20260905-1421-reader-scoped-language.review.md`
> **Implementation Notes**: `tasks/notes/20260905-1421-reader-scoped-language.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: conversation:2026-09-05-reader-scoped-language
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260905-1421-reader-scoped-language.md`
- Sprint contract: `tasks/contracts/20260905-1421-reader-scoped-language.contract.md`
- Sprint review: `tasks/reviews/20260905-1421-reader-scoped-language.review.md`
- Implementation notes: `tasks/notes/20260905-1421-reader-scoped-language.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260905-1421-reader-scoped-language.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260905-1421-reader-scoped-language.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260905-1421-reader-scoped-language.md`.

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
- Contract file: `tasks/contracts/20260905-1421-reader-scoped-language.contract.md`
- Review file: `tasks/reviews/20260905-1421-reader-scoped-language.review.md`
- Implementation notes file: `tasks/notes/20260905-1421-reader-scoped-language.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260905-1421-reader-scoped-language.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260905-1421-reader-scoped-language.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR; policy.json gains one optional field with default en and no data migration
- **Verification boundary**: Focused template/init/hook tests, repository integrity checks, CJK residue audit, and the full Bun suite
- **Review/acceptance boundary**: `tasks/reviews/20260905-1421-reader-scoped-language.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260905-1421-reader-scoped-language.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260905-1421-reader-scoped-language.contract.md`, `tasks/reviews/20260905-1421-reader-scoped-language.review.md`, and `tasks/notes/20260905-1421-reader-scoped-language.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260905-1421-reader-scoped-language.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR; policy.json gains one optional field with default en and no data migration

## Captured Planning Output

P1: Language surfaces split by reader. Agent-consumed artifacts: assets/templates/*.template.md (copied verbatim by src/core/adoption/standard-plan.ts addTemplateOperations, lines 661-678, no substitution), assets/partials*, assets/reference-configs (mirrored to docs/reference-configs by scripts/sync-reference-configs.ts), assets/skills, hook advisory strings in src/cli/hook/*. Human-consumed artifacts: docs/, plans/prds/, design brief prose, chat reports. The only language datum today is the interactive "Reporting language" preset in src/cli/commands/init.ts:73-76,289-310,1034-1055, rendered by regex into the user-level ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md managed block (init.ts:360-389); it is not persisted and .ai/harness/policy.json has no language field. Five Simplified-Chinese templates (brief, architecture, decisions, packages, tech-stack) plus guides/metro-esm-gotchas are never in the copy list and never reach downstream repos.

P2: A downstream agent authoring docs/brief.md reads root CLAUDE.md -> document-generation.md -> writes with no language rule; the design brief template ships bilingual headers that tests/ux-feature-guardrail.test.ts:64 asserts literally; hook advisories (src/cli/hook/prompt-handler.ts:588-589, mutation-guard.ts:685) inject bilingual text into agent context regardless of any preset. Pressure point: no datum decides human-facing language, and shipped agent-facing text mixes languages by accident rather than by rule.

P3: Language is decided per reader from one repo-level datum. Agent-facing surfaces become English-only; functional matching data (hook intent regexes, skill trigger phrases in description/when_to_use, src/operator-web/i18n.ts) stays bilingual because it matches user input. Human-facing documents follow policy.json#documentation.language, enum en | zh-CN | follow-user, default en, set from the existing init question and passed through env REPO_HARNESS_DOCUMENTATION_LANGUAGE following the REPO_HARNESS_DOCUMENTATION_PROFILE pattern at standard-plan.ts:757. Headers, field keys, and technical terms stay English as stable anchors; prose follows the configured language. Root context text points at the policy field instead of copying its value, so no projection drift check is needed. Orphan Chinese templates are deleted, not translated. Tradeoff: no runtime enforcement of document language (language detection would be a heuristic re-derivation); at 10x repos the only cost is one policy field per repo.

Scope: Phase 1 makes shipped agent-facing surfaces English-only. Phase 2 adds the human-facing language datum and wiring. Each phase is independently mergeable. Non-scope: this repository's README, zh-TW or other enum values, a --language CLI flag, runtime language detection, any change to hook intent regexes, skill trigger phrases, or operator-web i18n.

Phase 1 file targets:
- Delete assets/templates/brief.template.md, architecture.template.md, decisions.template.md, packages.template.md, tech-stack.template.md, guides/metro-esm-gotchas.template.md; delete the docs/guides/metro-esm-gotchas.md advisory at src/cli/hook/mutation-observed.ts:253.
- assets/templates/design-brief.template.md: remove every parenthesized Chinese gloss (35 occurrences); mirror the same headers inside assets/templates/helpers/ensure-task-workflow.sh near line 741; assets/templates/helpers/plan-to-todo.sh:699,705 replace 格局 with geju.
- src/cli/hook/prompt-handler.ts:588-589 drop the Chinese second line; src/cli/hook/mutation-guard.ts:685 English text. Do not touch regexes in subagent-handler.ts, stop-handler.ts, prompt-intents.ts, prompt-router.ts.
- assets/skills/obsidian-memory/SKILL.md body to English, keep description triggers; assets/skills/repo-harness-plan/references/create.md:21 and assets/skills/repo-harness-product/references/prd.md:19 replace 格局 with geju.
- assets/reference-configs/ux-feature-guard.md:51-52 English example; run bun run check:reference-configs to sync docs/reference-configs.
- tests/ux-feature-guardrail.test.ts:64 and any other test asserting the changed strings (audit with rg -n -uu '[\p{Han}]' tests/).

Phase 2 file targets:
- src/core/adoption/standard-plan.ts defaultPolicy (line 282, documentation block near 351): add language from opts env REPO_HARNESS_DOCUMENTATION_LANGUAGE default en; reject values outside en | zh-CN | follow-user with a clear error (fail closed). deepMergeDefaults keeps existing repo values.
- src/cli/commands/init.ts:1034-1055: rename the question to Human-facing language, keep options; derive documentationLanguage (follow -> follow-user, custom -> en) and pass it to planStandardAdoption through env.
- src/core/adoption/standard-plan.ts:399 rootContextContent: add one line: Write human-facing documents (docs/, plans/prds/, design briefs) in the language set by .ai/harness/policy.json#documentation.language; keep section headers, field keys, and technical terms in English. Agent-facing artifacts stay English.
- assets/reference-configs/document-generation.md Rules: add the same rule; assets/skills/repo-harness-product/references/prd.md PRD and design-brief steps: read policy language before writing prose.
- assets/reference-configs/global-working-rules.md Completion Summary Rule: English label Next cut and English sentence template; init.ts renderGlobalRules substitutes the label 下一刀 when preset is zh-CN; tests/global-working-rules-distribution.test.ts:58 asserts per preset.
- assets/workflow-contract.v1.json and .ai/harness/workflow-contract.json stay in sync if they enumerate policy fields; bun src/cli/index.ts init --repo . --dry-run must show documentation.language for this repo.
- tests: tests/cli/init.test.ts (env pass-through), tests/scaffold-parity.test.ts and tests/bootstrap-files.test.ts snapshots, new fail-closed case for an invalid documentation.language.

Verification:
- bun test --timeout 60000 tests/ux-feature-guardrail.test.ts tests/global-working-rules-distribution.test.ts tests/cli/init.test.ts tests/scaffold-parity.test.ts tests/bootstrap-files.test.ts tests/hook-contracts.test.ts
- bun run check:reference-configs; bash scripts/check-architecture-sync.sh; bash scripts/check-task-sync.sh; bash scripts/check-task-workflow.sh --strict; bun src/cli/index.ts init --repo . --dry-run
- rg -n -uu '[\p{Han}]' assets/ src/ --glob '!src/operator-web/i18n.ts' must leave only regex literals, skill trigger phrases, and the init option label 中文.
- Full bun test --timeout 60000 before closeout because product source changes.

## Task Breakdown
- [x] Phase 1: delete orphan Chinese templates and the metro advisory, make design-brief and helper headers English, English-only hook advisories, English obsidian-memory body and geju terms, sync reference-config mirror, update coupled tests.
- [x] Phase 2: add policy.json documentation.language with fail-closed validation and env pass-through, rename the init question and wire both projections, add the root-context and document-generation rules, render the completion-summary label per reporting preset, update coupled tests and snapshots.
- [x] Run focused tests, repository integrity checks, the CJK residue audit, and the full Bun suite; record results in this plan.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Phase 1: delete orphan Chinese templates and the metro advisory, make design-brief and helper headers English, English-only hook advisories, English obsidian-memory body and geju terms, sync reference-config mirror, update coupled tests.
- [x] Phase 2: add policy.json documentation.language with fail-closed validation and env pass-through, rename the init question and wire both projections, add the root-context and document-generation rules, render the completion-summary label per reporting preset, update coupled tests and snapshots.
- [x] Run focused tests, repository integrity checks, the CJK residue audit, and the full Bun suite; record results in this plan.

## Verification Results

Run on 2026-09-05 against `codex/reader-scoped-language` with Phase 1 and Phase 2 applied.

| Check | Result |
|-------|--------|
| `bun run check:type` | pass (no diagnostics) |
| `bun run check:reference-configs` | pass (projection OK: 23 docs, sha256:7527b9c8) |
| `bun run check:helpers` | pass (projection OK: 56 helpers) |
| `bun test --timeout 60000` on the 11 coupled files | 303 pass / 0 fail, 3934 expect() calls |
| `bun test --timeout 60000` (full suite) | 4191 pass / 4 skip / 0 fail across 349 files, 54189 expect() calls |
| `bash scripts/check-deploy-sql-order.sh` | pass |
| `bash scripts/check-architecture-sync.sh` | pass (blocking=0) |
| `bash scripts/check-task-workflow.sh --strict` | pass |
| `bun scripts/inspect-project-state.ts --repo . --format text` | pass (no drift signals) |
| `bun src/cli/index.ts init --repo . --dry-run` | pass, 0 operations (self-host source checkout no-op) |

The coupled files are `tests/cli/init.test.ts`, `tests/cli/adoption-plan.test.ts`,
`tests/global-working-rules-distribution.test.ts`, `tests/scaffold-parity.test.ts`,
`tests/bootstrap-files.test.ts`, `tests/create-project-dirs.runtime.test.ts`,
`tests/workflow-contract.test.ts`, `tests/initializer-question-pack.test.ts`,
`tests/helper-scripts.test.ts`, `tests/ux-feature-guardrail.test.ts`, and
`tests/hook-contracts.test.ts`.

`init --repo . --dry-run` cannot show this repo gaining `documentation.language`:
`planAdoption` returns the `self-host-source-noop` warning for the repo-harness
source checkout, so the field was added directly to `.ai/harness/policy.json` the
way earlier policy fields landed here. Downstream authoring is covered by
`tests/cli/adoption-plan.test.ts` "documentation language policy datum".

CJK residue audit (`rg -n -uu '[\p{Han}]' assets/ src/ --glob '!src/operator-web/i18n.ts'`)
leaves only the allowed set: hook intent/utterance regex literals and their comments in
`src/cli/hook/{prompt-intents,prompt-router,subagent-handler,stop-handler}.ts`, skill
`description`/`when_to_use` trigger phrases in `assets/skills/{repo-harness-chatgpt,repo-harness-cross-review,claude-plan,obsidian-memory}`,
the init option label in `src/cli/commands/init.ts`, and the completion-summary
substitution literal `COMPLETION_SUMMARY_LABEL_ZH`.
