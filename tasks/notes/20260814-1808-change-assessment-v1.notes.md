# Implementation Notes: change-assessment-v1

> **Status**: Active
> **Plan**: plans/plan-20260814-1808-change-assessment-v1.md
> **Contract**: tasks/contracts/20260814-1808-change-assessment-v1.contract.md
> **Review**: tasks/reviews/20260814-1808-change-assessment-v1.review.md
> **Last Updated**: 2026-08-14 20:36
> **Lifecycle**: notes

## Design Decisions

- P1 map: `.ai/harness/policy.json#worktree_strategy.review_base` is the only
  policy base; `buildReviewSubject` is the only final-subject builder.
  `verify-sprint --prepare-acceptance` invokes `scripts/change-assessment.ts`,
  which feeds the pure core assessment/selection packet into the run trace;
  `scripts/acceptance-receipt.ts` canonicalizes that exact envelope before any
  protocol-2 receipt may verify it.
- P2 trace: policy → final normalized content subject → ChangeAssessment
  (strict category, policy-base added-hunk novelty, declared contract
  oracles) → ReviewSelectionPacket → optional monotonic disagreement overlay
  → fresh `verify-sprint --prepare-acceptance` run trace → canonical
  verification-evidence hash → AcceptanceReceipt. Release trace is
  distinct: registry readback + packed tarball + clean installed CLI + installed
  hook `StateSnapshot v1` → RuntimeEvidenceReceipt.
- P3: Hooks and `.ai/harness/events.jsonl` remain excluded, fail-open
  diagnostics. Missing policy/base, a degraded subject, malformed packet, or
  missing oracle is a fail-closed prepare-acceptance result. `reviewer_disagreement`
  only appends to a packet already bound to the exact subject/target revision;
  finalization refuses a checks file until a fresh prepare rebinds that overlay.
  AcceptanceReceipt strictly recomputes the base assessment, so self-hashed
  declared assessment/packet pairs are not authority. The assessment records
  semantic final-subject and target facts, not `HEAD`, so an operational archive
  commit does not invalidate an otherwise identical semantic receipt.
- Receipt protocol remains 2: packet/evidence is added to canonical verification
  evidence rather than duplicating packet fields in `AcceptanceReceipt`.

## Deviations From Plan Or Spec

- Exact-target packet binding deliberately changes the old non-overlapping
  target-movement behavior: a moved target revision now requires fresh prepared
  verification. `tests/acceptance-receipt.test.ts` records the changed invariant.
- The current worktree contract is intentionally uncommitted, so the final
  source `verify-sprint --prepare-acceptance` run proves the packet/run trace
  but `emit-verify-evidence` returns its documented `cannot-bind` result. No
  fabricated `.ai/harness/checks/latest.json` was written; a committed candidate
  is required before semantic acceptance/merge authority can exist.

## Gatekeeper Remediation

- Oracle coverage is now per reason *and* per path: a permitted oracle that
  covers only one path of a two-path risk produces `oracle_gap` for the other.
- `change-assessment.ts escalate-disagreement` validates the current base
  contract/policy/subject before atomically writing the packet. The next
  prepare accepts only that exact monotonic overlay; finalization compares the
  latest packet with prepared checks, making old evidence/receipts stale.
- Receipt validation now performs structural assessment validation plus a fresh
  effect-level recomputation before it accepts the canonical packet hash.
- Pattern routing observes only added lines from the existing policy-base
  ReviewSubject diff; editing a pre-existing interface cannot route novelty.
- Runtime fixtures use the real `#!/usr/bin/env bun` form. Readback supplies
  only `dirname(process.execPath):/usr/bin:/bin`, proving the old PATH fails.

## Gatekeeper Round 2

- Runtime evidence now proves installed identity, not just output: package.json
  declares the two canonical bins; passed CLI/hook paths must realpath to them
  (including `.bin` symlinks), and package.json plus both bins byte-match the
  published tarball members. Same-version external stand-ins fail before their
  otherwise-valid output can count.
- Novelty now parses one rename-aware whole policy-base diff. A 100% rename
  produces no added hunk, while a rename with a new abstraction routes only the
  destination's added line. Per-path `/dev/null` comparison remains restricted
  to subject-observed untracked files.
- Existing merge-gate and evidence-attested-import fixtures now prepare the
  exact assessment/packet against their active contract and final subject before
  writing checks. Old hand-authored checks no longer bypass the strict
  recomputation boundary; moving the target invalidates prepared evidence.
- Bundled `verify-sprint` fixtures now declare a valid contract oracle. All
  local copied-helper prepare fixtures mirror the package's published `src/`
  payload, so the projected `change-assessment.ts` resolves its real core/effect
  modules instead of an incomplete fixture fallback. The multi-run worktree
  fixture ignores all `*.latest.json` runtime receipts, matching the canonical
  repository cache boundary.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Persist packet fields in AcceptanceReceipt protocol 3 | Rejected | Canonical verification evidence already has a stable hash boundary; a second receipt representation would create drift authority. |
| Use Hook journal or model scoring for selection | Rejected | Both are correlated/advisory observations, not a deterministic final-subject oracle. |
| Add release scheduler or service-auth probe | Rejected | CLI/npm package readback is the bounded approved release surface. |

## Open Questions

- None.

## Evidence Links

- Focused: `bun test tests/change-assessment.test.ts tests/runtime-evidence-receipt.test.ts tests/acceptance-receipt.test.ts tests/acceptance-receipt-evidence-fingerprint.test.ts` — 23 pass (Gatekeeper remediation); `bunx tsc --noEmit && bun test tests/change-assessment.test.ts tests/runtime-evidence-receipt.test.ts` — 14 pass; `bunx tsc --noEmit && bun test tests/merge-gate.test.ts tests/evidence-attested-import.test.ts` — 20 pass.
- Helper source: `bun test tests/helper-scripts.test.ts` — pass; `bun run check:helpers` and `bun run check:reference-configs` — pass.
- Full: `bun test --reporter=dot` — `2375 pass, 1 skip, 6 fail` across 2382
  tests after fixture synchronization. The six failures are the pre-existing
  ArchContext fake-Node assertion and five global-runtime bootstrap cases; the
  complete helper suite (123 pass) and all Change Assessment/receipt focused
  suites pass.
- Required source checks: `bun run check:type`, deploy SQL, architecture/task sync,
  source-root strict workflow, project inspector, and init dry-run — pass. The
  exact globally installed `repo-harness run check-task-workflow --strict`
  still fails only because its published package does not yet contain these two
  newly added helpers; source-root override passes. Publishing/global install is
  explicitly outside this work-package.
- Source prepare boundary: `.ai/harness/runs/run-20260814T194118-45673-20260814-1808-change-assessment-v1.json` — pass with a subject-bound ready packet; ledger materialization intentionally cannot-bind until contract commit.
- Required checks: `bun run check:type`, helper/reference projections, deploy SQL,
  architecture/task sync, strict task workflow, inspector, and init dry-run.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
