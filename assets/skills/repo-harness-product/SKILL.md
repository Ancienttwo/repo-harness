---
name: repo-harness-product
description: Draft requested product requirements, order a Sprint backlog, or prepare a native Goal session. Exclude ordinary code tasks.
when_to_use: "repo-harness-product"
---

# repo-harness-product

Bot entrypoint. Confirm the product goal and source requirements.

## Mode Selection

- A real new product needs a PRD: `references/prd.md`.
- A requested backlog needs ordering: `references/sprint.md`.
- A requested bounded Goal session needs preparation: `references/goal.md`.

## Boundaries

Use a short worker brief or PR description for ordinary tasks.
Do not mark artifacts Approved on the user's behalf. Preserve existing approval.
Keep `tasks/todos.md` as the deferred-goal ledger. Product planning does not
install ChatGPT or execute backlog work. Delegate execution within named scope.
