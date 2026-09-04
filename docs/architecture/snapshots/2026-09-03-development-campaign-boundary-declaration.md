# Development Campaign Boundary Declaration

> **Status**: Accepted
> **Proposed**: 2026-09-03T10:06:13+0800
> **Human Approval**: granted for BRC3 implementation on 2026-09-05
> **Request**: `docs/architecture/requests/runtime-harness-development-campaign.md` (Pending)
> **PRD**: `plans/prds/20260902-2238-gpt-pro-seeded-repair-campaign.prd.md`
> **Sprint**: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
> **Plan**: `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`
> **Research**: `docs/researches/20260903-repair-campaign-authority-freeze.md`

## Decision

Declare a new capability `capability.runtime-harness.development-campaign` that
owns the bounded conversion of externally authored GitHub Issues into local
repair work, and owns nothing else. The node itself is created by sprint row 3
(BRC3); at this row the boundary is declared, frozen and queued, and the
capability node deliberately does not exist yet.

Architecture existence and runtime activation are separate. Once BRC3 lands the
node, the capability exists as an architecture boundary, while
`development_campaign.mode` still defaults to `off` and disables every campaign
mutation at runtime. Landing the node grants no activation; the ladder
`off -> shadow -> active/manual` remains the only way to reach one.

## Boundary

Planned entrypoints:

- `src/core/automation/development-campaign.ts` — campaign protocol, closed
  vocabularies, append-only event schema and projection rebuild
- `src/effects/automation/*` — durable store under
  `<git-common-dir>/repo-harness/development-campaigns/v1/`, cross-process lock,
  provider observation persistence
- `src/cli/commands/campaign.ts` — operator surface

Consumed, never rewritten:

- `capability.runtime-harness.engineer-scheduling` — Work Graph and offers
- `capability.runtime-harness.collaboration` — dispatch fence
- `capability.runtime-harness.external-source-intake` — Issue observation intake
- `capability.runtime-harness.integration-acceptance` — acceptance projection,
  and the sinks it already declares for publication and the lease store

Explicitly out of the boundary:

- Task identity (`src/core/state/coordination-identity.ts`)
- Lease and claim ownership (`src/effects/state/coordination-lease-store.ts`)
- Publication and merge readiness (`src/core/publication/**`)
- Acceptance receipts (`scripts/acceptance-receipt.ts`)
- Any merge controller or auto-merge path — Phase A merge is human-executed

## Dependency direction

`development-campaign` depends on the four consumed capabilities. No consumed
capability may depend on `development-campaign`, and none of them gains a new
export for the campaign's benefit.

The campaign reaches Task and Lease authority only through the existing acquire
chain in `src/effects/fleet/acquire.ts`. Publication is a separate downstream
path it does not enter at all: a PR is created by `scripts/ship-worktrees.sh`
calling the publication CLI on the bound worktree, after the Worker's own
closeout. The campaign observes the result through `MergeReadinessV1`; it never
creates or mutates a `PublicationReceiptV1`. It introduces no root lifecycle
command.

## Why a new capability rather than an extension

The campaign's two genuinely new hops are Issue-batch adoption into canonical
Sprint plus Work Graph, and post-merge Issue closure with branch and worktree
cleanup. Neither belongs to external-source-intake, whose contract is to observe
untrusted provider bytes without interpreting them, and neither belongs to
engineer-scheduling, whose contract is same-commit graph projection. Folding
either hop into an existing capability would give that capability a second,
externally triggered authority. A separate capability keeps the protected list
enforceable: the campaign is protected against itself, which is only expressible
when it is its own node.

## Freeze evidence

`tests/characterization/repair-campaign-authority-freeze.test.ts` pins the
canonical bytes of Task, Lease, Acceptance and Publication at `main@1022e100`
and asserts the absent-by-default facts this declaration depends on. If any of
those digests move before BRC3 lands, this boundary declaration is describing a
surface that no longer exists and must be re-derived rather than re-approved.
