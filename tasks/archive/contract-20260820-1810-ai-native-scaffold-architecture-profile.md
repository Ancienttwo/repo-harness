> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260531-0032-ai-native-scaffold-architecture-profile.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: ai-native-scaffold-architecture-profile

> **Status**: Fulfilled
> **Plan**: plans/plan-20260531-0032-ai-native-scaffold-architecture-profile.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-05-31 01:52
> **Review File**: `tasks/reviews/ai-native-scaffold-architecture-profile.review.md`
> **Notes File**: `tasks/notes/ai-native-scaffold-architecture-profile.notes.md`

## Goal

Add an AI-native scaffold profile overlay to `repo-harness-scaffold` without changing the canonical A-K plan catalog. The slice must let generated output stay unchanged by default, while explicitly selected AI-native profiles document runtime, UI protocol, sidecar, state, contract, and observability boundaries.

## Scope

- In scope:
  - Add `ai_native_profile` metadata and profile definitions to initializer question pack v4.
  - Add per-plan AI-native overlay recommendations to `assets/plan-map.json` while preserving A-K plan codes.
  - Wire profile variables through template assembly and generated scaffold guidance.
  - Add generated structure overlays for `runtime-console`, `product-copilot`, and `sidecar-kernel`.
  - Update scaffold-facing docs and tests.
- Out of scope:
  - Adding another lettered plan code or changing A-K meanings.
  - Installing concrete model providers, API keys, cloud tracing accounts, or deployment platforms.
  - Generating Python, Go, and Rust services by default.
  - Making A2UI the production-default UI layer.

## Workflow Inventory

- Source plan: `plans/plan-20260531-0032-ai-native-scaffold-architecture-profile.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/ai-native-scaffold-architecture-profile.review.md`
- Notes file: `tasks/notes/ai-native-scaffold-architecture-profile.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/ai-native-scaffold-architecture-profile.contract.md
  - tasks/reviews/ai-native-scaffold-architecture-profile.review.md
  - tasks/notes/ai-native-scaffold-architecture-profile.notes.md
  - .ai/context/capabilities.json
  - assets/initializer-question-pack.v4.json
  - assets/initializer-question-pack.v4.schema.json
  - assets/plan-map.json
  - assets/partials/04-project-structure.partial.md
  - assets/project-structures/
  - assets/templates/tech-stack.template.md
  - assets/skill-commands/repo-harness-scaffold/SKILL.md
  - references/tech-stacks.md
  - SKILL.md
  - README.md
  - scripts/initializer-question-pack.ts
  - scripts/assemble-template.ts
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - assets/project-structures/ai-native-runtime-console.txt
    - assets/project-structures/ai-native-product-copilot.txt
    - assets/project-structures/ai-native-sidecar-kernel.txt
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/ai-native-scaffold-architecture-profile.notes.md
  tests_pass:
    - path: tests/unit/ai-native-scaffold-architecture-profile.test.ts
  commands_succeed:
    - bun test tests/initializer-question-pack.test.ts tests/plan-map-consistency.test.ts tests/output-parity.test.ts tests/scaffold-parity.test.ts tests/unit/ai-native-scaffold-architecture-profile.test.ts
  files_contain:
    - path: assets/initializer-question-pack.v4.json
      pattern: '"ai_native_profile"'
    - path: assets/plan-map.json
      pattern: '"aiNativeOverlayDefaults"'
    - path: assets/partials/04-project-structure.partial.md
      pattern: 'AI_NATIVE_PROFILE_ENABLED'
    - path: references/tech-stacks.md
      pattern: 'AI-Native Scaffold Profiles'
    - path: SKILL.md
      pattern: 'AI-native scaffold overlay'
  files_not_contain:
    - path: assets/plan-map.json
      pattern: '"L"'
    - path: references/tech-stacks.md
      pattern: 'Plan L'
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
  - Default generated Plan C output does not include AI-native profile prose.
  - Explicit `AI_NATIVE_PROFILE=runtime-console` output includes AG-UI, assistant-ui, Bun/Hono, state, contracts, observability, and A2UI-as-optional language.
- Edge cases:
  - Unknown profile IDs fail fast.
  - Plan D sidecar policy keeps Python/Go/Rust behind MCP/HTTP boundaries.
- Regression risks:
  - Existing A-K plan labels and default scaffold structure must remain unchanged.

## Rollback Point

- Commit / checkpoint: branch `codex/ai-native-scaffold-architecture-profile`
- Revert strategy: revert this branch or remove the profile metadata, overlay files, template wiring, and tests named in allowed paths.
