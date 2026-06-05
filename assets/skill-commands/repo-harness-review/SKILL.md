---
name: repo-harness-review
description: Reviews an existing repo-harness plan across product, engineering, design, and DevEx dimensions before implementation or release follow-through.
when_to_use: "repo-harness-review, review repo-harness plan, engineering review harness plan, product review repo workflow plan, design review agentic workflow, devex review harness"
---

# repo-harness-review

Use this command when a plan exists and the user wants a review before implementation.

## Protocol

1. Confirm the working repo and locate the active or provided plan.
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text` when available.
3. Select review dimensions from the plan and repo type: `product`, `eng`, `design`, and `devex`.
4. Report blocking issues first, then the minimal plan edits needed to clear them.

## Failure Modes

- If no plan exists, route to `repo-harness-plan` instead of reviewing guesses.
- If the plan lacks scope, tests, or rollback, mark the review blocked.
- If implementation has already started, review the diff through `repo-harness-check` or Waza `/check`.

## Boundaries

- Does not edit files or implement the plan by default.
- Product review checks whether the workflow should exist.
- Engineering review checks architecture, data flow, edge cases, and tests.
- Design review applies only when user-facing docs, prompts, or UI workflow surfaces are affected.
- DevEx review checks discoverability, command routing, first-run path, and verification cost.
