# Plan: hook-effect-architecture-projection

> **Status**: Archived
> **Artifact Level**: work-package
> **Source Plan**: plans/plan-20260814-1635-hook-effect-failure-contract.md
> **Promotion Reason**: verification_boundary

## Goal

Accept the verified flow-proof delta introduced by the hook effect contract and apply the complete canonical ArchContext projection as one owned, deterministic update.

## Scope

- Own every file returned by the canonical projection plan for `hook-adapters.md`.
- Bind the accepted change to the repository owner's explicit ship-and-merge direction.
- Do not hand-edit generated architecture content.

## Allowed Paths

- `docs/architecture/.projection-manifest.json`
- `docs/architecture/modules/public-surface/action-commands.md`
- `docs/architecture/modules/public-surface/adoption.md`
- `docs/architecture/modules/public-surface/root-router.md`
- `docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md`
- `docs/architecture/modules/runtime-harness/hook-adapters.md`
- `docs/architecture/modules/runtime-harness/mcp-sidecar.md`
- `docs/architecture/modules/runtime-mcp/general-repo-access.md`
- `docs/architecture/modules/verification/codegraph-readiness.md`
- `docs/architecture/modules/verification/evals-checks.md`
- `docs/architecture/modules/workflow-engine/contract-assets.md`
- `docs/architecture/modules/workflow-engine/inspection-migration.md`
- `plans/plan-20260814-2130-hook-effect-architecture-projection.md`
- `tasks/contracts/20260814-2130-hook-effect-architecture-projection.contract.md`
- `tasks/notes/20260814-2130-hook-effect-architecture-projection.notes.md`
- `tasks/reviews/20260814-2130-hook-effect-architecture-projection.review.md`
- `plans/plan-20260814-1635-hook-effect-failure-contract.md`
- `tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md`
- `tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md`
- `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md`

## Task Breakdown

- [x] Capture the complete 12-file canonical projection set.
- [x] Apply the flow-proof projection through ArchContext.
- [x] Run combined repository verification and close both work packages.

## Stop Conditions

- Stop if the provider proposes a path outside this list.
- Stop if the accepted change no longer matches `verified-flow-proof-changed` for the eleven named capabilities.
