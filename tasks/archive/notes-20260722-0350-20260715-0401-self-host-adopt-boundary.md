# Implementation Notes: self-host-adopt-boundary

> **Status**: Active
> **Plan**: plans/plan-20260715-0401-self-host-adopt-boundary.md
> **Contract**: tasks/contracts/20260715-0401-self-host-adopt-boundary.contract.md
> **Review**: tasks/reviews/20260715-0401-self-host-adopt-boundary.review.md
> **Last Updated**: 2026-07-15 04:01
> **Lifecycle**: notes

## Design Decisions

- Standard downstream adoption is not a valid maintenance surface for the repo-harness source checkout; source-owned workflow surfaces are maintained directly and through projection checks.
- Source-checkout identity must be derived from the canonical package shape, not equality with the running package directory, because installed and checkout runtimes live at different paths.
- The shared predicate will serve planner, cleanup, and setup-check consumers so they cannot drift independently.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Compare target to running package path | Reject | Fails whenever the CLI is globally installed. |
| Detect only `package.json#name` | Reject | A name collision would suppress legitimate downstream adoption. |
| Require canonical package name, bin map, and source authority files | Adopt | Stable across installed/check-out runtime separation and narrow enough to avoid name-only false positives. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/20260715-self-host-adopt-boundary-pre-fix.log` records the missing shared predicate and the setup-check false positive with `PRE_FIX_EXIT=1`.
- Focused post-fix tests: `bun test tests/cli/adoption-plan.test.ts tests/cli/init-hook.test.ts` passed 40 tests.
- README onboarding regression: the first full suite exposed a self-host-coupled README DX fixture; moving that assertion to a disposable downstream repository preserves its onboarding contract. The expanded focused run passed 48 tests.
- Installed-runtime proof: a disposable global install from the branch tarball returned `plannedTotal=0` for source-checkout adopt and emitted no `repo.adopt-refresh` action.
- Full repository test: `bun test` passed 1476 tests, skipped 1 platform-specific test, and failed 0 in 501.78 seconds.
- Required checks: deploy SQL ordering, architecture sync, task sync, strict workflow check, project inspection, typecheck, and `git diff --check` all passed.
- Source runtime proof: `adopt --repo . --dry-run --json` returned `plannedTotal=0`; `setup check --target codex --check-updates --json` reported `repo.adopt-refresh=na` with no adopt action.
- CodeGraph proof: local and global CLI version `1.4.1`; the worktree index was initialized, synchronized, and read back as `up-to-date`; Codex and Claude MCP configurations were both detected.
- GitHub proof: PR #78 first candidate `6cac4211` passed both Test jobs and all six push/pull-request MCP matrix jobs (8/8 checks green).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
