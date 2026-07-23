---
name: repo-harness-product
description: Canonical rule owner for PRD drafting, Sprint planning/execution, and native Goal-session preparation from repo-harness planning artifacts.
when_to_use: "repo-harness-product, generate PRD, plan a sprint, sprint from PRD, run goal session, product requirements doc, sprint backlog"
---

# repo-harness-product

Canonical rule owner for PRD, Sprint, and Goal. Router-only: shared
preflight, mode selection, and cross-mode boundaries. Mode protocol lives
under `references/`.

## Shared Preflight

1. Confirm the working repo with `git rev-parse --show-toplevel`.
2. Read `docs/spec.md` and `.ai/harness/policy.json` when present.

## Mode Selection

- A product idea needs an upper-layer PRD -> `references/prd.md`.
- A PRD or spec needs an ordered Sprint backlog, or a Sprint task needs to run or report status -> `references/sprint.md`.
- A detailed PRD/Sprint needs a bounded native `/goal` session -> `references/goal.md`.

## Boundaries

- Approval gating: no mode sets `> **Status**: Approved`, or bypasses `$think`, `repo-harness run capture-plan`, task contracts, `/check`, or external acceptance on the user's behalf; explicit human approval always precedes implementation.
- `tasks/todos.md` is the deferred-goal ledger only; no mode treats it as an active backlog or goal queue.
- Product planning does not install or imply ChatGPT; ChatGPT surfaces are discovered only through their own explicit setup.
- None of these modes implements backlog tasks itself; work flows through the existing plan -> contract -> worktree -> verify gates.
