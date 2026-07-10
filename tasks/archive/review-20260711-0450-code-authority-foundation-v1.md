> **Archived**: 2026-07-11 04:50
> **Related Plan**: plans/archive/plan-20260711-0139-code-authority-foundation-v1.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260711-0450

# Task Review: code-authority-foundation-v1

> **Status**: Done
> **Plan**: `plans/plan-20260711-0139-code-authority-foundation-v1.md`
> **Contract**: `tasks/contracts/20260711-0139-code-authority-foundation-v1.contract.md`
> **Notes File**: `tasks/notes/20260711-0139-code-authority-foundation-v1.notes.md`
> **Checks File**: `.ai/harness/checks/latest.json`
> **Last Updated**: 2026-07-11 03:44 +0800
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:96f813dca55400a202c250b92320b572e95a5927b8f6e99ae08dfe2678134b0b
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass; no unresolved P0/P1 findings.
- Change type: code-change
- Intended files changed: the CO-00 through CO-08 authority, projection, archive, MCP, architecture, test, and workflow paths listed by the contract.
- Actual scope: exact tooling pins; canonical optimization rules; fail-closed capability/helper authority; deterministic helper/hook projection; pure-core dependency repair; transactional archive evidence gates; internal MCP authority extraction; retired template and stale-workflow closeout.
- External acceptance: an independent read-only Codex subagent reviewed the complete diff twice. Its first pass found four P1 issues; every issue was fixed and its second pass found no remaining P0/P1. The final timeout-only P2 was also fixed.
- Residual risk: archive rollback copies tracked workflow trees before mutation, so very large future repositories will pay a bounded local I/O cost during closeout. Correctness is preferred over partial archives; no production or database state is involved.
- Reviewer action required: none.
- Rollback: revert the bounded branch commit; no external runtime or published-package rollback is required.

## Mode Evidence

- Selected route: approved multi-agent implementation with non-overlapping ownership, followed by an independent read-only adversarial diff review.
- P1 map: `.ai/context/capabilities.json` owns capability boundaries; the workflow contract owns helper inventory; `scripts/` owns helper bytes; typed installers own host adapters; architecture modules and tracked workflow artifacts own durable closeout truth.
- P2 trace: canonical rules/config or source bytes -> resolver/projection/runtime consumer -> verification evidence -> transactional workflow/archive closeout. Missing authority fails before side effects; fallible post-mutation operations restore the live artifacts and permit retry.
- P3 decision: preserve one npm package because there is no second independently released consumer; extract only shared projection and MCP safety boundaries with real consumers/invariants; allow explicit one-shot migration while forbidding steady-state compatibility and dual authority.

## Verification Evidence

- Full repository suite before the reviewer hardening cycle: `bun test` -> 1123 pass, 1 platform skip, 0 fail, 11438 assertions across 98 files.
- Final reviewer-hardening checks:
  - `bun test tests/archive-evidence-gates.test.ts tests/architecture-queue.test.ts` -> 13 pass, 0 fail.
  - `bun test tests/hook-source-projection.test.ts` -> 7 pass, 0 fail.
  - Independent reviewer focused authority/archive/projection/workflow/run matrix -> 38 pass, 0 fail.
  - `bun run check:type`, `bun run check:hooks`, `bun run check:helpers`, `git diff --check` -> pass.
- Repository required gates: deploy SQL order, architecture sync, task sync, strict workflow, project-state inspection, self-migration dry-run, and tarball install smoke -> pass.
- Projection evidence: 25 hook files and 47 helpers are byte/mode deterministic; one explicitly declared package migration delegate remains.
- MCP evidence: the complete general-repo reader suite passed 22/22 with public schemas unchanged.
- Final contract verification reruns all contract commands, including the complete `bun test`, before Fulfilled closeout.
- Implementation notes reviewed: yes.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: Codex subagent
> **External Source**: codex-subagent
> **External Started**: 2026-07-11 03:31 +0800
> **External Completed**: 2026-07-11 03:43 +0800
> **Reviewed Diff Fingerprint**: sha256:96f813dca55400a202c250b92320b572e95a5927b8f6e99ae08dfe2678134b0b
> **Reviewed Scope**: branch+staged+unstaged+untracked

- Manual Override: cross-model reviewer availability was not present; an independent read-only Codex subagent performed two complete adversarial passes, all four first-pass P1 findings were corrected, focused regressions pass, and the final full suite is enforced by verify-sprint.
- P1 blockers: none
- P2 advisories: none. The only re-review P2 was a 5-second timeout near observed parallel runtime; the integration test now has an explicit 15-second bound and passes in 4.63 seconds.
- Acceptance checklist: pass under the recorded manual override.

## Findings Resolved

1. Added the required `Promotion Gate` and `Evidence Contract`; strict workflow validation passes.
2. Made workflow archive, architecture-request archive, and contract-worktree closeout restore live state on any fallible refresh/reindex/backfill failure; regression tests prove unchanged live state and successful retry.
3. Corrected historical No-Fallback and ArchContext one-shot archives from an unproven `Completed` outcome to truthful `Superseded` state.
4. Hardened the shared projection primitive against symlink roots, symlink ancestors, canonical path escape, and outside writes.
5. Increased the linked-worktree transaction regression timeout to an explicit 15 seconds to remove load-sensitive flakiness without changing product behavior.

## Behavior Diff Notes

- Missing or malformed capability/helper authority now fails closed; legacy directory/env/path discovery is not consulted.
- Hook and helper package copies are deterministic projections from canonical sources and contract inventory.
- Completed archives require current contract, review, verification, external-acceptance/manual-override, and architecture evidence; partial closeout rolls back.
- General-repo MCP path/identity/ignore/symlink policy moved behind an internal authority module with unchanged public tools.
- Static legacy host-adapter templates are removed; explicit migration cleanup remains one-shot and operator-invoked.

## Failing Items

- None.

## Summary

PASS. The implementation now has one authority per datum, no steady-state compatibility path, only evidence-backed abstractions, transactional closeout behavior, and regression coverage for every reviewer-discovered P1.
