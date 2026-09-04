# Refactor Program

## Responsibility

The Refactor Program capability owns repo-harness orchestration around the package-local ArchContext refactor provider. ArchContext remains the only structural-analysis and recommendation-lifecycle authority; repo-harness owns accountable proposal authoring, policy, workflow routing, execution evidence, and closure.

## Runtime Boundary

- Core contracts and pure projections live under `src/core/refactor/`.
- Provider calls, Git-common-directory program state, materialization, verification, and resolution effects live under `src/effects/refactor/`.
- The operator entrypoint is `src/cli/commands/refactor.ts` once the program lifecycle is activated.

The implemented paths are:

```text
proposal-free request
  -> ArchContext scan
  -> structural observations with null scale
  -> accountable proposal author
  -> proposal-bound ArchContext scan
  -> provider-owned scale

operator start / status / stop
  -> account-level ProgramAuthorization binding
  -> policy from the exact protected target revision
  -> immutable event append under the Git common directory
  -> current projection rebuilt from the full event chain

accepted recommendation set
  -> ArchContext Book readback proves status = accepted at current HEAD
  -> exact RefactorProgramV1 bindings
  -> one contract-gated Work Package and rollback boundary per architecture node
  -> canonical Sprint rows plus Work Graph dependencies
  -> Program, Sprint, Plans, policies, and rollback artifacts published by one Git CAS
  -> planning state; Contract and Lease remain downstream authorities
```

- Proof: `proven` (capability node entrypoints and required flows bind discovery plus lifecycle store paths).

```mermaid
flowchart LR
  CLI[refactor CLI] --> Store[Git common-dir program store]
  Store --> Grant[Account-level ProgramAuthorization]
  Store --> Policy[Policy at authorized target revision]
  Discovery[Discovery and proposal authoring] --> ArchContext[archctx 0.5.2]
  CLI --> Materializer[Atomic materialization]
  Materializer --> Git[Program + Sprint + Plans + Work Graph]
  Git --> Contract[Existing Plan to Contract to Lease chain]
```

> **Proof**: `proven`; lifecycle selectors bind CLI sources to the program-store sinks.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  participant O as Operator
  participant S as Program store
  participant G as Grant store
  participant P as Protected target policy
  O->>S: start / transition / stop
  S->>G: validate exact authorization id + digest
  S->>P: read policy at target revision
  S->>S: append immutable event
  S->>S: rebuild current from all events
  S-->>O: validated projection
```

## Invariants

- No local module statistics, dependency analysis, cycle detection, refactor scoring, or scale inference.
- No copied recommendation status or locally synthesized resolution.
- Materialization re-reads ArchContext lifecycle authority and accepts only exact `recommendationId` + fingerprint pairs whose current status is `accepted`.
- Every generated Work Package ID must be present in the account-level ProgramAuthorization allowlist.
- Every mutating program transition is append-only, idempotent by exact event identity, and rejected on conflicting replay.
- Candidate worktrees cannot relax the target revision's policy or authorization.
- Architecture-scale work always crosses the existing human architecture-acceptance boundary.
- Workflow route is a pure three-input projection of provider-owned scale, scale reason codes, and major-change reasons; a supplied route is accepted only when it equals that projection.
- Materialization never creates a Lease: it writes only Program bindings, canonical Sprint tasks, Work Packages, Plans, and their exact acceptance and rollback references.
- One affected architecture node maps to one Work Package, one rollback boundary, and one repo-scoped concurrency key; dependency topology must validate before the Git CAS.
- A failed CAS leaves the append-only program at `materializing`; replay recognizes only the exact authorized child commit and finishes the `planning` transition idempotently.
- Completion requires Cutover Closure plus exact post-merge ArchContext measurement.

## Verification

Run the root required checks and the focused Refactor Program tests recorded in the capability node.
