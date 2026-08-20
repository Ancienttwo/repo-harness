> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260531-0032-ai-native-scaffold-architecture-profile.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Sprint Review: ai-native-scaffold-architecture-profile

> **Status**: Pass
> **Plan**: plans/plan-20260531-0032-ai-native-scaffold-architecture-profile.md
> **Contract**: tasks/contracts/ai-native-scaffold-architecture-profile.contract.md
> **Notes File**: tasks/notes/ai-native-scaffold-architecture-profile.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-05-31 01:52
> **Recommendation**: pass

## Mode Evidence

- Selected route: Waza `/think` captured plan executed in linked worktree `codex/ai-native-scaffold-architecture-profile`.
- P1 map: scaffold authority is `assets/plan-map.json` for A-K plan types, `assets/initializer-question-pack.v4.json` for guided decisions, `scripts/assemble-template.ts` for generated template variables, `assets/project-structures/*.txt` for structure overlays, and tests under `tests/initializer-question-pack.test.ts`, `tests/plan-map-consistency.test.ts`, `tests/output-parity.test.ts`, `tests/scaffold-parity.test.ts`, and `tests/unit/ai-native-scaffold-architecture-profile.test.ts`.
- P2 traced path: explicit `AI_NATIVE_PROFILE=runtime-console` flows through `assembleTemplate()` -> `getDefaultTemplateVariables()` -> `getAiNativeTemplateVariables()` -> `assets/partials/04-project-structure.partial.md`, producing AG-UI, assistant-ui, Bun/Hono, state, contracts, observability, and A2UI-optional text. Default Plan C keeps `AI_NATIVE_PROFILE=none` and does not emit profile prose.
- P3 decision: AI-native is an overlay axis because it cuts across existing A-K plans; defaulting to `none` preserves backward compatibility, while recommended profile metadata lets scaffold output describe agent runtime boundaries without adding a new plan code or mandatory provider dependencies.

## Verification Evidence

- Waza `/check` run: local review equivalent recorded here after passing focused tests, full tests, workflow checks, and contract checks.
- Commands run:
  - `bun install --frozen-lockfile` to restore ignored local `node_modules` required by CLI tests; no lockfile changes.
  - `bun test tests/initializer-question-pack.test.ts tests/plan-map-consistency.test.ts tests/output-parity.test.ts tests/scaffold-parity.test.ts tests/unit/ai-native-scaffold-architecture-profile.test.ts` -> 43 pass.
  - `bun test` -> 514 pass, 6 skip, 0 fail.
  - `bash scripts/check-deploy-sql-order.sh` -> OK.
  - `bash scripts/check-task-sync.sh` -> OK.
  - `bash scripts/check-task-workflow.sh --strict` -> OK with existing brain path warnings only.
  - `bun scripts/inspect-project-state.ts --repo . --format text` -> audit mode, no drift, no required decisions.
  - `bash scripts/migrate-project-template.sh --repo . --dry-run` -> dry-run completed; advisory external tooling output only.
- Manual checks:
  - Plan C default output does not include AI-native profile text.
  - Plan C with `runtime-console` includes AG-UI, assistant-ui, Bun/Hono gateway, state split, contracts, observability, and A2UI optional/experimental wording.
  - Plan catalog remains exactly A-K; no new lettered plan is introduced.
- Supporting artifacts: `assets/project-structures/ai-native-runtime-console.txt`, `assets/project-structures/ai-native-product-copilot.txt`, `assets/project-structures/ai-native-sidecar-kernel.txt`.
- Implementation notes reviewed: `tasks/notes/ai-native-scaffold-architecture-profile.notes.md`.
- Run snapshot: `.ai/harness/runs/run-20260531T015230-47150-ai-native-scaffold-architecture-profile.json`.

## Behavior Diff Notes

- Adds `ai_native_profile` decision point and profile taxonomy to question pack v4.
- Adds per-plan overlay recommendations without changing existing plan codes or default output.
- Adds template assembly support for profile summaries, tech-stack rows, and project-structure overlays.
- Updates scaffold-facing docs to describe AI-native profile selection as an overlay, not a separate product command or plan family.

## Residual Risks / Follow-ups

- No active follow-up required for this slice. Future slices should add generated files only when a specific profile needs executable scaffolding beyond docs/structure guidance.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Profile metadata, defaults, rendering, fail-fast behavior, docs, and tests are covered. |
| Product depth | 8/10 | Captures runtime-console/product-copilot/sidecar boundaries without over-scaffolding providers. |
| Design quality | 9/10 | Keeps A-K stable and uses a bounded overlay axis. |
| Code quality | 9/10 | Focused TypeScript helpers, fixture-backed overlays, and regression tests. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test`
- Re-check: `bash scripts/verify-sprint.sh`

## Summary

- Pass. The implementation satisfies the active plan by adding an AI-native scaffold profile system as an overlay while preserving the existing A-K catalog and default scaffold behavior.

## External Acceptance Advice
> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-05-31T02:30:00+0800
> **External Completed**: 2026-05-31T02:35:00+0800

- P1 blockers: none
- P2 advisories:
  1. **Profile file-path references are data-only, not schema-validated.** `projectStructureFile` in `aiNativeProfiles` entries points to files under `assets/project-structures/`, and the three referenced files exist and contain expected content. However, the schema only validates the field as `{ "type": "string" }`; a typo in a future profile entry would surface at template-assembly runtime rather than at schema-validation time. Consider a test that iterates all profiles with `projectStructureFile` and asserts each file exists and is non-empty.
  2. **`documentationProfile` added to schema retroactively.** The data in `initializer-question-pack.v4.json` already had `documentationProfile: "minimal-agentic"` before this sprint; the schema now catches up by listing it in `inferredDefaults.properties`. Correct housekeeping, but worth noting the schema was previously under-validating this field.
  3. **`Plan C + Ant Design X` replaced with `Plan C AI Chat Extension`.** `references/tech-stacks.md` drops the `@ant-design/x` stack in favor of `assistant-ui + AG-UI lite + Bun/Hono`. This is a deliberate design decision per the plan (Ant Design X is not part of the AI-native overlay taxonomy), but downstream consumers who referenced the old heading or packages should be aware.
  4. **Nine profiles lack `projectStructureFile`.** Only `runtime-console`, `product-copilot`, and `sidecar-kernel` have generated structure overlays. The plan explicitly scopes this to three overlays initially, which is correct, but consumers should understand that selecting `chat-agent`, `workflow-agent`, `browser-agent`, `research-agent`, `coding-agent`, `enterprise-agent-platform`, `voice-agent`, or `generative-ui-agent` produces tech-stack docs and profile summaries without project-tree overlays.
  5. **`normalizeAiNativeProfileId` strips aggressively.** Characters outside `[a-z0-9]` become `-`, so `"A2UI Agent"` would normalize to `"2ui-agent"` rather than throwing. This is harmless in practice (it would fail the profile lookup), but the error message would say `"Unsupported AI-native profile: A2UI Agent"` rather than hinting at normalization behavior.
- Acceptance checklist: pass

### Detailed Review

**Scope & contract alignment.** The diff modifies exactly the paths listed in `tasks/contracts/ai-native-scaffold-architecture-profile.contract.md` `allowed_paths`. No files outside the allowed set are touched. Exit criteria references in the contract (`files_exist`, `files_contain`, `files_not_contain`, `tests_pass`, `commands_succeed`) all have corresponding evidence in the diff or the existing review file.

**Backward compatibility.** Default `aiNativeProfile` is `"none"` in `inferredDefaults`. `getAiNativeTemplateVariables("C", {})` returns `enabled: false` with empty profile text. The output-parity test confirms Plan C without `AI_NATIVE_PROFILE` contains no AI-native prose. Existing A-K plan codes, labels, tiers, and harness profiles are untouched. The `PlanConfig` type extension (`aiNativeOverlayDefaults`) is optional, so older plan-map files without it continue to work.

**Schema integrity.** `assets/initializer-question-pack.v4.schema.json` adds `aiNativeProfiles` to the top-level `required` array and defines the object shape with `additionalProperties: false` at both the map level and the individual profile level. All 12 profile entries in the data file satisfy the required fields (`label`, `description`, `frontend`, `runtimeProtocol`, `backend`, `stateDefault`, `sidecarPolicy`, `uiSchema`). Optional fields (`projectStructureFile`, `techStackRows`) are present on the three profiles that need them.

**Template rendering path.** `assembleTemplate()` calls `getAiNativeTemplateVariables()` before the runtime profile resolution, spreads profile variables into `allVariables`, and sets `AI_NATIVE_PROFILE_ENABLED` in the conditions map. The partial `04-project-structure.partial.md` and template `tech-stack.template.md` both use `{{#IF AI_NATIVE_PROFILE_ENABLED}}` guards. When `none` is selected, all profile variables are empty strings and the condition is `false`, so the conditional blocks emit nothing.

**Error handling.** Unknown profile IDs throw `Error("Unsupported AI-native profile: ...")` with a sorted list of supported IDs. Empty/null input normalizes to `"none"` via the `|| "none"` fallback. The `normalizeAiNativeProfileId` function trims, lowercases, and replaces non-alphanumeric runs with hyphens, which is idempotent for the canonical kebab-case IDs.

**Test coverage.** Five test files exercise the new behavior: `initializer-question-pack.test.ts` (decision count, profile taxonomy, profile defaults), `plan-map-consistency.test.ts` (A-K unchanged, overlay defaults present, template variable activation), `output-parity.test.ts` (negative and positive output assertions), `scaffold-parity.test.ts` (project structure file content, negative overlay assertion), and `tests/unit/ai-native-scaffold-architecture-profile.test.ts` (focused integration: plan catalog stability, profile metadata, overlay emission, unknown profile rejection). Tests assert both presence and absence of content, covering the critical backward-compatibility invariant.

**Public interface stability.** `getQuestionFlowSummary` return type gains `aiNativeProfileDefault` and `aiNativeProfileCount`; this is additive, not breaking. New exports (`getAiNativeTemplateVariables`, `AiNativeProfileChoice`) are additions. No existing function signatures changed.
