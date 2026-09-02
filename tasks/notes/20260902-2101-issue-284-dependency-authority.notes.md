# Implementation Notes: issue-284-dependency-authority

> **Status**: Active
> **Plan**: plans/plan-20260902-2101-issue-284-dependency-authority.md
> **Contract**: tasks/contracts/20260902-2101-issue-284-dependency-authority.contract.md
> **Review**: tasks/reviews/20260902-2101-issue-284-dependency-authority.review.md
> **Last Updated**: 2026-09-02 21:01
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:420d68a3bce959ae22bdca6f7757eb3b57c70a2faadbbf0b065d2eea6ab82526`

## Design Decisions

- **Schema decision: yes, the dependency edge was extended.** `WorkPackageAcceptancePolicyV1.policy_ref` is an acceptance *policy document*
  (`plans/policies/module-default.json` in `plans/prds/20260824-1653-engineer-scheduling-schema.prd.md`), not a receipt subject. The module
  AcceptanceReceipt authority is one latest receipt per repository keyed by `contract_file` + `contract_sha256`, and the ME-4C product authority
  is keyed by the integration contract's approved requirement. Neither can be selected from `required_acceptance`, so picking "the current
  receipt, whatever its subject" would have been exactly the guessing the issue forbids. `WorkPackageDependencyV1` therefore gains a closed
  `acceptance_authority: { authority_kind, subject_ref, subject_revision } | null`, required for `module_accepted` (`module_acceptance`) and
  `product_accepted` (`product_acceptance`) and required to be `null` for `canonical_done` and `publication_integrated`. The key is always
  present, so a pre-existing carrier fails closed with `depends_on[i] keys are invalid` rather than resolving under a compatibility default.
- **The declared subject is proven at the target repository's canonical commit, not the local one.** A cross-repository edge names a path that
  only exists in the target repository, so `validateReferencedAuthorities` (which runs per repository at its own commit) cannot prove it. The
  resolver proves `engineerSha256(bytes at target read.commit) === subject_revision` before reading any authority; a mismatch is
  `authority_unavailable`, never a pass.
- **`authority_revision` derivation, per state.** All four states digest the same canonical evidence projection
  (`repo-harness-dependency-authority-observation`): the dependency edge including its `acceptance_authority`, the registry
  (`authorizationRevision`, access mode, registered flag), the target identity (`work_package_revision`, `task_id`, `task_revision`,
  `task_status`), the status, and the sorted evidence refs. Per-state evidence: `canonical_done` digests `{task_revision, task_status}`;
  `module_accepted` adds the AcceptanceReceipt file bytes digest, the declared subject revision, the receipt target ref/revision and the sorted
  reviewed paths; `publication_integrated` adds the lease classification plus current publication pointer, the integration `observation_id` and
  the publication receipt digest; `product_accepted` adds the approved-requirement revision plus the projection, envelope, integration contract
  and selected publication receipt digests, and on a negative the digest of the whole observed projection set. Registry, target or evidence
  movement therefore always changes the revision and stales the offer.
- **The canonical Sprint commit is deliberately excluded from the projection.** Including it would restale every Engineer offer on every
  unrelated commit to the target repository. `task_revision` already moves when the row that owns the dependency moves.
- **Evidence refs reuse `VerifiedEvidenceRefV1`** (`src/core/engineers/verified-context.ts`), the existing `{ ref, sha256 }` typed evidence ref
  in the same domain, with scheme-prefixed refs (`canonical-task:`, `acceptance-receipt:`, `acceptance-subject:`,
  `publication-integration-observation:`, `publication-receipt:`, `product-acceptance-projection:`, `integration-envelope:`,
  `integration-contract:`, `product-requirement:`). They are folded into `authority_revision`; `WorkPackageDependencyObservationV1` itself was
  left unchanged so the offer schema and `dependency_revision` keep their current shape.
- **`receipt.target_revision` is deliberately shape-checked, not anchored.** The exact anchor is `receipt.target_ref === deps.readCanonicalTargetRef(targetRepo)`; the revision itself is only required to be a git OID and is then bound into the evidence projection as `acceptance-target:<target_ref>` with `engineerSha256(target_revision)`. Binding it to `read.commit` would revoke acceptance on every unrelated commit, and proving ancestry would put Git topology into the acceptance verdict. See the Tradeoffs table.
- **Field mismatches are `unsatisfied`, IO/authorization failures are `authority_unavailable`.** A receipt that is readable but bound to another
  contract subject, another repository root, another target ref, or a `reject` disposition is a readable negative. A missing receipt file, an
  unreadable store, an unregistered or non-`read_write` dependency repository, an unprovable declared subject, or a lease read that throws is
  `authority_unavailable` with `authority_revision: null`.
- **Exhaustiveness is enforced twice.** `resolveDependencyAuthority` dispatches through a `switch` whose `default` calls
  `unreachableDependencyState(state: never)`, and `WORK_PACKAGE_DEPENDENCY_STATES` is derived from
  `Record<WorkPackageDependencyState, WorkPackageDependencyAuthorityKind | null>` keys. Adding a state without an adapter fails typecheck at the
  `never` parameter and at the record, and the enumeration test then exercises the new member.
- **Two read-only listers were added to the owning authorities rather than to the resolver.**
  `readPublicationIntegrationObservations` (publication lifecycle) and `listProductAcceptanceProjections` (integration product acceptance) live
  next to the code that persists those content-addressed stores, so the store layout stays owned by one module. `authorityFingerprint` and
  `readAcceptanceReceiptFile` were exported from `scripts/acceptance-receipt.ts` (mirrored to `assets/templates/helpers/`) so the resolver reuses
  the single receipt validator and the single contract-normalization rule instead of re-deriving either.
- **The task join site is isolated.** The publication and product adapters join to the target by `target.task_id` / `target.task_revision`
  inside `publicationIntegrated` and `productAccepted` only; issue #283 can swap the join without touching the status semantics.

## Deviations From Plan Or Spec

- The plan's task breakdown item #1 asked for failing tests first. The schema shape that the tests had to assert (the `acceptance_authority`
  edge) was itself the open design question, so the core schema and the resolver landed before
  `tests/unit/issue-284-dependency-authority.test.ts`. The pre-existing guard
  (`tests/unit/me1a-engineer-scheduling.test.ts`, "future dependency authority fails closed") covered the old behavior throughout.
- The AcceptanceReceipt fixtures are written to the real `acceptanceReceiptPath` and read back through the production
  `readAcceptanceReceiptFile` validator rather than produced by `recordAcceptance`, which needs a full contract plus a passing
  `verify-sprint` change-assessment evidence chain. This follows the existing ME-4C test precedent
  (`tests/unit/me4c-integration-product-acceptance.test.ts`). Publication receipts, leases, integration observations, integration
  contracts/envelopes/matrices and the product acceptance projection are all built with their real production builders and writers.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse `required_acceptance` to select the module/product authority | Rejected | Its `policy_ref` is a policy document, not a receipt subject; selecting "the current receipt" would invent a second acceptance semantics |
| Treat an ambiguous or absent acceptance selector as `unsatisfied` | Rejected | The authority was never consulted, so `authority_unavailable` is the honest status; `unsatisfied` would let a board read "not ready yet" for an unreadable authority |
| Add `evidence_refs` to `WorkPackageDependencyObservationV1` | Rejected | It would change `dependency_revision` and the offer schema for no added staleness: `authority_revision` already digests the evidence projection |
| Infer publication integration from merge commits or branch ancestry | Rejected | Explicitly forbidden by the issue; the immutable integration observation is the only integration proof |
| Include the canonical Sprint commit in `authority_revision` | Rejected | Every unrelated commit would stale every offer; `task_revision` already tracks the owning row |
| Re-run `verifyAcceptance` inside the resolver | Rejected | It is async and rebuilds the full review subject; offer collection is synchronous and must stay linear in authority reads |
| Bind `receipt.target_revision` to the target repository's canonical commit (`read.commit`) | Rejected | `read.commit` is the current tip of the canonical target ref, so equality would revoke a valid acceptance on the first unrelated commit to that repository. Acceptance is recorded against the review base, not against whatever the tip later becomes |
| Prove `receipt.target_revision` is an ancestor of `read.commit` with `git merge-base --is-ancestor` | Rejected | It adds a git process per dependency edge to offer collection and makes acceptance a function of Git topology, which the issue forbids for the publication adapter and which would be inconsistent here |
| Shape-check `receipt.target_revision` and carry staleness through evidence | **Chosen** | The resolver checks `receipt.target_ref` against the target repository's canonical target ref exactly, checks `target_revision` for git-OID shape, and folds `acceptance-target:<target_ref>` + `engineerSha256(target_revision)` into the evidence projection. A moved review base therefore changes `authority_revision` and stales the Engineer offer, forcing `acquireScheduledEngineerTask` to revalidate, without the resolver inventing a second staleness rule. Full reviewed-path overlap staleness stays owned by `verifyAcceptance` (`scripts/acceptance-receipt.ts`), the acceptance authority itself |

## Open Questions

- No `plans/sprints/*.work-graph.v1.json` carrier is committed in this repository, so the `acceptance_authority` addition has no in-repo
  migration surface. A downstream repository holding a pre-existing carrier must add the key; the failure is a typed
  `depends_on[i] keys are invalid` at projection time, not a silent downgrade.
- `product_accepted` accepts any current ME-4C projection whose integration contract carries the declared approved requirement and whose
  envelope selects the exact target task revision. If a repository later needs to require one specific integration group, that belongs on the
  same `acceptance_authority` reference rather than in the resolver.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
