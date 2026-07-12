# Task Review: bdd2-e-03-run-experiment-a-audit-hypothesis

> **Status**: Passed
> **Plan**: plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md
> **Contract**: tasks/contracts/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.contract.md
> **Notes File**: tasks/notes/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 21:45
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:7e4dd7eeac0d0cd502fe0f723d7fbda0e9f8cdb1e741c9a5dd895d45e236081d
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: eval-only
- Intended files changed: frozen BDD² Audit authority, held-out fixtures/truth,
  score/metric contracts, runner/tests, generated evidence/report, and workflow artifacts
- Actual files changed: matches the contract; raw packets, mappings, responses, and
  scores remain ignored runtime evidence
- Commands passed: 1,143-test repository suite, TypeScript noEmit, focused BDD²
  tests, current/historical authority validation, byte-identical evidence reprojection,
  deterministic Kill summary, required workflow checks, repository inspection,
  adoption dry-run, and packaged tarball smoke
- External acceptance: Anthropic Claude final remediation rereview reported `No findings.`
- Residual risks: adjudication is a condition-blind Agent-panel proxy, not human
  evidence; the live default brain vault had newer unrelated root-checkout content,
  so final CI used an unavailable isolated vault rather than overwriting it
- Reviewer action required: confirm hosted PR Test and MCP matrix checks
- Rollback: revert the E-03 branch/PR and remove the ignored Audit run directory

## Mode Evidence

- Selected route: independent evaluation-only Audit hypothesis in a linked worktree
- P1/P2/P3 evidence: active plan maps the evaluation authority, traces the sealed
  run through blind packets and truth-aware scores, and preserves independent S/A gates
- Root cause or plan evidence: Shape-only global score authority was cut directly to
  per-experiment v3 authority; no compatibility parser, public BDD surface, or service
  was introduced

## Verification Evidence

- Waza `/check` run: equivalent strict route completed through focused checks,
  external review, exact review fingerprint, contract verification, and full CI
- Commands run:
  - `bunx tsc --noEmit --pretty false`
  - `bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts`
  - `bun scripts/run-bdd2-evals.ts validate`
  - `bun scripts/run-bdd2-evals.ts validate-historical-audit-scores --run .ai/harness/runs/bdd2/bdd2-e03-audit-a-v1`
  - two historical evidence projections plus `cmp`
  - `bun scripts/run-bdd2-evals.ts summarize-historical-audit --run .ai/harness/runs/bdd2/bdd2-e03-audit-a-v1`
  - `REPO_HARNESS_BRAIN_ROOT=<unavailable-isolated-vault> bun run check:ci`
  - root required deploy SQL, architecture, task, strict workflow, inspection, and adoption dry-run checks
- Manual checks: 48 outputs and 48 locked scores validate; six seeded and six clean
  tasks appear twice in each condition; tracked evidence reprojects byte-identically;
  current S/A revisions are foundation-only and no public BDD surface exists
- Supporting artifacts: `.ai/harness/runs/bdd2/bdd2-e03-audit-a-v1`,
  `evals/bdd2/reports/experiment-a-evidence.json`, and
  `evals/bdd2/reports/experiment-a.md`
- Implementation notes reviewed: yes
- Run snapshot: exact source commit `9918283b38ef6bf92adab64cfc2a3c11e9987c70`,
  48/48 outputs, 48/48 locked scores, Agent-panel proxy evidence
- Repository-wide result: 1,143 passed, one platform skip, zero failed; workflow,
  inspection, package dry-run, and tarball smoke passed

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-12 21:20 +0800
> **External Completed**: 2026-07-12 21:45 +0800
> **Reviewed Diff Fingerprint**: sha256:7e4dd7eeac0d0cd502fe0f723d7fbda0e9f8cdb1e741c9a5dd895d45e236081d
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- Resolved findings: source-commit reconstruction, duplicate truth matching,
  timestamp validation, all seven Kill-gate regressions, durable severity evidence,
  directory/leaf/output symlink hardening, and historical Shape runner identity
- P2 advisories: none remain; final targeted result was `No findings.`
- Acceptance checklist: exact historical authority and runner hashes verified; no
  v2/v3 dual parser; Audit provenance unchanged; result remains `Kill`

## Behavior Diff Notes

- Experiment A treatment achieved 100% seeded/P0-P1 recall and 100% severity
  agreement, but failed precision (35.29%), clean false-positive (25%), correct
  no-findings (75%), and severe-underestimation (two) gates.
- The deterministic decision is `Kill`; current Audit authority is non-runnable.
  Experiment E/I and Phase P productization remain forbidden.
- Shape remains an exact historical v2 `Reshape` result and a separate current
  non-runnable v3 foundation; no compatibility authority was created.

## Residual Risks / Follow-ups

- Agent-panel adjudication can validate the synthetic benchmark contract but cannot
  substitute for product-manager or user evidence.
- The default brain-sync mismatch belongs to newer root-checkout agent-fleet work;
  this branch deliberately did not overwrite that external state. Hosted CI has no
  default vault dependency and remains the merge gate.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | 48/48 run and score envelope deterministically reproduces Kill. |
| Product depth | 9/10 | Independent hypothesis, clean counterexamples, seven fixed gates, and evidence limits are explicit. |
| Design quality | 8/10 | Flat file authority and shared invariants only; no new service, dependency, or public surface. |
| Code quality | 9/10 | Exact source provenance, fail-closed schemas/paths, focused regressions, and full CI pass. |

## Failing Items

- None locally. Hosted PR CI remains the merge gate.

## Retest Steps

- Re-run the historical score validator, two evidence projections plus `cmp`, and
  historical summary; decision must remain `Kill`.
- Re-run `REPO_HARNESS_BRAIN_ROOT=<unavailable-isolated-vault> bun run check:ci`;
  the isolated path avoids mutating unrelated live brain content.

## Summary

- Pass. Experiment A is complete, reproducible, externally reviewed, and killed by
  its pre-registered gates. No Audit productization or downstream E/I work is authorized.
