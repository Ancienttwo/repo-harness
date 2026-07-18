# Task Review: lsc-03-standard-contract-semantic-cutover

> **Status**: Complete
> **Plan**: plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md
> **Contract**: tasks/contracts/20260718-1531-lsc-03-standard-contract-semantic-cutover.contract.md
> **Notes File**: tasks/notes/20260718-1531-lsc-03-standard-contract-semantic-cutover.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-18 (Round 1, Claude gatekeeper substitution for external acceptance)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:ed8180aeec388107c6539f785e0fef6092a3c3573c16ae8110992ec0439bc60b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 3c9cf80a04ef5dcd6c4cababbe49c2f202fd61c1

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: one production file (the profile-aware
  `missing_contract` decision), one re-anchored test file with new
  regressions, two golden fixtures regenerated through their own sanctioned
  mechanisms plus the authorized in-test current literal, one sprint-header
  base pin, and the LSC-03 plan/contract/notes/review envelope.
- Actual files changed: exactly the contract's allowed paths (7 modified + 4
  untracked envelope files); `.ai/hooks/`, `assets/`, `scripts/`,
  `tests/state/cli-state-golden.test.ts` all byte-identical to base
  (gatekeeper verified the Strict guard block by hash on both sides).
- Commands passed: characterization test deterministic across repeated runs;
  `cli-state-golden` 13 pass; effective-state + project-effective-state +
  state-command 60 pass / 0 fail; `bun run check:type`; full `bun test`
  (1635 pass / 1 skip / 0 fail); task-sync, architecture-sync, strict
  workflow check; `git diff --check`; independent Claude gatekeeper
  acceptance (PASS, 8 synthetic probes).
- Residual risks: documented behavior change — lite with an approved plan and
  no contract also flips from blocked to allowed via the policy's
  absent-entry path; mandated by the contract's decision rule, consistent
  with the frozen lite.edit delta ("without adding plan or contract
  ceremony"), pinned by a new regression test, and recorded in the migration
  note. Pre-existing `lite.edit` characterization flake observed at baseline
  (1 of 3 runs, pre-change) — recorded, out of scope, did not recur in any
  post-change run. The base-gate defects tracked in `tasks/todos.md` remain
  open and are not part of this subject.
- Reviewer action required: none for the reviewed subject; ship as the
  independent LSC-03 PR against `main` from base `3c9cf80a`.
- Rollback: revert the independent LSC-03 PR to restore `3c9cf80a`; the
  policy module returns to consumer-free and Standard returns to the
  characterized collapse; no compatibility path required.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/lsc-03-standard-contract-semantic-cutover` from exact execution base
  `3c9cf80a` (post-LSC-02 merge plus sprint backfill).
- P1/P2/P3 evidence: the calibrated contract maps the contradiction (audit
  LOOP-01: CEREMONY_GUIDANCE Standard text vs the unconditional
  missing_contract blocker), traces the single consumer call
  (`resolve({ profile, operation: 'edit' })`), and records the two dated
  golden-regeneration authorizations with delta-shaped diff requirements.
- Root cause or plan evidence: not a bugfix; first consumer cutover of the
  LSC-02 requirement authority, fulfilling the frozen standard.edit
  approved_target_delta.

## Verification Evidence

- Waza `/check` run: superseded by the read-only Claude gatekeeper pass
  recorded under External Acceptance Advice.
- Commands run: full Exit Criteria surface listed on the Human Review Card,
  all exit 0 in this worktree at the reviewed subject.
- Manual checks: gatekeeper re-verified with 8 synthetic probes (strict
  blocks / standard allows / lite allows / fail-closed on unresolvable
  profile / contract-present unchanged in both profiles); golden diffs
  checked hunk-by-hunk against the authorization (characterization.json:
  standard.edit current block + esa_goldens cross-reference only;
  approved_target_delta and baseline SHA bytes untouched; test file: only
  the authorized 866-880 literal; missing-contract.json: only the approved
  flip fields); consumer makes one resolve() call with no matrix
  re-derivation or profile-name branching.
- Supporting artifacts: field-level diff summaries and the regeneration
  ordering note (esa_goldens cross-reference regenerated after the ESA
  golden was final) in the notes file.
- Implementation notes reviewed: yes (decision records for both
  authorization rounds, migration note per sprint DoD, external Skill
  guidance surface note, flake observation).
- Run snapshot: full-suite output retained in session task log (1635 pass /
  1 skip / 0 fail).

## External Acceptance Advice

> **External Acceptance**: pass (Round 1, Claude gatekeeper substitution — mechanical `workflow_external_acceptance_pass` still fails closed regardless, per the pre-existing base-gate defect)
> **External Reviewer**: Claude
> **External Source**: claude-gatekeeper (continuation of the documented 2026-07-18 exception: the repo's normal host-aware Codex requirement cannot be met because the Codex CLI is quota-limited until 2026-08-16; see the `tasks/todos.md` solo-operator row)
> **External Started**: 2026-07-18
> **External Completed**: 2026-07-18
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:ed8180aeec388107c6539f785e0fef6092a3c3573c16ae8110992ec0439bc60b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 3c9cf80a04ef5dcd6c4cababbe49c2f202fd61c1
> **Benchmark Evidence SHA256**: unavailable-by-defect (fingerprint lookup returns empty despite existing `evals/harness/reports/profile-comparison.*` evidence; pre-existing base-gate defect tracked in `tasks/todos.md`, unrelated to this subject)

- P1 blockers: none. The gatekeeper reviewed the exact subject
  `sha256:ed8180ae...` at target revision `3c9cf80a` with a fresh context and
  no executor self-argument, probing the production change directly and
  checking every golden hunk against the contract's authorization.
- P2 advisories: none new. The lite.edit flip is a documented, delta-consistent
  behavior change (see Residual risks), not a defect. The LSC-02 advisories
  (raise-input validation; combined-raise fixture) remain routed to LSC-06.
- Acceptance checklist: production probes, Strict guard hash comparison,
  golden hunk audit, allowed-paths containment, targeted suites, typecheck,
  root checks — all verified this round.

## Behavior Diff Notes

- Standard (and lite) approved/executing plan without a separate contract:
  `missing_contract` no longer emitted; phase follows plan status; PreEdit's
  WorkflowProfileGuard collapse disappears derivatively. Strict identical to
  before. Contract-present states identical to before. Ship and Stop
  surfaces untouched (fixture ship/stop cells unchanged). Migration note in
  the notes file.

## Residual Risks / Follow-ups

- Lite flip documented above; pinned by regression test.
- LSC-06 carries the two LSC-02 advisories.
- Base-gate infra defects and the solo-operator external-acceptance gap stay
  tracked in `tasks/todos.md`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Approved delta implemented exactly; strict/lite/standard/fail-closed all probe-verified; goldens deterministic. |
| Product depth | 9/10 | Resolves the audit's LOOP-01 contradiction — profile stops being a ceremony label and starts deciding artifact policy through the single authority. |
| Design quality | 9/10 | One resolve() call site, no matrix re-derivation, hooks untouched by design; golden double-lock honored with loud, delta-shaped diffs. |
| Code quality | 9/10 | Minimal production diff, re-anchored tests plus four new regressions, regeneration ordering handled and documented. |
