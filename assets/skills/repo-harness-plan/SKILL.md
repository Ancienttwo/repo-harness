---
name: repo-harness-plan
description: Interactive planning entrypoint for repo-local agentic development work. Produces an approved plan before implementation, and reviews an existing plan across product, engineering, design, and DevEx dimensions.
when_to_use: "repo-harness-plan, plan repo-local agentic workflow work, design repo-harness change, review repo-harness plan, engineering review harness plan"
---

# repo-harness-plan

Canonical rule owner for plan creation and plan review. Router-only: shared
preflight, mode selection, and cross-mode boundaries. Mode protocol lives
under `references/`.

## Shared Preflight

1. Confirm the working repo with `pwd` or `git rev-parse --show-toplevel`.
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text` when available.

## Mode Selection

- No plan exists yet, or the user wants a decision-complete plan for repo-harness workflow work -> `references/create.md`.
- A plan already exists and the user wants a review before implementation -> `references/review.md`.

## Boundaries

- Neither mode edits implementation files by default; review is fully read-only, and create may only capture a plan artifact through `repo-harness run capture-plan`.
- Does not run `repo-harness run plan-to-todo` from either mode; that requires explicit implementation approval handled outside this package.
