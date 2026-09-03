# Implementation Notes: issue-284-dependency-authority

> **Status**: Active
> **Plan**: plans/plan-20260902-2101-issue-284-dependency-authority.md
> **Contract**: tasks/contracts/20260902-2101-issue-284-dependency-authority.contract.md
> **Review**: tasks/reviews/20260902-2101-issue-284-dependency-authority.review.md
> **Last Updated**: 2026-09-02 21:01
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:512cd4946e4ea910257a09e4f96f4c7da7a3f43d0bf69aa7e27868080aa8df01`

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
- **Readable negatives are `unsatisfied`; unreadable or absent authorities are `authority_unavailable`.** On the observation path a readable
  negative is a verdict the authority published that does not authorize this edge: a `reject` disposition, any disposition outside the
  `external_pass`/`user_waiver` whitelist, a verdict recorded against a different canonical target ref, or a goal whose bytes at the canonical
  commit no longer fingerprint to the observed `goal_sha256`. `authority_unavailable` covers the cases where no verdict for this exact subject
  can be read at all: no observation under the subject key (including a contract subject that moved, since the key moves with it), an
  observation whose bytes, id, subject or filename do not validate, an observation bound to another repository root, an archive-projected
  contract subject, an unregistered or non-`read_write` dependency repository, and an unreadable goal or gate store.
- **Exhaustiveness is enforced twice.** `resolveDependencyAuthority` dispatches through a `switch` whose `default` calls
  `unreachableDependencyState(state: never)`, and `WORK_PACKAGE_DEPENDENCY_STATES` is derived from
  `Record<WorkPackageDependencyState, WorkPackageDependencyAuthorityKind | null>` keys. Adding a state without an adapter fails typecheck at the
  `never` parameter and at the record, and the enumeration test then exercises the new member.
- **Two read-only listers were added to the owning authorities rather than to the resolver.**
  `readPublicationIntegrationObservations` (publication lifecycle) and `listProductAcceptanceProjections` (integration product acceptance) live
  next to the code that persists those content-addressed stores, so the store layout stays owned by one module. `authorityFingerprint` and
  `readAcceptanceReceiptFile` were exported from `scripts/acceptance-receipt.ts` (mirrored to `assets/templates/helpers/`) so the resolver reuses
  the single receipt validator and the single contract-normalization rule instead of re-deriving either.
- **The observation's disposition is gated by a whitelist, not by a `reject` test.** Moving to record-time observations dropped the
  `PASSING_ACCEPTANCE_DISPOSITIONS` whitelist that round 1 had, and `reject` is a first-class persisted disposition: `validateDisposition`'s
  third branch accepts it with a matching reviewer and at least one finding, so `recordAcceptance` writes a reject receipt *and* now its
  observation. The observation therefore exists for a rejection, and existence alone made `module_accepted` satisfied. The resolver now checks
  `observation.disposition` against `['external_pass', 'user_waiver']` and emits `acceptance-disposition:<value>` as evidence. A whitelist
  rather than `!== 'reject'` so a disposition added later is a readable negative until someone decides what it means for scheduling; the
  observation reader independently rejects a value outside the receipt's own disposition enum.
- **`module_accepted` reads a record-time observation; it no longer re-derives acceptance at all.** Two rounds of review kept finding the same
  class of defect because the resolver was still an acceptance evaluator: round 2 shipped the shared synchronous validator, and round 3 found
  that the synchronous rule set cannot prove `subject_sha256` or `verification_evidence_sha256` (those need the live working tree and the
  verify-sprint evidence chain, both only available at record time), and that `authorityFingerprint` normalizes an archive envelope away, so
  archive-projected contract bytes hash to the accepted contract's digest and passed `contract_sha256` without any seal check. The fix is
  structural, not another check: the acceptance authority now writes
  `AcceptanceVerificationObservationV1` inside the same transaction that records the receipt, freezing everything only it can prove, and the
  resolver reads that observation. This is exactly the shape the other two adapters already had — `publicationIntegrated` reads
  `reconcilePublication`'s integration observation and `productAccepted` reads `createProductAcceptanceProjection`'s projection — so all four
  states now share one rule: the owning authority publishes its verdict at record time and the resolver only proves identity and bytes.
- **Record-time anchor, not verify-time.** Anchoring at verification time was rejected: `verifyAcceptance` is asynchronous, rebuilds the live
  review subject and recomputes the verification-evidence fingerprint, and `collectEngineerOffers` is synchronous and runs per dependency edge
  per offer. Anchoring at record time also keeps `verifyAcceptance` a pure read with no side effects, which the merge gate depends on.
- **Subject-keyed, not content-addressed.** The observation lives at
  `<authorityHome>/gates/<sha256(realpath(root))>/acceptance-observations/<sha256({contract_file, contract_sha256})>.json`. A content-addressed
  bag would accumulate every historical acceptance and force the reader to search, which is how a "pick the best matching receipt" heuristic
  gets born. Subject keying gives exactly one current observation per contract subject: re-recording overwrites that one file, and a changed
  contract semantic line changes the key so the old verdict becomes unreachable rather than stale-but-readable.
- **The singleton receipt was the real defect, and this fixes it.** `acceptanceReceiptPath` is a per-repository singleton
  (`gates/<repo>/acceptance.latest.json`), so the round-1 and round-2 designs made `module_accepted` flip to `unsatisfied` the moment any other
  contract in that repository was accepted. Dependency edges are long-lived, so that state was unusable as built. Subject-keyed observations
  remove the singleton constraint entirely: two Work Packages in one repository can both hold a satisfied `module_accepted` edge.
- **Deliberate deviation from the issue's literal wording, orchestrator-approved.** Issue #284 says `module_accepted` should "read the exact
  current AcceptanceReceipt from its owning authority". The resolver now reads the authority's verification observation instead. The observation
  is written by that same authority, in the same transaction, and binds the receipt's own digest, so no second acceptance authority exists — and
  this is the only shape that satisfies the issue's stronger invariant ("no second acceptance authority", "no weaker re-derivation") given that
  the receipt alone cannot be re-verified synchronously. The deviation was reviewed and approved by the orchestrator before implementation.
- **The acceptance verdict is extracted, not duplicated.** The first implementation of `moduleAccepted` re-derived its own `bound` expression
  from seven receipt fields and ignored `expected_reviewer`, `reviewer`, `source`, `waiver_grant_sha256`, `goal_file`, `goal_sha256` and
  `verification_evidence_sha256`. That made it a second, weaker acceptance authority: a `reviewer: Claude / source: claude-review` receipt
  satisfied a contract whose Acceptance Policy is `{reviewer: Codex, source: codex-review}`, a `user_waiver` passed against a contract that
  forbids waivers or with a grant whose fingerprint had moved, and the goal binding was never checked at all. Duplicating the rule set was
  rejected outright — the issue forbids a second acceptance authority and the contract Scope promised to reuse the single validator, and a
  duplicate silently drifts every time the acceptance plane changes. The synchronous rule set is now
  `scripts/acceptance-receipt.ts#validateAcceptanceReceiptAgainstPolicy`, composed from the existing `parseAcceptancePolicy`,
  `validateDisposition`, `waiverGrantFingerprint` and `markdownHeader`, and `verifyAcceptance` calls exactly that function for its synchronous
  part. There is one implementation and two callers.
- **What `verifyAcceptance` still checks beyond the shared function, and how the resolver covers it.** Three things stay in `verifyAcceptance`
  because they are asynchronous or need the live working tree: (1) `resolveArchived` path resolution for a contract or goal that has since been
  archived; (2) `currentSubject(root, target_ref)` — the live normalized review subject compared with `receipt.subject_sha256`, plus the
  reviewed-path overlap count against the moved target revision; (3) `normalizedVerificationEvidence(...)` recomputed and compared with
  `receipt.verification_evidence_sha256`. The resolver covers each without weakening: it does not resolve archived paths at all — the declared
  `subject_ref` and `receipt.goal_file` must both be readable at the target repository's canonical commit or the result is
  `authority_unavailable`; and it does not re-derive the live subject or evidence, it binds the receipt's own frozen
  `subject_sha256`/`verification_evidence_sha256`/`target_revision` plus the whole receipt's byte digest into the evidence projection, so any
  movement changes `authority_revision` and stales the offer instead of producing a pass on stale evidence. The resolver additionally requires
  `receipt.target_ref` to equal the target repository's canonical target ref, which `verifyAcceptance` does not need because it anchors the
  subject on the receipt's own ref. `verifyArchiveProjectionAuthority` also stays in `verifyAcceptance`: it is an authority-home-scoped seal
  check, and the resolver treats an unreadable gate store as `authority_unavailable`.
- **`CONSUMED_RECEIPT_KEYS` is the structural guard.** It sits next to the validator and lists every `AcceptanceReceipt` key the shared function
  consumes. `tests/unit/issue-284-dependency-authority.test.ts` asserts it equals the keys of a canonical receipt fixture and then runs a
  deliberate-break probe: for each declared key it mutates exactly that field on an otherwise valid receipt and requires a refusal. A key added
  to the receipt type without a rule, or a rule silently dropped, fails that test rather than quietly widening what counts as accepted.
- **The edge/target pairing is proven at the resolver boundary, not only in the caller.** `resolveDependencyAuthority` receives the declared
  edge and the observed target as two separate inputs, and every adapter reads the target: `canonicalDone` decides purely from
  `target.task_status`. Before the guard, a caller that passed edge A with an unrelated completed target B — including a cross-repository B —
  got `satisfied`, because `authorizedRead` only resolves `dependency.repository_id` and never compared the two. The only pairing check lived in
  `src/effects/engineers/scheduling.ts#dependencyObservations`, which finds the target by the edge's identity. Leaving it there was rejected:
  the contract declares this module the closed authority for the verdict, the module is exported, injectable and unit-tested directly, and a
  second caller (an MCP tool, an operator projection, a future scheduler) would silently inherit the hole. `targetPairingRefusal` now runs after
  authorization and before any adapter and requires `target.repository_id === dependency.repository_id`,
  `target.work_package_id === dependency.work_package_id`, and exact canonical equality with the projected member of `read.graph.work_packages`
  at the canonical commit, which covers `work_package_revision`, `task_id`, `task_revision` and the row status rather than the id alone. A
  mismatch is `authority_unavailable` with `authority_revision: null` and one `dependency-target-mismatch:<repo>:<wp>` evidence ref carrying the
  digest of `{reason, declared, observed}` — the module's existing `VerifiedEvidenceRefV1` shape, no new error taxonomy. The caller-side lookup
  stays as it is: it is how the correct pair is produced, and the boundary check is what makes the pair a proven precondition of the verdict.
- **The task join site is isolated.** The publication and product adapters join to the target by `target.task_id` / `target.task_revision`
  inside `publicationIntegrated` and `productAccepted` only; issue #283 can swap the join without touching the status semantics.

## Deployment

- `acceptance-receipt` is a PROTECTED helper: `repo-harness run acceptance-receipt` resolves it from the installed global runtime, not from this
  checkout. Production repositories therefore start writing `AcceptanceVerificationObservationV1` only after the next release plus a global
  runtime refresh. Until then `module_accepted` is fail-closed `authority_unavailable` in real repositories — correct behaviour, but it must be
  reported rather than discovered: an operator who declares a `module_accepted` edge before that refresh will see the Engineer offer excluded
  with `dependency_authority_unavailable` and no observation on disk.

## Acceptance Rule Coverage On The Observation Path

Every rule in `scripts/acceptance-receipt.ts#validateAcceptanceReceiptAgainstPolicy` carries a stable id
(`ACCEPTANCE_VALIDATOR_RULE_IDS`). `src/effects/engineers/dependency-authority.ts#OBSERVATION_PATH_RULE_COVERAGE` declares, per rule, which of
three mechanisms covers it on the observation path, and a test asserts the two key sets are equal — so a rule added to the validator without a
coverage decision fails typecheck (the map is an exhaustive `Record`) and fails the test.

`record_time` is claimed only where `recordAcceptance` / `recordUserWaiverAcceptance` actually run the rule **before**
`writeAcceptanceWithArchiveProjection`; that ordering was checked rule by rule against those two functions.

| Rule | Mechanism | Why |
|------|-----------|-----|
| `receipt_protocol_kind` | record_time | `buildReceipt` hardcodes protocol 2 and the receipt kind |
| `repository_root` | resolver | `readAcceptanceVerificationObservation` requires `repository_root === realpathSync(repoPath)`; this is what defeats cross-repository replay |
| `contract_file` | subject_key | the subject key is `sha256({contract_file, contract_sha256})` and the reader compares both fields to the requested pair |
| `contract_fingerprint` | subject_key | the resolver derives the key from `authorityFingerprint(subject bytes at the canonical commit)` |
| `reviewer_policy` | record_time | `buildReceipt` sets `expected_reviewer` from the parsed contract policy, so they cannot disagree |
| `goal_file_shape` | resolver | the observation reader rejects an unsafe `goal_file` before the resolver opens it |
| `goal_fingerprint` | resolver | the resolver re-fingerprints the goal at the target repository's canonical commit against `observation.goal_sha256` |
| `verification_file_shape` | record_time | `readRegular` refuses a path that escapes the repository |
| `verification_evidence_shape` | record_time | set from `normalizedVerificationEvidence(...)`, which is a `sha256(...)` |
| `benchmark_evidence_present` | record_time | set from the same evidence pass, never empty |
| `subject_sha256_shape` | record_time | `currentSubject` fails unless the digest matches `^sha256:[0-9a-f]{64}$` |
| `subject_scope` | record_time | `buildReceipt` sets it from `context.subject.scope`, which the review subject builder pins to `src/effects/review/diff-fingerprint.ts#REVIEW_SUBJECT_SCOPE` |
| `target_ref_present` | resolver | additionally compared with the target repository's canonical target ref, which is the readable-negative case |
| `target_revision_shape` | record_time | set from the review base the policy resolved |
| `reviewed_paths_shape` | record_time | set from the subject's repository-relative diff paths |
| `summary_present` | record_time | `recordAcceptance` refuses an empty summary; the waiver path takes the grant's non-empty summary |
| `issued_at_shape` | record_time | `now().toISOString()` |
| `disposition_not_reject` | **resolver** | `validateDisposition` has a third branch that *accepts* `reject` with a matching reviewer and at least one finding, so `recordAcceptance` writes both a reject receipt and its observation. Only the resolver's passing-disposition whitelist keeps a recorded rejection out of scheduling |
| `waiver_grant_present` | record_time | `recordAcceptance` refuses `user_waiver` outright; the waiver path materializes from a verified grant |
| `waiver_policy_allowed` | record_time | `verifyUserWaiverGrant` fails when the contract forbids waivers |
| `waiver_grant_repository` | record_time | `verifyUserWaiverGrant` checks the grant's repository root |
| `waiver_grant_contract` | record_time | `verifyUserWaiverGrant` checks the grant's contract file and fingerprint |
| `waiver_grant_goal` | record_time | `verifyUserWaiverGrant` checks the grant's goal fingerprint |
| `waiver_grant_owner` | record_time | `verifyUserWaiverGrant` compares the grant actor with the contract Owner header |
| `waiver_grant_fingerprint` | record_time | `buildReceipt` sets `waiver_grant_sha256` from the verified grant |
| `waiver_binding_symmetry` | record_time | the two record paths are the only writers and each sets the pair consistently |
| `disposition_policy` | record_time | `validateDisposition` runs before `buildReceipt` in both record paths — note this proves the disposition is *policy-consistent*, not that it is *passing*, which is why `disposition_not_reject` needs its own mechanism |
| `validator_threw` | record_time | a rule that throws instead of returning (an unparseable Acceptance Policy block, a malformed input) aborts `recordAcceptance` / `recordUserWaiverAcceptance` before `writeAcceptanceWithArchiveProjection`, so no receipt and no observation are written |

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

- **The ArchContext major architecture change was accepted through the explicit approval route, not auto-applied.** Adding
  `src/effects/engineers/dependency-authority.ts` to `capability.runtime-harness.engineer-scheduling` changed the node's entrypoints,
  ownership and responsibilities, so archctx classified the projection `human-action-required` with `reasonCode: unresolved-major-change`
  (`reasonCodes: entrypoint-changed, ownership-changed, responsibility-changed`) and `verify-sprint --prepare-acceptance` refused to freeze
  acceptance. The change was approved by the orchestrator against the direction fixed in issue #284 and accepted with
  `architecture-projection accept --signal-id sha256:d8238fa3813289bf542ca90da0a0d840b452a3a41de6791fd6e19e681a82bb12
  --approval-reference event.orchestrator-approval-20260903-issue-284-dependency-authority`. As in the sibling #278 run, `accept` exited
  non-zero with `applied-reconcile-required` (post-apply worktree digest diverged from the accepted snapshot) after writing every projection
  file; the ordinary `architecture-projection apply` then converged and `architecture-projection check` reports `noop` with no human actions
  and no refresh signals. The pre-apply acceptance candidate left in the ignored store
  (`.ai/harness/architecture-projection/acceptance-candidates/`) was stale against the post-apply worktree digest and was removed after `check`
  confirmed its change was already applied. All `docs/architecture/**` content in this branch is generated output, never hand-edited.

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
