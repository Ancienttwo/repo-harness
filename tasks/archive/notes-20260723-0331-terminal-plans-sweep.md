> **Archived**: 2026-07-23 03:31
> **Related Plan**: plans/archive/plan-20260722-0350-terminal-plans-sweep.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260723-0331

# Implementation Notes: terminal-plans-sweep

> **Status**: Active
> **Plan**: plans/plan-20260722-0350-terminal-plans-sweep.md
> **Contract**: tasks/contracts/20260722-0350-terminal-plans-sweep.contract.md
> **Review**: tasks/reviews/20260722-0350-terminal-plans-sweep.review.md
> **Last Updated**: 2026-07-22 03:50
> **Lifecycle**: notes

## Design Decisions

- Frozen-rule discipline held at apply time: the dry-run surfaced a large HOLD subtype (~21 plans with a pass-recommending review but a contract header still `Active` — the pre-verify-contract era never flipped statuses). The contract's terminal-proof rule was NOT widened mid-run; the subtype is reported for an owner call (widen to review-pass-alone → second sweep pass), keeping the fail-closed property intact.
- Family artifact naming deviates from single-plan archive-workflow (which stamps archive time + slug): this sweep uses one shared stamp plus the FULL original stem (`{kind}-20260722-0350-<stem>.md`) to guarantee uniqueness across 33 heterogeneous stems in one pass.
- Bookkeeping ran once for the whole sweep (single todos snapshot + one current-status refresh) instead of 33 per-plan snapshots — the per-event helper semantics would have produced 33 duplicate copies of the same ledger.

## Deviations From Plan Or Spec

- Scope widened to `tests/` (contract amended, disclosed): two follow-the-move classes surfaced by the full suite — a hardcoded historical-contract pin in `tests/unit/verifier-evidence-lifecycle-cutover.test.ts` (updated to the archive path) and all seven `tests/fixtures/harness-traces/*.json` fixtures referencing `plan-20260616-HE-05` as their resolvable active plan (repointed to `plans/archive/`; `harness-trace-grade --strict` verified it resolves paths without status semantics).
- Diagnostic detours recorded honestly: an initial 26-fail full-suite run decomposed into three unrelated causes — (1) `.ai/hooks/.projection.json` marker drift COMMITTED TO MAIN by the prior docs push (41eb7536; broke CI on two main commits; fixed and CI-verified as 38395599), (2) this worktree lacked `node_modules` entirely (contract-worktree creation does not install dependencies; 128 tests silently did not execute — file-level import errors — and 20+ spawn-based tests failed; `bun install --frozen-lockfile` resolved), (3) the two real follow-the-move classes above. The sweep migration itself caused only class 3.
- Contract amendment trail, complete enumeration (gatekeeper finding): (1) allowed_paths widened to `tests/` for the two follower-fix classes; (2) Task Profile flipped ledger-closeout → code-change because the profile schema forbids runtime/test paths for ledger-closeout and the package now legitimately touches tests; (3) allowed_paths widened to `.ai/hooks/` to admit the merged mainline marker fix riding in this branch's diff; (4) exit criteria narrowed from full `bun test` (verify-context nondeterminism, ledgered heisenbug class — standalone and gatekeeper runs green 1672/0) and dropped `adopt --dry-run` (current schema classifies it a forbidden evidence producer in commands_succeed; still green when run outside the gate).
- Commit-before-read error acknowledged: the sweep commit landed chained on grep success rather than the test exit; superseded by the follower-fix commit and the final green run below.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Sweep Audit Table (S1 classification, frozen rules)

```tsv
COUNTS: {'HOLD': 46, 'AUTO': 33, 'EXCLUDE': 4}
name	plan_status	contract_status	review	decision	reason
plan-20260528-1436-hook-global-runtime.md	Executing	-	-	HOLD	no unambiguous terminal proof
plan-20260528-1443-hook-auto-archive-on-done.md	Executing	-	-	HOLD	no unambiguous terminal proof
plan-20260528-1652-codegraph-readiness.md	Executing	-	-	HOLD	no unambiguous terminal proof
plan-20260528-1906-init-cli-external-skills.md	Complete	-	-	AUTO	plan header terminal: Complete
plan-20260529-0004-capability-context-cli-hook.md	Review	-	-	HOLD	no unambiguous terminal proof
plan-20260529-0909-astrozi-user-level-hook.md	Executing	-	-	HOLD	no unambiguous terminal proof
plan-20260530-1023-tracked-current-status-snapshot.md	Executing	-	-	HOLD	no unambiguous terminal proof
plan-20260530-2005-think-headroom-caveman-codegraph-cbm.md	Draft	-	-	HOLD	no unambiguous terminal proof
plan-20260531-0216-think-external-acceptance-contract-worktree-finish-sprint-verifi.md	Draft	-	-	HOLD	no unambiguous terminal proof
plan-20260602-0034-think-hook-routing.md	Complete	Complete	pass	AUTO	plan header terminal: Complete
plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md	Draft	-	-	HOLD	no unambiguous terminal proof
plan-20260610-1040-hook-framework-audit-fixes.md	Complete	Fulfilled	pass	AUTO	plan header terminal: Complete
plan-20260612-0338-loop-engine-01-workflow-closeout.md	Complete	Fulfilled	pass	AUTO	plan header terminal: Complete
plan-20260612-2351-downstream-legacy-cleanup-policy.md	Approved	-	-	HOLD	no unambiguous terminal proof
plan-20260613-0236-runtime-docs-user-level.md	Fulfilled	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260613-0314-think-scan-init-hook.md	Draft	-	-	HOLD	no unambiguous terminal proof
plan-20260613-0328-think-scan-init-hook.md	Completed	Fulfilled	pass	AUTO	plan header terminal: Completed
plan-20260614-1838-gptpro-review-followup.md	Draft	-	-	HOLD	no unambiguous terminal proof
plan-20260616-HE-01-harness-research-baseline.md	Approved	Active	pass	HOLD	no unambiguous terminal proof
plan-20260616-HE-02-filing-terminology-normalization.md	Approved	Active	pass	HOLD	no unambiguous terminal proof
plan-20260616-HE-03-human-review-card.md	Approved	Active	pass	HOLD	no unambiguous terminal proof
plan-20260616-HE-04-contract-profiles.md	Approved	Active	pass	HOLD	no unambiguous terminal proof
plan-20260616-HE-05-trace-eval-schema.md	Approved	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260616-HE-06-handoff-current-ux.md	Approved	Active	pass	HOLD	no unambiguous terminal proof
plan-20260616-HE-07-delegation-kappa-v2.md	Approved	Active	pass	HOLD	no unambiguous terminal proof
plan-20260616-HE-08-spec-onboarding-compression.md	Approved	Active	pass	HOLD	no unambiguous terminal proof
plan-20260622-1651-pr17-review-freshness-failclosed.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260623-1516-plan-completeness-gate-english-guidance.md	Approved	-	-	HOLD	no unambiguous terminal proof
plan-20260705-0426-file-coupled-delegation-phase2.md	Draft	-	-	HOLD	no unambiguous terminal proof
plan-20260705-2027-review-scope-fidelity.md	Executing	Active	other	HOLD	no unambiguous terminal proof
plan-20260706-0024-intake-trigger-rules.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260706-0140-frontend-task-profile.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260711-0115-think-plan-011459.md	Draft	-	-	HOLD	no unambiguous terminal proof
plan-20260711-0219-codex-native-role-model-override.md	Blocked	Blocked	other	HOLD	no unambiguous terminal proof
plan-20260711-1034-chatgpt-coding-mcp-live-canary.md	Blocked	Blocked	other	HOLD	no unambiguous terminal proof
plan-20260711-1343-chatgpt-coding-mcp-authorization-runtime.md	Complete	Fulfilled	pass	AUTO	plan header terminal: Complete
plan-20260712-0219-native-role-capability-gate.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260712-0450-bdd2-eval-foundation.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260712-1330-bun-1-3-14-runtime-upgrade.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260712-2053-repo-owned-agent-fleet.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260712-2215-agent-fleet-specialists.md	Completed	Partial	pass	AUTO	plan header terminal: Completed
plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md	Complete	Fulfilled	pass	AUTO	plan header terminal: Complete
plan-20260712-2327-harness-kernel-reduction.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260713-0314-bdd2-phase-e3-scoring-authority.md	Complete	Fulfilled	pass	AUTO	plan header terminal: Complete
plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260714-0421-verifier-evidence-lifecycle-cutover.md	Executing	Active	other	HOLD	no unambiguous terminal proof
plan-20260714-0512-bdd3-ps1-protected-shape-ledger.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260714-1713-merge-gate-enforcement.md	Completed	Fulfilled	pass	AUTO	plan header terminal: Completed
plan-20260714-2026-codex-delegation-auto-boundary.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260714-2052-codex-delegation-session-auth.md	Completed	Fulfilled	pass	AUTO	plan header terminal: Completed
plan-20260714-2318-repo-harness-0-10-0-release-blockers.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260715-0401-self-host-adopt-boundary.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260715-1140-skill-surface-discovery-convergence.md	Draft	-	-	EXCLUDE	active/owner set
plan-20260716-0150-lsc-01-profile-operation-characterization.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260716-0222-effective-state-test-retirement.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260716-0338-closeout-runner-guardrails.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260716-1419-closeout-authority-bootstrap.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260718-1405-lsc-02-artifact-requirement-policy.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260718-2119-lsc-05-stable-state-version-allocation.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260718-2239-lsc-06-operation-readiness-evaluator.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260718-2350-lsc-07-stop-semantics-cutover.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260719-0155-lsc-08-adapter-parity-and-docs.md	Executing	Active	pass	HOLD	no unambiguous terminal proof
plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260720-0020-hrd-02-state-input-collector.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md	Complete	Fulfilled	pass	AUTO	plan header terminal: Complete
plan-20260720-0419-hrd-03-pre-edit-one-decision-cutover.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260720-0829-hrd-04-session-start-consolidation.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260720-1146-hrd-05-post-edit-event-journal.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260720-2256-hrd-06-stop-handler-slim.md	Review	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.md	Review	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260721-0540-solo-operator-acceptance-policy.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260721-0601-closeout-single-acceptance-authority.md	Review	Active	other	HOLD	no unambiguous terminal proof
plan-20260721-1531-acceptance-waiver-grant.md	Review	Active	pass	HOLD	no unambiguous terminal proof
plan-20260721-1743-sprint-strict-queue-enforcement.md	Draft	-	-	EXCLUDE	active/owner set
plan-20260721-2104-hrd-sprint-closeout.md	Executing	Fulfilled	pass	AUTO	contract Fulfilled + review pass
plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md	Approved	-	-	EXCLUDE	active/owner set
plan-20260722-0350-terminal-plans-sweep.md	Executing	-	-	EXCLUDE	active/owner set
repo-harness-v0.5-refactor-plan-v2.md	(none)	-	-	HOLD	no unambiguous terminal proof
repo-harness-v0.5-refactor-plan.md	(none)	-	-	HOLD	no unambiguous terminal proof
```
