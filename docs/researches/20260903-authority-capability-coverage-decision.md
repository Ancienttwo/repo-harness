# Authority Capability Coverage Decision

> **Status**: Decided
> **Created**: 2026-09-03
> **Baseline**: `main@b35fd0a7`
> **Sprint**: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` (applies before row 3, BRC3)
> **Freeze**: `docs/researches/20260903-repair-campaign-authority-freeze.md`
> **Freeze test**: `tests/characterization/repair-campaign-authority-freeze.test.ts`
> **Protected inventory**: `tests/fixtures/repair-campaign/protected-capabilities.json`
> **Method**: dual-track independent review (Codex peer track, Opus deep-reasoner track), synthesized by the orchestrator

## Question

Task/Lease, publication (`MergeReadinessV1`), and acceptance-receipt are the three
authorities the campaign consumes, and none of them is owned by a capability node in
`.archcontext/model/nodes/`. Before BRC3 builds the campaign node, decide whether to
add capability nodes for those three surfaces (option A) or keep them under
path-level protection only (option B).

## Verified facts

- Resolver coverage. `archctx resolve` and `bun scripts/capability-resolver.ts match`
  both return `matched:false` / `capability_id: root` for
  `src/core/state/coordination-identity.ts`, `src/effects/state/coordination-lease-store.ts`,
  `src/core/publication/merge-readiness.ts`, `src/effects/publication/merge-readiness.ts`,
  and `scripts/acceptance-receipt.ts`. Control path `src/effects/collaboration/work-exchange.ts`
  matches normally.
- Drift for unmatched paths is dropped, not queued. `scripts/architecture-queue.sh`
  classifies every `src/**` path in this single-package repo as `none unrelated`; only a
  matched path is escalated to `low source-change`, and an unmatched path exits with
  `No architecture drift request for <path> (unrelated)`. No `unknown` card is produced.
- A node does not by itself produce drift signal. The escalation predicate in
  `scripts/architecture-queue.sh:329-335` requires `rel_path == "$matched_prefix/"*`, so an
  exact-file include (where `matched_prefix` equals the file) never escalates. Two protected
  capabilities that already have nodes, `engineer-scheduling` and `integration-acceptance`,
  use exact-file includes only and therefore produce zero drift events today. Only directory
  `**` includes carry signal, and `src/core/state/**` / `src/effects/state/**` would capture
  roughly 27 unrelated files.
- `scripts/acceptance-receipt.ts` cannot receive drift signal under any node shape: it has
  no `/src/` segment, so the resolver is never invoked for it.
- Adding nodes turns the BRC0 freeze red immediately. The test at
  `tests/characterization/repair-campaign-authority-freeze.test.ts:869-891` asserts that every
  `unmapped_surfaces` path is still owned by no capability include glob. Re-baselining that
  fixture one commit after it was frozen, before row 2 has landed, is the action shape the
  fixture's own `rule` field forbids.
- Projection churn lands on the strict gate. Inventory pins in
  `tests/architecture-projection-e2e.test.ts` and `tests/capability-archcontext-export.test.ts`
  (23 capabilities, 23 components, 45 relations, 29 flows, 23 module docs) must move, and every
  new module doc must reach `Proof: proven` through CodeGraph selector resolution or
  `check-architecture-sync.sh` blocks in strict mode. That exposure is unbounded up front.
- The path-level layer already exists: BRC0 canonical-byte digests in
  `tests/fixtures/repair-campaign/authority-freeze-baseline.json`, `PROTECTED_HELPERS` in
  `src/cli/runtime/helper-runner.ts:18`, contract `allowed_paths`, and row 9's
  `protected_surface_detected` gate. Its one real weakness is that
  `protected-capabilities.json#unmapped_surfaces` is a hand-written list that checks existence
  and non-ownership but not completeness. `src/effects/publication/merge-readiness.ts` is
  already an instance of that drift: it carries protected publication semantics but is not
  listed.
- Sprint text names two capability IDs that do not exist:
  `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md:73` says
  `capability.runtime-harness.external-sources` (the node is `external-source-intake`) and
  line 74 says `capability.runtime-harness.publication` (no such node). The boundary snapshot
  `docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md`
  already uses the correct names.

## Where the two tracks diverged

The Codex track recommended option A on the premise that a file inside a capability
prefix automatically gains context, drift, request, and workstream ownership. The Opus
track executed the escalation predicate and showed that premise is false for exact-file
includes and only true for over-capturing directory globs. Both tracks agreed that BRC3
must create the campaign node, resolve the pending
`runtime-harness-development-campaign` request in the same work package, and flip the two
"campaign is absent" freeze assertions by design. The disagreement collapses once the
drift-signal premise is removed.

## Decision

Option B. Do not add Task/Lease, publication, or acceptance-receipt capability nodes
before BRC3. Byte-level freeze is the Phase A gate ("after row 1, existing
Task/Lease/Acceptance/Publication bytes change by zero"); a node would replace a strong
guard with a weaker one and tax every later row that touches those files with a blocking
architecture card.

Bounded follow-through, folded into BRC3 task 1 (the freeze-test transition BRC3 already
owns):

1. Extend the `unmapped protected surface` assertion into a directory closure: every file
   under `src/core/state/`, `src/effects/state/`, `src/core/publication/`, and
   `src/effects/publication/` must appear either in `unmapped_surfaces.paths` or in an
   explicit exempt list in the fixture. Add `src/effects/publication/merge-readiness.ts` to
   the unmapped list.
2. Row 9's protected-path gate reads `protected-capabilities.json` and nothing else, so the
   inventory has one source of truth and the closure test is its drift check.
3. Correct the two capability IDs in the sprint's Architecture Notes when the sprint file
   is next edited for row 3, refreshing the Substantive Change SHA256 line with it.

BRC3 keeps the shared cost both tracks identified: one new capability node, the
`.ai/harness/policy.json` `development_campaign.mode` key (which opens a high
workflow-surface card that must close in the same package), relation edges that are
strictly `development-campaign -> consumed capability`, and inventory pins moved once.

## What would reverse this

- Changing `scripts/architecture-queue.sh:329-335` so exact-file includes escalate. That is
  its own work package, not a BRC3 prerequisite.
- A goal of projection completeness (module diagrams for Task/Lease/Publication) rather
  than drift protection. That is independent architecture work with its own proof risk.
- A disposable-worktree dry run showing the three candidate nodes reach `Proof: proven` on
  first projection, which would make option A's gate exposure bounded instead of unknown.
