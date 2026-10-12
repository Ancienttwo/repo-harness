# Architecture Domain: Organization

> **Source**: `repo-harness run capability-resolver`
> **Owner**: Cross-repository task offers, task acquisition, the Task Inbox, and PR publication.

## Purpose

The organization domain owns the cross-repository delivery layer for tasks.
Task fleet projects task offers. It acquires one execution-ready task and
delivers task-addressed messages through the Task Inbox. Publication binds one
claim generation to one pull request. It manages the review lifecycle and
derives merge readiness at read time. Neither capability adds a new authority
class. Task authority stays in the canonical Sprint row. Execution authority
stays in the lease. The provider and the user perform the merge.

## Capabilities

- `organization-task-fleet` -> `docs/architecture/modules/organization/task-fleet.md`: projects task offers across registered repositories, acquires one execution-ready task into a work envelope, delivers Task Inbox messages and projects the read-only fleet board.
- `organization-publication` -> `docs/architecture/modules/organization/publication.md`: binds one claim generation to one pull request through an immutable receipt, moves it through the review lifecycle, derives fenced merge readiness at read time and stores provider feedback.

## Stable Rules

- An offer is a read-time projection. Acquire reads the Sprint row, the lease and the registry again before any side effect.
- Only an `execution_ready` offer can be acquired.
- A task message is a communication fact only. Send, delivery, acknowledgement and supersede never change a lease. Message bodies are untrusted peer data.
- The fleet board is a separate read-only model. It persists no column and no `ready` flag.
- A publication receipt is an immutable identity fact. The `current_publication` pointer is the only current authority.
- Merge readiness is derived at read time. The system never persists `ready=true`.
- Publication never merges a pull request.

## Verification Surface

- `bun run test:files tests/fleet-acquire-concurrency.test.ts tests/effects/fleet-board.test.ts tests/effects/task-inbox.test.ts tests/effects/task-inbox-layout-migration.test.ts tests/cli/fleet-offer-acquire.test.ts tests/cli/fleet-task-inbox.test.ts tests/unit/task-message-v1.test.ts --timeout 60000 --max-concurrency 1`
- `bun run test:files tests/unit/publication-receipt.test.ts tests/unit/publication-lifecycle.test.ts tests/unit/publication-recovery-reconcile.test.ts tests/unit/merge-readiness-v1.test.ts tests/unit/publication-feedback-effect.test.ts tests/publication-feedback-concurrency.test.ts tests/cli/fleet-feedback.test.ts --timeout 60000 --max-concurrency 1`
- `bun run check:type`
