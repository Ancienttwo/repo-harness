# Task Review: lsc-08-adapter-parity-and-docs

> **Status**: Complete
> **Plan**: plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md
> **Contract**: tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md
> **Notes File**: tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-19 (Round 1, Claude gatekeeper substitution for external acceptance)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:8a0fc0f759565fc7b49fb400b9f9696d060b228be96e045708f45103638993d0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 89f75d8a0ef45154d38589441b516586b1167060

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: MCP compact state completion (readiness +
  guidance), the four-adapter parity proof, the recalibrated
  characterization probe with delta-shaped shrinkage, the two carried
  LSC-07 follow-ups (fixture CLI-pinning; scalar-readiness guard), the docs
  parity contract, sprint base pin, and the LSC-08 envelope.
- Actual files changed: 10 modified + 4 untracked, all within allowed_paths
  (`tests/cli/mcp-tools.test.ts` needed no change — the only compact-shape
  pin lives in adapter-parity's MCP_COMPACT_FIELDS, which was extended);
  pre-edit-guard.sh, scripts/, and all flat ESA goldens empty diffs.
- Commands passed: parity + mcp-tools + hook tests 83 pass / 0 fail with
  AMBIENT PATH (the five formerly-skewed fixtures now pass on a
  contaminated machine); characterization deterministic across repeated
  runs; check:type; full ambient-PATH `bun test` 1670 pass / 1 skip /
  0 fail; architecture-sync; strict workflow check; git diff --check; cmp
  mirrors; independent Claude gatekeeper acceptance (PASS, falsifier
  confirmed).
- Residual risks: pre-edit-guard and the ship scripts keep their own
  decision logic — parity is PROVEN against their current behavior; the
  single-kernel cutover for those two surfaces is recorded as deliberate
  future work beyond this sprint (notes + ledger). Ship cells'
  script-level `workflowProfile`/`requirementsResult` remain honestly
  listed as missing (no fake closure).
- Reviewer action required: none for the reviewed subject; ship as the
  independent LSC-08 PR against `main` from base `89f75d8a`.
- Rollback: revert the independent LSC-08 PR; MCP loses the two additive
  fields, proofs and docs statement disappear, hook guard reverts; no
  persisted migration to unwind.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  `codex/lsc-08-adapter-parity-and-docs` from exact execution base
  `89f75d8a` (post-LSC-07 merge plus backfill).
- P1/P2/P3 evidence: the calibrated contract bounds the final row to
  prove-not-cutover (LSC-02 establishment precedent), pre-authorizes the
  probe recalibration with a shrink-only constraint, and routes both
  carried follow-ups explicitly.
- Root cause or plan evidence: falsifier-first — the cross-adapter
  stop/ship assertion fails on base (MCP lacks readiness) and passes after;
  the fixture-pinning uncovered and correctly handled the
  lite-resolution interaction via the pre-existing
  REPO_HARNESS_WORKFLOW_PROFILE override.

## Verification Evidence

- Waza `/check` run: superseded by the read-only Claude gatekeeper pass
  recorded under External Acceptance Advice.
- Commands run: full Exit Criteria surface listed on the Human Review Card,
  all exit 0 in this worktree at the reviewed subject.
- Manual checks: gatekeeper verified every parity assertion compares an
  adapter to the single resolveEffectiveState authority (CLI full JSON,
  CLI --field readiness, MCP compact, and the REAL stop-orchestrator run
  read-only — its [ReadinessGate] readyToShip=false stderr line with
  authority reasons, stdout carrying no block); confirmed the falsifier;
  confirmed guidance parity is single-source (authority.guidance IS
  CEREMONY_GUIDANCE[profile] by construction); audited the six-line
  characterization shrinkage against OperationReadinessResult's real keys;
  confirmed the stop-orchestrator diff is only the `.readiness | type`
  guard with skip-not-abort direction; confirmed
  REPO_HARNESS_WORKFLOW_PROFILE pre-exists at base (sanctioned override).
- Supporting artifacts: notes carry the design decisions, the
  lite-resolution near-miss, and the deliberate non-goals record.
- Implementation notes reviewed: yes.
- Run snapshot: ambient-PATH full-suite output retained in session task log
  (1670 pass / 1 skip / 0 fail).

## External Acceptance Advice

> **External Acceptance**: pass (Round 1, Claude gatekeeper substitution — mechanical `workflow_external_acceptance_pass` still fails closed regardless, per the pre-existing base-gate defect)
> **External Reviewer**: Claude
> **External Source**: claude-gatekeeper (continuation of the documented 2026-07-18 exception: the repo's normal host-aware Codex requirement cannot be met because the Codex CLI is quota-limited until 2026-08-16; see the `tasks/todos.md` solo-operator row)
> **External Started**: 2026-07-19
> **External Completed**: 2026-07-19
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:8a0fc0f759565fc7b49fb400b9f9696d060b228be96e045708f45103638993d0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 89f75d8a0ef45154d38589441b516586b1167060
> **Benchmark Evidence SHA256**: unavailable-by-defect (fingerprint lookup returns empty despite existing `evals/harness/reports/profile-comparison.*` evidence; pre-existing base-gate defect tracked in `tasks/todos.md`, unrelated to this subject)

- P1 blockers: none.
- P2 advisories: one LOW (the dispatch packet listed mcp-tools.test.ts as
  modified when no change was needed — corrected in the PR description) and
  one INFO (this review card completes the expected ship-time ceremony).
- Acceptance checklist: parity single-source verified, falsifier confirmed,
  MCP surface additive-only, hook containment verified, characterization
  honesty verified (shrink-only, ship cells honest), fixture pinning
  verified with ambient PATH, docs contract verified, containment verified.

## Behavior Diff Notes

- MCP compact state now carries readiness and guidance verbatim; the parity
  gate (adapter-parity test) proves CLI/MCP/Hook/Skill agreement on
  profile, operation, decision, reason, and readiness for the same
  fixtures, including the allowed-to-stop/not-ready-to-ship distinction;
  the Stop hook survives non-object readiness values by skipping (never
  aborting); the five hook fixtures are deterministic on contaminated
  machines. No public route/tool/CLI name changed anywhere.

## Residual Risks / Follow-ups

- Future work beyond this sprint (recorded deliberately): cut
  pre-edit-guard and the ship scripts over to the readiness authority
  (single-kernel closure for the remaining two surfaces).
- Base-gate defects and the solo-operator gap remain tracked in
  `tasks/todos.md`; refresh the machine's global repo-harness binary.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Four-adapter parity proven against one authority; stop/ship distinction identical everywhere; five fixtures now ambient-PATH deterministic. |
| Product depth | 9/10 | The sprint's convergence becomes observable from every adapter; the parity gate keeps it true. |
| Design quality | 9/10 | Prove-not-cutover scoping; single-source assertions; shrink-only probe recalibration with honest ship cells. |
| Code quality | 9/10 | Additive MCP diff, contained hook guard, falsifier-first test, accurate notes including the near-miss. |
