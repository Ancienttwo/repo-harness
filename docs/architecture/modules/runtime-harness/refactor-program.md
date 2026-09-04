# Refactor Program

## 1. P1: Capability architecture map

The Refactor Program capability owns repo-harness orchestration around the package-local ArchContext refactor provider. ArchContext remains the only structural-analysis and recommendation-lifecycle authority; repo-harness owns accountable proposal authoring, policy, workflow routing, execution evidence, and closure.

## 2. P2: Discovery and assessment flow

- Core contracts and pure projections live under `src/core/refactor/`.
- Provider calls, Git-common-directory program state, materialization, verification, and resolution effects live under `src/effects/refactor/`.
- The operator entrypoint is `src/cli/commands/refactor.ts` once the program lifecycle is activated.

The first implemented path is:

```text
proposal-free request
  -> ArchContext scan
  -> structural observations with null scale
  -> accountable proposal author
  -> proposal-bound ArchContext scan
  -> provider-owned scale
```

## 3. P3: Design decisions and invariants

- No local module statistics, dependency analysis, cycle detection, refactor scoring, or scale inference.
- No copied recommendation status or locally synthesized resolution.
- Every mutating program transition is append-only, idempotent by exact event identity, and rejected on conflicting replay.
- Candidate worktrees cannot relax the target revision's policy or authorization.
- Architecture-scale work always crosses the existing human architecture-acceptance boundary.
- Completion requires Cutover Closure plus exact post-merge ArchContext measurement.

## Verification

Run the root required checks and the focused Refactor Program tests recorded in the capability node.
