# Plan Mode: Review

Source facade: `assets/skill-commands/repo-harness-review`.

Use when a plan exists and the user wants a review before implementation.
Run the shared preflight in `../SKILL.md` first, then locate the active or
provided plan.

## Protocol

1. Select review dimensions from the plan and repo type: `product`, `eng`, `design`, and `devex`.
2. Report blocking issues first, then the minimal plan edits needed to clear them.

## Delegation Brief Evidence

A file-coupled `contract-run` verifier scores PASS or FAIL strictly against the contract's `exit_criteria`, never a rubric it invents. When reviewing such a run, check that the worker's report carries the actual command evidence for each `exit_criteria` item, not just a claim that it passed.

## Failure Modes

- If no plan exists, use the create mode instead of reviewing guesses.
- If the plan lacks scope, tests, or rollback, mark the review blocked.
- If implementation has already started, review the diff through `repo-harness-check` or Waza `/check`.

## Boundaries

- Does not edit files or implement the plan by default.
- Product review checks whether the workflow should exist.
- Engineering review checks architecture, data flow, edge cases, and tests.
- Design review applies only when user-facing docs, prompts, or UI workflow surfaces are affected.
- DevEx review checks discoverability, command routing, first-run path, and verification cost.
