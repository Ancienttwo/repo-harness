# Task Review: bdd2-e-02-run-experiment-s-shape-hypothesis

> **Status**: Passed
> **Plan**: plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
> **Contract**: tasks/contracts/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.contract.md
> **Notes File**: tasks/notes/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 17:44
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:c4607e6e3a49c9ab9d6a63689ebd1bc42731951f62c678e1cd6b66a72c5971e2
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: eval-only
- Intended files changed: frozen BDD² eval authority/runner/data/rubric/metrics plus workflow artifacts
- Actual files changed: matches contract allowed paths; raw evidence remains ignored
- Commands passed: repository-wide 1118-test suite, focused 14-test suite,
  TypeScript noEmit, manifest/plan validation, score validation, deterministic
  re-summary, deploy SQL, architecture/task/workflow checks, and project inspection
- External acceptance: Claude final targeted remediation rereview reported `No findings.`
- Residual risks: Agent-panel proxy evidence is weaker than the original human-panel design and must not be cited as human evidence
- Reviewer action required: confirm hosted PR Test and MCP matrix checks
- Rollback: revert the E-02 branch; delete ignored raw run evidence

## Mode Evidence

- Selected route: isolated evaluation-only Shape hypothesis
- P1/P2/P3 evidence: recorded in the active plan and implementation notes
- Root cause or plan evidence: global S/A seal coupling and repo-readable truth were
  removed before the formal run; S-v1 smoke was discarded after local skill leakage

## Verification Evidence

- Waza `/check` run: final `bun run check:ci` passed after the isolated-version-probe
  and historical-coordinate remediation
- Commands run: repository-wide `bun test`; `bunx tsc --noEmit --pretty false`;
  focused Bun tests; manifest validate/plan; one S-v2 real smoke; formal
  72-coordinate S run; score validation; deterministic re-summary; root required
  shell/workflow checks under Bun 1.3.14
- Manual checks: the historical projector reproduced the committed 72-row file
  byte-for-byte after reconstructing the exact 12 × 2 × 3 source-commit coordinate
  set; current S-v3/A authority remains foundation-only with no agent profile
- Supporting artifacts: `.ai/harness/runs/bdd2/bdd2-e02-shape-s-v2/`
- Implementation notes reviewed: yes; blind adjudication complete
- Run snapshot: source commit `cd9e0426d362614ba277e067633db2596c236491`
- Repository-wide result: 1118 passed, 1 platform skip, 0 failed. The retired
  `scripts/migrate-project-template.sh` command is superseded by the transactional
  TypeScript adoption path; current project-state inspection reports no drift or
  required decision.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Anthropic Claude
> **External Source**: claude-review exact-fingerprint review plus targeted P1 remediation rereview
> **External Started**: 2026-07-12 17:20 +0800
> **External Completed**: 2026-07-12 17:44 +0800
> **Reviewed Diff Fingerprint**: sha256:c4607e6e3a49c9ab9d6a63689ebd1bc42731951f62c678e1cd6b66a72c5971e2
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers:
- None.
- Resolved P1: the historical projector previously counted packets/scores without
  proving the frozen task × condition × repetition set. It now content-verifies
  source-commit tasks/truth, reconstructs all coordinates, validates coordinate and
  prompt hashes plus agent/blind metadata, and rejects duplicate/missing entries.
- P2 advisory: the shared score schema remains Shape-only while Experiment A is
  foundation-only. E-03 must cut to per-experiment score authority before A can be
  sealed; E-02 intentionally adds no A compatibility branch.
- Final targeted remediation rereview: `No findings.`
- Acceptance checklist: 72/72 scores validated before reveal; report labels Agent-panel proxy evidence; decision remains `Reshape`

## Behavior Diff Notes

- 72 responses and 72 locked Agent-panel scores produced the deterministic
  `Reshape` report. The implementation owner did not score packets.

## Residual Risks / Follow-ups

- Agent-panel proxy evidence remains a known evidence-grade limitation; no Phase P
  productization is authorized from this E-02 result.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Runner, 72 outputs, 72 scores, aggregate report, and decision complete. |
| Product depth | 8/10 | Independent hypothesis, omission counter-metrics, and kill rules preserved. |
| Design quality | 8/10 | Per-experiment seal and isolated HOME/cwd prevent two concrete leakage modes. |
| Code quality | 8/10 | Dependency-free exact schemas and deterministic aggregation tests pass. |

## Failing Items

- None locally. Hosted PR CI remains the merge gate.

## Retest Steps

- Current authority: `bun scripts/run-bdd2-evals.ts validate` must report both S-v3
  and A as foundation-only with no runnable agent profile.
- Historical evidence: run `project-shape-evidence` with the recorded S-v2 run and
  `evals/bdd2/reports/experiment-s-evidence.json` output; it must reproduce the
  committed file byte-for-byte. The retired S-v2 run is intentionally not accepted
  as current authority; no compatibility validation path exists.

## Summary

- Pass. Authority, historical run provenance, Agent-panel adjudication,
  `Reshape` decision, current foundation fail-closed state, durable evidence,
  and external review are complete. Hosted PR CI remains the merge gate.
