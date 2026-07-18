# Task Review: lsc-04-revision-partition-and-progress-token

> **Status**: Complete
> **Plan**: plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md
> **Contract**: tasks/contracts/20260718-1909-lsc-04-revision-partition-and-progress-token.contract.md
> **Notes File**: tasks/notes/20260718-1909-lsc-04-revision-partition-and-progress-token.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-18 (Round 1, Claude gatekeeper substitution for external acceptance)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:b6e87a3b110291c4340d2681c190d06d52d316e8dc025b75468eba223adedafe
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a6f6516a332e7ccef3d6b3480f03b7967312dffe

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: revision partition in the state effects layer, five
  additive EffectiveStateV1 fields plus a pure progress token in the
  projector, circuit-breaker cutover to progressToken, hook_circuit_record
  sourcing in hook-input.sh + assets mirror + sanctioned projection-manifest
  digest refresh, eight test files, twelve ESA goldens (additive placeholder
  lines) plus the characterization esa_goldens hash cross-references, sprint
  base pin, and the LSC-04 envelope.
- Actual files changed: exactly the round-2-widened allowed_paths (~30 files;
  gatekeeper verified containment mechanically with comm). state_version
  allocation (`git-state-version-store.ts` and its call site) byte-identical
  to base.
- Commands passed: characterization test twice deterministic; 8-file targeted
  suite 179 pass / 0 fail; hook-source-projection 12 pass; check:type; full
  `bun test` 1640 pass / 1 skip / 0 fail; cmp hook mirrors identical;
  task-sync / architecture-sync / strict workflow checks; git diff --check;
  live `state resolve --json` emits all five new fields; independent Claude
  gatekeeper acceptance (PASS).
- Residual risks: one-shot staleness — recomposed authority_revision
  invalidates previously recorded handoff/resume "Source State Revision"
  values once at cutover (documented migration note, no shim). Accepted
  documented deviation: `CircuitDecision.state_version` echo field renamed to
  `progress_token`; gatekeeper independently verified zero consumers of the
  field name in src/, docs/, and hooks (decision consumers read only
  .allowed/.tripped), so the public-surface no-rename rule is not implicated.
  Operational note: the globally installed repo-harness binary predates the
  cutover and returns null for the new fields until reinstalled post-merge;
  the hook default fails closed meanwhile. LOOP-08 remainder (actionClass,
  oscillation detection, blockerSetHash key) explicitly deferred.
- Reviewer action required: none for the reviewed subject; ship as the
  independent LSC-04 PR against `main` from base `a6f6516a`; reinstall the
  global CLI after merge.
- Rollback: revert the independent LSC-04 PR; circuit keys return to
  stateVersion sourcing, additive fields disappear, no persisted migration to
  unwind (state-version store untouched).

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/lsc-04-revision-partition-and-progress-token` from exact execution
  base `a6f6516a` (post-LSC-03 merge plus backfill).
- P1/P2/P3 evidence: the calibrated contract maps LOOP-03/LOOP-08 (audit
  lines 348-454, 798-885), fixes the four-bucket revision partition and the
  audit-recipe progress token as data, and pins two dated regeneration
  authorizations with delta-shaped diff requirements.
- Root cause or plan evidence: not a bugfix; this package gives every
  no-progress detector a signal projection rendering cannot move.

## Verification Evidence

- Waza `/check` run: superseded by the read-only Claude gatekeeper pass
  recorded under External Acceptance Advice.
- Commands run: full Exit Criteria surface listed on the Human Review Card,
  all exit 0 in this worktree at the reviewed subject.
- Manual checks: gatekeeper re-derived the bucket composition from the diff,
  probed the live resolver, verified the projection-only invariant test
  (handoff/resume rewrite moves only projection_revision + state_revision;
  token and authority unchanged; repeat_count accumulates), confirmed
  fail-closed on empty AND omitted progressToken via the join-normalization
  test, spot-read 4 full golden diffs + add/remove scans on the other 8
  (+5/-0 each), and confirmed the characterization diff is exactly 4
  esa_goldens source_sha256 swaps.
- Supporting artifacts: revision formulas, both regeneration diff summaries,
  and the migration notes in the notes file.
- Implementation notes reviewed: yes (round-1 and round-2 sections, resolved
  open questions, deviation record).
- Run snapshot: full-suite output retained in session task log (1640 pass /
  1 skip / 0 fail).

## External Acceptance Advice

> **External Acceptance**: pass (Round 1, Claude gatekeeper substitution — mechanical `workflow_external_acceptance_pass` still fails closed regardless, per the pre-existing base-gate defect)
> **External Reviewer**: Claude
> **External Source**: claude-gatekeeper (continuation of the documented 2026-07-18 exception: the repo's normal host-aware Codex requirement cannot be met because the Codex CLI is quota-limited until 2026-08-16; see the `tasks/todos.md` solo-operator row)
> **External Started**: 2026-07-18
> **External Completed**: 2026-07-18
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:b6e87a3b110291c4340d2681c190d06d52d316e8dc025b75468eba223adedafe
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a6f6516a332e7ccef3d6b3480f03b7967312dffe
> **Benchmark Evidence SHA256**: unavailable-by-defect (fingerprint lookup returns empty despite existing `evals/harness/reports/profile-comparison.*` evidence; pre-existing base-gate defect tracked in `tasks/todos.md`, unrelated to this subject)

- P1 blockers: none. The gatekeeper reviewed the exact subject
  `sha256:b6e87a3b...` at target revision `a6f6516a` with a fresh context and
  no executor self-argument.
- P2 advisories: 2, both recorded on the Human Review Card — the accepted
  CircuitDecision echo-field rename (zero consumers, verified) and the
  post-merge global-CLI reinstall requirement (fail-closed in the interim).
- Acceptance checklist: bucket recomposition verified, allocation-code
  immutability verified (empty diff), token purity and invariant tests
  verified, fail-closed direction verified for empty and omitted tokens,
  golden discipline verified, containment verified mechanically.

## Behavior Diff Notes

- Additive fields only on the state surface; circuit repeat-count no longer
  resets on projection churn (handoff/resume/current-snapshot rewrites);
  authority_revision moves on policy/capability/sprint changes and no longer
  moves on review-subject changes; state_revision/state_version semantics
  unchanged (allocation timing is LSC-05). Edit/stop/ship verdicts untouched
  (characterization cells byte-identical).

## Residual Risks / Follow-ups

- One-shot handoff/resume recorded-revision staleness at cutover (migration
  note; self-heals on next handoff write).
- Post-merge: reinstall the global repo-harness CLI so host hooks see
  progress_token.
- LOOP-08 remainder deferred; LSC-02 advisories remain routed to LSC-06.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Four buckets + pure token implemented per the audit recipe; projection-only invariant proven at both projector and breaker levels. |
| Product depth | 9/10 | Kills the LOOP-03/LOOP-08 class of self-deceiving progress signals for every downstream detector. |
| Design quality | 9/10 | One computation site per revision; token is one deterministic hash; allocation timing cleanly left to LSC-05; fail-closed default. |
| Code quality | 9/10 | 179 targeted + full-suite green; goldens strictly additive; hook mirror cmp-identical; deviation documented with verified zero consumers. |
