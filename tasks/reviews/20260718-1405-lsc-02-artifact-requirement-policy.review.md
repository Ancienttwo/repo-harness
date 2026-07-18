# Task Review: lsc-02-artifact-requirement-policy

> **Status**: Complete
> **Plan**: plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md
> **Contract**: tasks/contracts/20260718-1405-lsc-02-artifact-requirement-policy.contract.md
> **Notes File**: tasks/notes/20260718-1405-lsc-02-artifact-requirement-policy.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-18 (Round 1, Claude gatekeeper substitution for external acceptance)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:11865fb71c59b597406b8fce071cf299a2909da2fbedb19ddc6456a0d5f7762d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 64673ee2c1148c2edfcea0afa097375898323841

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: one pure policy module, one fixture-driven test, one
  nested JSON fixture, the LSC-02 plan/contract/notes/review envelope, one
  sprint-header base pin, and the tooling-written `tasks/todos.md` timestamp.
- Actual files changed: exactly those nine allowed paths; no consumer, Hook,
  installer, script, Skill, or other production path changed, and no existing
  test or golden was edited.
- Commands passed: targeted `bun test tests/state/artifact-requirement-policy.test.ts`
  (17 pass); `bun run check:type`; full `bun test` (1632 pass / 1 skip / 0 fail,
  516s); `check-deploy-sql-order`; `check-task-sync`; `check-architecture-sync`
  (advisory, 0 blocking); `repo-harness run check-task-workflow --strict`;
  `repo-harness state resolve --json` (no blockers); `inspect-project-state`;
  `adopt --dry-run` (0 operations); `git diff --check`; consumer-import grep
  (module only); independent Claude gatekeeper acceptance (PASS).
- Residual risks: `resolve()` runtime-validates `profile`/`operation` but not
  the `risk`/`policy.require` raise inputs (unknown values fail open by
  silently not raising) — in-contract as delivered, must be closed at the
  first untyped consumer boundary (LSC-06 dispatch); no fixture exercises
  risk and policy raising the same key together (`raisedBy` ordering
  untested). The pre-existing base-gate defects tracked in `tasks/todos.md`
  (mechanical `guards.external_acceptance` fail-closed via empty benchmark
  fingerprint; 120s CLI verify wrapper watchdog; `qa_scores.code_quality`
  key mismatch) remain open and are not part of this subject.
- Reviewer action required: none for the reviewed subject; ship as the
  independent LSC-02 PR against `main` from base `64673ee2`.
- Rollback: revert the independent LSC-02 PR to restore
  `64673ee2c1148c2edfcea0afa097375898323841`; no consumer imports the module,
  so the revert is behavior-inert and needs no compatibility path.

## Mode Evidence

- Selected route: `Task Profile=code-change`, `Workflow Profile=lite`
  (deterministic risk floor, no strict-category signals), independent contract
  worktree `codex/lsc-02-artifact-requirement-policy` from exact execution
  base `64673ee2c1148c2edfcea0afa097375898323841`.
- P1/P2/P3 evidence: the calibrated contract maps the profile authority
  (`src/core/workflow/profile.ts`), the delta authority
  (`tests/state/fixtures/loop-semantics/characterization.json`), and the
  untouched consumers; traces one `resolve()` call per cell against the
  fixture; and chooses one literal matrix plus one raise rule because the
  falsifier (raise semantics needing consumer context) did not trigger.
- Root cause or plan evidence: not a bugfix; this package establishes the
  single artifact-requirement authority that LSC-03..08 cut consumers over to.

## Verification Evidence

- Waza `/check` run: superseded by the read-only Claude gatekeeper pass
  recorded under External Acceptance Advice (fresh context, evidence-only
  packet, PASS).
- Commands run: full Exit Criteria surface listed on the Human Review Card,
  all exit 0 in this worktree at the reviewed subject.
- Manual checks: matrix-to-delta 1:1 derivation re-derived independently from
  `tests/state/fixtures/loop-semantics/characterization.json`; module purity
  (sole `import type { WorkflowProfile }`); module-owned edit/stop/ship axis;
  zero consumer imports (`grep -rn artifact-requirement-policy src/`); zero
  readiness fields; `tests/state/adapter-parity.test.ts` fixture enumeration
  confirmed to exclude the `loop-semantics/` subdirectory.
- Supporting artifacts: derivation tables in the notes file; fixture with 9
  positive and 7 negative cases.
- Implementation notes reviewed: yes (cell -> record derivation, raise-key
  derivation, 4-parameter `resolve` narrowing rationale).
- Run snapshot: full-suite output retained in session task log (1632 pass /
  1 skip / 0 fail, 516.62s).

## External Acceptance Advice

> **External Acceptance**: pass (Round 1, Claude gatekeeper substitution — mechanical `workflow_external_acceptance_pass` still fails closed regardless, per the pre-existing base-gate defect)
> **External Reviewer**: Claude
> **External Source**: claude-gatekeeper (continuation of the documented 2026-07-18 exception: the repo's normal host-aware Codex requirement cannot be met because the Codex CLI is quota-limited until 2026-08-16 — probed this session with `codex exec`, which returned only the usage-limit error; see the `tasks/todos.md` solo-operator row)
> **External Started**: 2026-07-18
> **External Completed**: 2026-07-18
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:11865fb71c59b597406b8fce071cf299a2909da2fbedb19ddc6456a0d5f7762d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 64673ee2c1148c2edfcea0afa097375898323841
> **Benchmark Evidence SHA256**: unavailable-by-defect (the fingerprint lookup returns empty even when `evals/harness/reports/profile-comparison.*` evidence exists; pre-existing base-gate defect tracked in `tasks/todos.md`, unrelated to this subject)

- P1 blockers: none. The gatekeeper reviewed the exact subject
  `sha256:11865fb7...` at target revision `64673ee2` with a fresh context and
  no executor self-argument in its packet, re-deriving all nine matrix cells
  from the frozen fixture rather than trusting the notes' claim.
- P2 advisories: 2.
  - `src/core/workflow/artifact-requirement-policy.ts:196,205` — `risk` and
    `policy.require` are fail-open for unknown values (no runtime rejection);
    close at the first untyped consumer boundary in LSC-06.
  - `tests/state/fixtures/loop-semantics/artifact-requirement-policy.json` —
    no case covers risk and policy raising the same key together; add the
    combined-raise fixture in a later package.
- Acceptance checklist: subject re-derived, purity verified, consumer
  isolation verified, behavior-inertness verified, allowed-paths containment
  verified, verification commands re-run (targeted test, typecheck, root
  checks, strict workflow check, `git diff --check`).

## Behavior Diff Notes

- Additive only: the module exists with total 9-cell coverage and no caller.
  No observable behavior of any CLI, Hook, MCP, Skill, or test changes; full
  `bun test` passes with zero edits to existing tests or goldens.

## Residual Risks / Follow-ups

- Carry both P2 advisories into the LSC-06 dispatch packet (raise-input
  validation at the first untyped boundary; combined risk+policy fixture).
- The three base-gate infra defects and the solo-operator external-acceptance
  gap remain tracked in `tasks/todos.md`; they gate the mechanical
  `verify-sprint` surface, not this subject.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All nine cells resolve exactly per the frozen target deltas; raise rule covers risk outrank and selective policy raise; invalid inputs rejected, not defaulted. |
| Product depth | 8/10 | Establishes the single requirement authority the LSC cutover sequence consumes; deliberately ships zero consumer value on its own, per the one-package-per-boundary program design. |
| Design quality | 9/10 | Literal mapped-type matrix makes totality compile-time checked; module-owned operation axis avoids the WorkflowOperationKind trap; no helper abstraction or shadow evaluator. |
| Code quality | 9/10 | Pure module, fixture-driven test with duplicate-cell guard and axis-confusion probe, full derivation notes, typecheck and full suite green. |
