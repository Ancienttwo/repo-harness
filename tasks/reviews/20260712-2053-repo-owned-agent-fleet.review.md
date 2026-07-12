# Task Review: repo-owned-agent-fleet

> **Status**: Done
> **Plan**: plans/plan-20260712-2053-repo-owned-agent-fleet.md
> **Contract**: tasks/contracts/20260712-2053-repo-owned-agent-fleet.contract.md
> **Notes File**: tasks/notes/20260712-2053-repo-owned-agent-fleet.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 21:23
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:7800989d7c497afd6830d29b6c1f9d58e4f58c757f65b1cf9060fb9c58d40390
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: repo-owned fleet source, deterministic Claude/Codex projections, installer/tooling/policy seeds and mirrors, focused tests, docs, and workflow/architecture closeout artifacts listed by the contract.
- Actual files changed: 39 allowed-path entries including untracked workflow artifacts and four `agents/fleet/*.md` sources; no package manifest, lockfile, `archctx-contracts`, or unrelated primary-worktree WIP was absorbed.
- Commands passed: focused suite (58 pass), full suite (1141 pass / 1 skip / 0 fail), typecheck, helper parity, package dry run, temporary-HOME source/package install smokes, deploy SQL, architecture sync, task sync, strict workflow, inspector, and adopt dry-run.
- External acceptance: pass. Codex pre-review found one stale `tasks/todos.md` count, which was fixed; the required Claude cross-review then returned `No P1 or P2 findings.`
- Residual risks: Codex CLI 0.141.0 has no automatable interactive `/agent` introspection; the deferred ledger retains one bounded interactive confirmation.
- Reviewer action required: none.
- Rollback: revert the work-package commit and reinstall the prior fleet; no schema or user-data migration exists.

## Mode Evidence

- Selected route: isolated contract worktree, one read-only authority-map pass, sequential implementation, independent read-only exit review.
- P1/P2/P3 evidence: P1 establishes `agents/fleet/*.md` as the only packaged authority; P2 traces helper source path to four-source preflight to eight host projections and tooling drift checks; P3 removes remote/override/compatibility authority and keeps only deterministic repo-owned generation.
- Root cause or plan evidence: the prior installer depended on an upstream source that did not publish the accepted explorer role, while fixture overrides hid the real package/runtime failure; see the plan `Why`, `Agentic Routing`, and `Detailed Design` sections.

## Verification Evidence

- Waza `/check` run: represented by the contract pipeline plus an independent read-only Codex exit review.
- Commands run: `bun test` (1141 pass / 1 skip / 0 fail); focused four-file suite (58 pass); `bun run check:type`; `bun run check:helpers`; `npm pack --dry-run --json`; temporary-HOME source and packaged helper smokes (8 files each); all root required checks.
- Manual checks: active fleet runtime/policy has no `Fable-agents`, `fable_agents`, source override, fleet curl, or `fable` model alias; gatekeeper is read-only; four Claude sources equal their repo-owned authority and four Codex TOMLs carry the expected Sol/Luna model, effort, and sandbox modes.
- Supporting artifacts: archived architecture requests, two updated architecture modules, capability workstreams, `.ai/harness/checks/latest.json`, and `.ai/harness/runs/`.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/runs/run-20260712T215138-4344-20260712-2053-repo-owned-agent-fleet.json` — contract, review, external acceptance, and allowed-path guards all pass.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-12T21:46:00+08:00
> **External Completed**: 2026-07-12T21:48:47+08:00
> **Reviewed Diff Fingerprint**: sha256:7800989d7c497afd6830d29b6c1f9d58e4f58c757f65b1cf9060fb9c58d40390
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: none. Claude noted that the deterministic `haiku -> Luna` mapping is currently unused and not directly exercised by a role, without raising it as a finding.
- Acceptance checklist: pass — single packaged authority, four-role projections, fail-closed source preflight, no remote/override authority, read-only gatekeeper, helper parity, package inclusion, allowed-path fidelity, and no unrelated dependency diff.

## Behavior Diff Notes

- Source authority changes from remote Fable files to npm-packaged `agents/fleet/*.md`.
- Installer preflights all four sources before any HOME mutation and supports only the source-tree and packaged-helper layouts.
- Tooling drift reads local packaged authority; Codex generation is proven by golden installer tests.
- Gatekeeper no longer promises edits, commits, pushes, PR operations, merges, or release execution.

## Residual Risks / Follow-ups

- One deferred, non-blocking interactive Codex `/agent` load check remains because CLI 0.141.0 exposes no automatable introspection surface.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Source/package smokes and focused/full tests pass. |
| Product depth | 9/10 | Distribution, policy, drift, docs, and failure modes share one authority. |
| Design quality | 10/10 | No fallback, alias, alternate source, or dual authority remains. |
| Code quality | 10/10 | Deterministic projections, fail-closed validation, mirrored helpers, focused regression coverage. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test`; root required-check block; focused fleet suite; package and temporary-HOME smokes.
- Re-check: `rg` active fleet surfaces for Fable/override/curl residues and compare helper/projection parity.

## Summary

- PASS. The repository now owns and packages the four-role agent fleet; all active runtime, policy, installation, drift, projection, documentation, architecture, and workflow surfaces agree on that authority.
