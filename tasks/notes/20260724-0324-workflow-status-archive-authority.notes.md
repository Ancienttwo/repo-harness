# Implementation Notes: workflow-status-archive-authority

> **Status**: Active
> **Plan**: plans/plan-20260724-0324-workflow-status-archive-authority.md
> **Contract**: tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md
> **Review**: tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md
> **Last Updated**: 2026-07-24 03:24
> **Lifecycle**: notes

## Design Decisions

- The policy keeps `active_plan.statuses` as the ordered known-value authority
  and adds four lifecycle anchors. Consumers project pre-approval and terminal
  subsets from that ordered array; the anchors must be adjacent/ordered and
  every anchor must resolve inside the array or all consumers fail closed.
- Historical evidence is never an implicit fallback from stale current checks.
  Operators must select `archive-workflow --evidence-mode sealed-terminal`;
  default `current` mode retains the existing checks + AcceptanceReceipt path.
- The sealed predicate is shared by the classifier and archive helper and is
  exact: contract header `Fulfilled`, review `Recommendation: pass`, and a
  structurally valid typed `Acceptance Receipt Projection` with bound identity,
  subject, target, verification hash, and issue time.
- The 61-plan historical population produced zero AUTO rows. This is a valid
  fail-closed result, not a reason to reinterpret `Done`/`Active`, accept legacy
  External Acceptance prose, or synthesize receipts. No historical artifact was
  moved; the current package plan is the single EXCLUDE row.

## Deviations From Plan Or Spec

- The approved sweep archived zero plans because none satisfied all three
  sealed-terminal conditions. The package still completed the full 61-row
  classification and implemented the owner-selected archive model.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Treat contract `Done` as `Fulfilled` | Rejected | The owner-approved model named exact `Fulfilled`; semantic translation would be unauthorized compatibility behavior. |
| Treat old `External Acceptance: pass` prose as a typed receipt | Rejected | It lacks the receipt identity and binding fields and would synthesize authority. |
| Automatically fall back from current checks to sealed history | Rejected | Explicit evidence mode keeps live and historical closeout semantics observable and fail closed. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Classification JSON: `.ai/harness/runs/20260724-0324-workflow-status-archive-authority/classification.json`
- Classification TSV: `.ai/harness/runs/20260724-0324-workflow-status-archive-authority/classification.tsv`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Historical Classification Audit

- Root plans scanned: 62.
- Current package excluded: 1.
- Historical plans classified: 61.
- AUTO: 0; HOLD: 61; EXCLUDE: 1.
- Apply result: no historical moves.

```tsv
plan	plan_status	contract	contract_status	review	review_recommendation	receipt_recorded	decision	reason
plans/plan-20260528-1436-hook-global-runtime.md	Executing	tasks/contracts/hook-global-runtime.contract.md	Partial	tasks/reviews/hook-global-runtime.review.md	pass for Phase 0 operational smoke (canary prep + real host smoke + Codex user acceptance); 5 advisory micro-tests deferred; Phase 1 CLI implementation still open	false	HOLD	contract status is Partial, not Fulfilled
plans/plan-20260528-1443-hook-auto-archive-on-done.md	Executing	tasks/contracts/hook-auto-archive-on-done.contract.md	Fulfilled	tasks/reviews/hook-auto-archive-on-done.review.md	pass	false	HOLD	typed Acceptance Receipt Projection missing or incomplete
plans/plan-20260528-1652-codegraph-readiness.md	Executing	tasks/contracts/codegraph-readiness.contract.md	Fulfilled	tasks/reviews/codegraph-readiness.review.md	pass	false	HOLD	typed Acceptance Receipt Projection missing or incomplete
plans/plan-20260529-0004-capability-context-cli-hook.md	Review	tasks/contracts/capability-context-cli-hook.contract.md	Fulfilled	tasks/reviews/capability-context-cli-hook.review.md	pass	false	HOLD	typed Acceptance Receipt Projection missing or incomplete
plans/plan-20260529-0909-astrozi-user-level-hook.md	Executing	tasks/contracts/astrozi-user-level-hook.contract.md	Active	tasks/reviews/astrozi-user-level-hook.review.md	fail	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260530-1023-tracked-current-status-snapshot.md	Executing	tasks/contracts/tracked-current-status-snapshot.contract.md	Active	tasks/reviews/tracked-current-status-snapshot.review.md	fail	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260530-2005-think-headroom-caveman-codegraph-cbm.md	Draft	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/think-headroom-caveman-codegraph-cbm.contract.md
plans/plan-20260531-0216-think-external-acceptance-contract-worktree-finish-sprint-verifi.md	Draft	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/think-external-acceptance-contract-worktree-finish-sprint-verifi.contract.md
plans/plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md	Draft	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.contract.md
plans/plan-20260612-2351-downstream-legacy-cleanup-policy.md	Approved	-	-	-	-	false	HOLD	declared contract is invalid or missing: (not used; inline dirty-tree slice)
plans/plan-20260613-0314-think-scan-init-hook.md	Draft	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/20260613-0314-think-scan-init-hook.contract.md
plans/plan-20260614-1838-gptpro-review-followup.md	Draft	-	-	-	-	false	HOLD	contract missing or ambiguous
plans/plan-20260616-HE-01-harness-research-baseline.md	Approved	tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md	Active	tasks/reviews/20260616-HE-01-harness-research-baseline.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260616-HE-02-filing-terminology-normalization.md	Approved	tasks/contracts/20260616-HE-02-filing-terminology-normalization.contract.md	Active	tasks/reviews/20260616-HE-02-filing-terminology-normalization.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260616-HE-03-human-review-card.md	Approved	tasks/contracts/20260616-HE-03-human-review-card.contract.md	Active	tasks/reviews/20260616-HE-03-human-review-card.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260616-HE-04-contract-profiles.md	Approved	tasks/contracts/20260616-HE-04-contract-profiles.contract.md	Active	tasks/reviews/20260616-HE-04-contract-profiles.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260616-HE-06-handoff-current-ux.md	Approved	tasks/contracts/20260616-HE-06-handoff-current-ux.contract.md	Active	tasks/reviews/20260616-HE-06-handoff-current-ux.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260616-HE-07-delegation-kappa-v2.md	Approved	tasks/contracts/20260616-HE-07-delegation-kappa-v2.contract.md	Active	tasks/reviews/20260616-HE-07-delegation-kappa-v2.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260616-HE-08-spec-onboarding-compression.md	Approved	tasks/contracts/20260616-HE-08-spec-onboarding-compression.contract.md	Active	tasks/reviews/20260616-HE-08-spec-onboarding-compression.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260622-1651-pr17-review-freshness-failclosed.md	Executing	tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md	Active	tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260623-1516-plan-completeness-gate-english-guidance.md	Approved	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/20260623-1516-plan-completeness-gate-english-guidance.contract.md
plans/plan-20260705-0426-file-coupled-delegation-phase2.md	Draft	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/20260705-0426-file-coupled-delegation-phase2.contract.md
plans/plan-20260705-2027-review-scope-fidelity.md	Executing	tasks/contracts/20260705-2027-review-scope-fidelity.contract.md	Active	tasks/reviews/20260705-2027-review-scope-fidelity.review.md	fail	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260711-0115-think-plan-011459.md	Draft	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/20260711-0115-think-plan-011459.contract.md
plans/plan-20260711-0219-codex-native-role-model-override.md	Blocked	tasks/contracts/20260711-0219-codex-native-role-model-override.contract.md	Blocked	tasks/reviews/20260711-0219-codex-native-role-model-override.review.md	fail	false	HOLD	contract status is Blocked, not Fulfilled
plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md	Blocked	tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md	Blocked	tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md	fail	false	HOLD	contract status is Blocked, not Fulfilled
plans/plan-20260712-0450-bdd2-eval-foundation.md	Executing	tasks/contracts/20260712-0450-bdd2-eval-foundation.contract.md	Active	tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md	Executing	tasks/contracts/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.contract.md	Active	tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md	Executing	tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md	Active	tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md	Executing	tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md	Active	tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md	fail	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md	Executing	tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md	Active	tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260715-1140-skill-surface-discovery-convergence.md	Done	tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md	Done	tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md	Executing	tasks/contracts/20260716-0150-lsc-01-profile-operation-characterization.contract.md	Active	tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260716-0222-effective-state-test-retirement.md	Executing	tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md	Active	tasks/reviews/20260716-0222-effective-state-test-retirement.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260716-0338-closeout-runner-guardrails.md	Executing	tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md	Active	tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260716-1419-closeout-authority-bootstrap.md	Executing	tasks/contracts/20260716-1419-closeout-authority-bootstrap.contract.md	Active	tasks/reviews/20260716-1419-closeout-authority-bootstrap.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md	Executing	tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md	Active	tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md	Executing	tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md	Active	tasks/reviews/20260718-1531-lsc-03-standard-contract-semantic-cutover.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md	Executing	tasks/contracts/20260718-1909-lsc-04-revision-partition-and-progress-token.contract.md	Active	tasks/reviews/20260718-1909-lsc-04-revision-partition-and-progress-token.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md	Executing	tasks/contracts/20260718-2119-lsc-05-stable-state-version-allocation.contract.md	Active	tasks/reviews/20260718-2119-lsc-05-stable-state-version-allocation.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260718-2239-lsc-06-operation-readiness-evaluator.md	Executing	tasks/contracts/20260718-2239-lsc-06-operation-readiness-evaluator.contract.md	Active	tasks/reviews/20260718-2239-lsc-06-operation-readiness-evaluator.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md	Executing	tasks/contracts/20260718-2350-lsc-07-stop-semantics-cutover.contract.md	Active	tasks/reviews/20260718-2350-lsc-07-stop-semantics-cutover.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md	Executing	tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md	Active	tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md	pass	false	HOLD	contract status is Active, not Fulfilled
plans/plan-20260721-0601-closeout-single-acceptance-authority.md	Review	tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md	Active	tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md	fail	true	HOLD	contract status is Active, not Fulfilled
plans/plan-20260721-1531-acceptance-waiver-grant.md	Review	tasks/contracts/20260721-1531-acceptance-waiver-grant.contract.md	Active	tasks/reviews/20260721-1531-acceptance-waiver-grant.review.md	pass	true	HOLD	contract status is Active, not Fulfilled
plans/plan-20260721-1743-sprint-strict-queue-enforcement.md	Draft	-	-	-	-	false	HOLD	declared contract is invalid or missing: tasks/contracts/20260721-1743-sprint-strict-queue-enforcement.contract.md
plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md	Executing	tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md	Verified	tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md	pass — all machine checks green (focused suite, full repository suite, and every root-required check including `check-task-workflow --strict`); awaiting external review and a typed AcceptanceReceipt	true	HOLD	contract status is Verified, not Fulfilled
plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md	Executing	tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md	Active	tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md	fail	true	HOLD	contract status is Active, not Fulfilled
plans/plan-20260722-0308-helper-source-path-env-leak.md	Executing	tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md	Active	tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md	fail	true	HOLD	contract status is Active, not Fulfilled
plans/plan-20260722-0538-receipt-subject-target-split.md	Approved	tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md	Active	tasks/reviews/20260722-0538-receipt-subject-target-split.review.md	fail	true	HOLD	contract status is Active, not Fulfilled
plans/plan-20260722-1107-epc-00-program-canonicalization.md	Executing	tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md	Done	tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260722-1151-epc-01-evidence-event-store.md	Executing	tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md	Done	tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md	Executing	tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md	Done	tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260722-1810-epc-03-postbash-observed-importer.md	Executing	tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md	Done	tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260722-1810-epc-04-manual-external-attested-import.md	Executing	tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md	Done	tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260722-1929-epc-05-checks-latest-materializer.md	Executing	tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md	Done	tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260722-2156-epc-06-checkpoint-materialization.md	Executing	tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md	Done	tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260722-2246-epc-07-recovery-view-cutover.md	Executing	tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md	Done	tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260723-0024-epc-08-context-packet-cutover.md	Executing	tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md	Done	tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260723-0144-epc-09-drift-eval-release.md	Executing	tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md	Done	tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260723-0620-hook-guard-stability.md	Executing	tasks/contracts/20260723-0620-hook-guard-stability.contract.md	Done	tasks/reviews/20260723-0620-hook-guard-stability.review.md	pass	true	HOLD	contract status is Done, not Fulfilled
plans/plan-20260724-0324-workflow-status-archive-authority.md	Executing	tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md	Active	tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md	fail	false	EXCLUDE	current active plan
```

## Final Gate Correction

- The first frozen `verify-sprint --prepare-acceptance` run failed three rows.
- The hook source change had correctly regenerated `.ai/hooks/.projection.json`,
  but the generated marker was not yet committed or declared in `allowed_paths`;
  this also made `check-task-sync.sh` see an unsynchronized worktree-only change.
- `bun src/cli/index.ts adopt --repo . --dry-run` is a required root check but
  `verify-contract.sh` deliberately rejects every `adopt` command as an evidence
  producer. It is therefore retained as an explicit manual check and executed
  once outside the contract verifier, rather than weakened or disguised.
- Manual result: exit 0, `0 total, 0 planned, 0 skipped`, with the expected
  self-host warning that downstream adopt is not applicable.
- The focused `bun test --bail` diagnosis found the full-suite failure in
  `tests/skill-surface/retired-names-scan.test.ts`: the new classifier uses
  the permanent AcceptanceReceipt source enum values `codex-review` and
  `claude-review`, which the retired Skill-name sweep intentionally permits
  only in its exact provenance-enum file list. Both synchronized classifier
  copies are now listed there; no routing alias or compatibility spelling was
  introduced.
- The second frozen gate passed every root check except `bun test` and the
  manual-evidence projection. The manual command was already green; its exact
  checked review projection is now recorded. The remaining full-suite failure
  occurs after the retired-name scan and is captured in the final diagnostic
  run log before the third and last gate.
- The captured diagnostic full suite then passed: 2053 pass, 1 skip, 0 fail
  in 494.75 seconds. Its SHA-256 is
  `12912e10c668ba818b9706aae5dd70e6db50104d761ffab6968f10fbb008dfb8`.
  Per the no-duplicate-expensive-evidence rule, the final contract gate treats
  that frozen-source run as exact checked manual evidence and verifies the log
  artifact instead of running the same eight-minute suite a fourth time.
- The final prepare gate then reached ContractVerify 14/14; its sole outer
  failure was an omitted exact allowed path for
  `src/core/adoption/standard-plan.ts`, already part of the committed policy
  projection change. The contract now declares that real scope explicitly.
- Final prepared verification passed with ContractVerify 14/14, review pass,
  allowed paths pass, and authoritative `checks/latest.json` materialization.
  Codex recorded an `external_pass` receipt with no findings; finalization
  reused the prepared evidence without rerunning tests.
