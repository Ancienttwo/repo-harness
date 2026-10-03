# Workstream: Verify-sprint incremental retry

> **Status**: completed
> **Capability ID**: `verification-evals-checks`
> **Functional Block**: `scripts/verify-sprint.sh`
> **Matched Prefix**: `scripts/verify-sprint.sh`
> **Architecture Domain**: `verification`
> **Architecture Capability**: `evals-checks`
> **Architecture Module**: `docs/architecture/modules/verification/evals-checks.md`
> **Source Plan**: plans/plan-20260824-2214-verify-sprint-incremental-retry.md
> **Current Slice**: completed-20260825-verify-exact-subject-retry
> **Last Handoff**: `.ai/harness/handoff/current.md`
> **Architecture Request**: (none)

## Purpose

Track the exact-subject criterion retry and expensive-run fuse through implementation, root verification, and AcceptanceReceipt closeout.

## TODOs

- [x] capture pre-fix duplicate-expensive-run evidence.
- [x] implement cheap-gate zero-spawn short-circuit, explicit reuse eligibility, exact-key pass reuse, forced provenance, and post-execution identity drift rejection.
- [x] complete one root verification run and prove the exact `bun test --timeout 60000` tracer executes once across a same-subject retry.

## Notes

- Architecture truth lives in `docs/architecture/modules/verification/evals-checks.md`; runtime cache records remain ignored under `.ai/harness/runs/criteria/`.
- The workstream closes with the source plan and contract; it does not create a second task checklist in `tasks/todos.md`.
