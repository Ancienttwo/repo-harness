# Plan: C8 read-only Operator collaboration surface

> **Status**: Executing
> **Created**: 20260830-1344
> **Slug**: c8-read-only-operator-collaboration-surface
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#9
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, bun run build:operator-web, check-task-sync, check-task-workflow --strict and architecture-projection check all green; the operator server route inventory contains exactly one write route and it is the existing task-message POST; the browser collaboration payload carries no absolute local path, no repository root, no sprint path, no execution offer list and no raw bound_task Claim; a degraded or changed-during-read collection renders a stated banner instead of an empty panel; the projection is deterministic for one collection
> **Rollback Surface**: Delete the new GET route plus src/core/operator/collaboration-snapshot.ts, src/effects/operator/collaboration.ts and the operator-web collaboration panels; the existing worklist, detail pane and task-message composer keep working unchanged and no persisted state or protocol number moves
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md`
> **Task Review**: `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md`
> **Implementation Notes**: `tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#9
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md`
- Sprint contract: `tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md`
- Sprint review: `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md`
- Implementation notes: `tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md`
- Review file: `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md`
- Implementation notes file: `tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Delete the new GET route plus src/core/operator/collaboration-snapshot.ts, src/effects/operator/collaboration.ts and the operator-web collaboration panels; the existing worklist, detail pane and task-message composer keep working unchanged and no persisted state or protocol number moves
- **Verification boundary**: Full bun suite, tsc --noEmit, bun run build:operator-web, check-task-sync, check-task-workflow --strict and architecture-projection check all green; the operator server route inventory contains exactly one write route and it is the existing task-message POST; the browser collaboration payload carries no absolute local path, no repository root, no sprint path, no execution offer list and no raw bound_task Claim; a degraded or changed-during-read collection renders a stated banner instead of an empty panel; the projection is deterministic for one collection
- **Review/acceptance boundary**: `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md`, `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md`, and `tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Delete the new GET route plus src/core/operator/collaboration-snapshot.ts, src/effects/operator/collaboration.ts and the operator-web collaboration panels; the existing worklist, detail pane and task-message composer keep working unchanged and no persisted state or protocol number moves

## Captured Planning Output

## P1 Map

Sprint row C8 makes the shipped collaboration substrate readable by a human without giving the
browser a second write.

Authoritative surfaces this row reads:

- `src/effects/collaboration/work-exchange.ts` — C6's `collectCollaborativeWorkExchange()`. The only
  layer that can observe a torn read; it owns `snapshot_consistency`, `degraded_sources`,
  `changed_sources` and `mode`, and it fails closed when the signal set itself is unreadable.
- `src/core/collaboration/work-exchange.ts` — `CollaborativeWorkExchangeSnapshotV1`, whose
  `open_handoffs` already carry C6's verify-or-exclude result for every `bound_task` context and
  whose `unverified_execution_context_count` is the visible consequence of a proof that did not hold.
- `src/core/collaboration/thread-projection.ts` — C2's `CollaborationThreadSnapshotV1` (lanes plus
  the deterministic `hotspot_score`) and `CollaborationContributionOpportunityV1`.
- `src/effects/repo-registry.ts` — the registry that turns a `repo_<16hex>` id into a repository
  root, the same authority the existing task-message write re-resolves through.

Authoritative surfaces this row writes:

- `src/core/operator/collaboration-snapshot.ts` (new) — the browser-safe redacting projection, the
  exact sibling of the existing `src/core/operator/fleet-snapshot.ts`.
- `src/effects/operator/collaboration.ts` (new) — the per-repository read effect and its typed
  public failures.
- `src/effects/operator/server.ts` — one new GET route and the route inventory that proves the
  task-message POST is still the only write.
- `src/operator-web/` — transport decoder, panels, dictionary entries, fixture.

Out of scope: `src/cli/commands/`, `src/cli/mcp/` and the delegation dispatch path, all owned by
C7 in parallel; every collaboration store mutation; any Lease, Claim, Publication or Acceptance byte.

Architecture paths, declared up front: `src/core/operator/**` and `src/effects/operator/**` belong
to no ArchContext capability node today, exactly as the whole operator board has since C0. This row
adds files beside the existing unmodeled ones and claims no new ownership boundary, so no node,
relation or flow is expected to move. `repo-harness architecture-projection check --json` is run
after the code lands; if it reports a major change, the acceptance is batched as
`event.orchestrator-approval-20260830-c8-collaboration-architecture` rather than split.

## P2 Trace

One board read, end to end:

1. The browser has a task selected, so it knows one `repository_id`, and issues
   `GET /api/v1/collaboration/{repository_id}/snapshot`. The board never carries a repository root.
2. `server.ts` matches `COLLABORATION_SNAPSHOT_ROUTE`, refuses any non-GET on it, and calls
   `readOperatorCollaborationSnapshot({ env, repository_id })`.
3. That effect resolves the id through `readRepoHarnessRegistryStrictSnapshot()` and calls
   `collectCollaborativeWorkExchange()` on the resolved root. An unreadable signal set throws, and
   the transport turns it into a typed 503 rather than an empty panel.
4. `projectOperatorCollaborationSnapshot()` redacts: it drops `execution_offers` and
   `snapshot_sha256`, reduces each handoff's `execution_context` to its discriminant, and carries
   `mode`, `snapshot_consistency`, `degraded_sources`, `changed_sources`, threads, signals, handoffs,
   participants, opportunities, `unverified_execution_context_count` and `source_snapshot_sha256`.
5. `decodeOperatorCollaborationSnapshot()` validates the complete payload before any component sees
   it, and the panels render lanes, discoveries, handoffs with adoption counts, hotspots and
   contributors under the existing detail pane, leaving the attention-first worklist untouched.

Pressure point one: `execution_offers`. `collectCollaborativeWorkExchange()` requires a
`read_execution_offers` reader precisely so an empty list cannot be confused with "the caller did not
ask", and offer eligibility needs an `EngineerPrincipalV1` the board does not have. The board is not
an Engineer, so it must not publish an offer list at all.

Pressure point two: a non-`stable` collection. The program's rule is that an unreadable store never
becomes a healthy empty set, so `degraded` and `changed_during_read` must reach the human as a
stated banner naming the affected sources, not as quiet zeros.

## P3 Decision

The projection lives in `src/core/operator/`, not in `src/core/collaboration/`. The repository
already has this exact seam: `projectOperatorFleetSnapshot()` takes the canonical Fleet read model
and removes machine-local detail before the document crosses HTTP, without classifying, recounting or
re-deriving anything. Putting the collaboration equivalent anywhere else would either give the
collaboration plane a browser concern or invent a third layer for a shape that already has one.

`execution_offers` is excluded rather than emptied. The effect passes a reader returning no offers so
that the collection's own stability classification stays honest for the sources the board does read,
and the projection then omits the field entirely: an empty offer list rendered as "no work available"
would be the board answering a question it never asked on any Engineer's behalf. `snapshot_sha256` is
omitted for the same reason, because it is the digest of a document containing that unasked-for
list; `source_snapshot_sha256`, the identity of the signal set every projection was derived from, is
carried instead. This mirrors the Fleet projection, which already publishes the source digest rather
than a digest of the redacted document.

A handoff's `execution_context` is reduced to its discriminant. C6 already applied verify-or-exclude,
so a `bound_task` branch that survives is proven and one that did not is `null`; carrying the proven
branch verbatim would still put a Claim id, a lease generation and a freeze receipt digest into a
browser document that has no use for them. The discriminant plus the snapshot's own
`unverified_execution_context_count` says everything the human needs: what kind of work the knowledge
came from, and how many contexts were withheld because their proof did not hold. `null` means
exactly one thing — an unproven `bound_task` — and the panel says that in words.

A separate GET route rather than an extension of the Fleet snapshot. Collaboration state is
per-repository and lives in the git common directory, while the Fleet route is fleet-wide; folding
one into the other would double-read every collaboration store for every registered repository on
every board refresh, and would merge collaboration store health into the Fleet snapshot's own
`snapshot_consistency`, which is precisely the conflation the fail-loud rule exists to prevent.

The write inventory becomes an exported constant. Asserting "only one POST route" by probing a
running server proves the behaviour but not the inventory; exporting `OPERATOR_ROUTES` with an
explicit `writes` flag per route makes the claim structural, and the test asserts both the constant
and the live 405 on the new route.

Capability is not re-derived. An `engineer_id` encodes `capability.<domain>.<name>`, but parsing it
in the operator plane would be a shadow parser for an id the engineers plane owns; the participant's
`actor_lineage` already carries that identity verbatim and is surfaced as the opaque identity it is.

## Task Breakdown

- [ ] Add `src/core/operator/collaboration-snapshot.ts`: `OperatorCollaborationSnapshotV1` plus
      `projectOperatorCollaborationSnapshot()`, dropping `execution_offers` and `snapshot_sha256`,
      reducing `execution_context` to its discriminant, and ordering threads by the authoritative
      `hotspot_score`.
- [ ] Add `src/effects/operator/collaboration.ts`: registry resolution, the C6 collection call with
      no offer reader, and `OperatorCollaborationError` with one typed code per public failure.
- [ ] Extend `src/effects/operator/server.ts` with the single new GET route and export
      `OPERATOR_ROUTES`, the machine-readable route inventory whose only write entry is the existing
      task-message POST.
- [ ] Add the browser transport decoder to `src/operator-web/types.ts` and collaboration fixtures to
      `src/operator-web/fixture.ts`.
- [ ] Render lanes, discoveries, handoffs with adoption counts, hotspots and contributors in the
      detail pane, with a fail-loud banner for `degraded` and `changed_during_read` and no path from
      any panel to a mutation, preserving the attention-first worklist and the selection-across-
      refresh behaviour.
- [ ] Extend the `en`/`zh` dictionary with every new string, keeping `zh` typed against the `en` key
      set.
- [ ] Tests: route inventory asserts exactly one write route and the new route refuses POST;
      redaction asserts no absolute local path, no `repo_root`, no `sprint_path`, no offer list and
      no raw `bound_task` Claim in the payload; degraded and changed-during-read render a stated
      banner rather than an empty panel; the projection is deterministic for one collection.
- [ ] Run `repo-harness architecture-projection check --json`; if it reports a major change, record
      the acceptance as `event.orchestrator-approval-20260830-c8-collaboration-architecture`.

## Verification

- `codegraph index .`
- `bun test --timeout 60000`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bun run build:operator-web`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `repo-harness architecture-projection check --json`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add `src/core/operator/collaboration-snapshot.ts`: `OperatorCollaborationSnapshotV1` plus
- [ ] Add `src/effects/operator/collaboration.ts`: registry resolution, the C6 collection call with
- [ ] Extend `src/effects/operator/server.ts` with the single new GET route and export
- [ ] Add the browser transport decoder to `src/operator-web/types.ts` and collaboration fixtures to
- [ ] Render lanes, discoveries, handoffs with adoption counts, hotspots and contributors in the
- [ ] Extend the `en`/`zh` dictionary with every new string, keeping `zh` typed against the `en` key
- [ ] Tests: route inventory asserts exactly one write route and the new route refuses POST;
- [ ] Run `repo-harness architecture-projection check --json`; if it reports a major change, record
