# Task Review: agent-fleet-specialists

> **Status**: Done
> **Plan**: plans/plan-20260712-2215-agent-fleet-specialists.md
> **Contract**: tasks/contracts/20260712-2215-agent-fleet-specialists.contract.md
> **Notes File**: tasks/notes/20260712-2215-agent-fleet-specialists.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-13 00:19
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:aff50ec8478ddbbeef5cb4636616de0a3be09c72d611acd878474a616714a49a
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: two repo-owned persona sources/projections, six-role installer/tooling/policy seeds and mirrors, native Explore routing docs, architecture/workflow artifacts, and focused tests within the contract.
- Actual files changed: allowed-path entries only; no `scripts/contract-run.ts`, parallel worker-routing files, BDD2 runner/data, package manifest, or lockfile change. The existing skill runner gained only a fail-closed disposable-boundary mode; cases, graders, scoring, and datasets are unchanged.
- Commands passed: focused suite 70/70; full suite 1149 pass / 1 skip / 0 fail; typecheck; helper/doc parity; package six-source listing; packaged temporary-HOME 12-file smoke; deploy/architecture/task/workflow/state/adopt gates.
- External acceptance: Claude final acceptance passed with no P1/P2 after all boundary findings were resolved.
- Residual risks: skills and core adoption commands are runner-guarded; optional read-only contextual interpretation still relies on the persona because Codex exposes no per-path writable allowlist.
- Reviewer action required: none; repository/sprint gates and actual HOME readback passed.
- Rollback: revert the specialist work-package and reinstall the prior four-role fleet.

## Mode Evidence

- Selected route: stacked isolated worktree; separate read-only root-cause and evaluator/native mapping passes; sequential parent implementation; independent exit reviewer; Claude external acceptance.
- P1/P2/P3 evidence: P1 preserves packaged fleet and existing gate/eval authorities; P2 traces six-source preflight to twelve projections and evaluator commands to a complete disposable repo; P3 adds only two identities, folds migration audit into a profile, and rejects native prompt inheritance/aliases.
- Root cause or plan evidence: `plans/plan-20260712-2215-agent-fleet-specialists.md` and the two explorer evidence maps recorded in implementation notes.

## Verification Evidence

- Waza `/check` run: represented by contract verification, independent exit review, and required Claude external acceptance.
- Commands run: focused five-file suite (70 pass); `bun test` (1149 pass / 1 skip); type/helper/doc parity; npm package listing; packaged HOME smoke; all root required checks; inspector and adopt dry-run.
- Manual checks: exactly six packaged/Claude/Codex roles; writable set exactly fast-worker/root-cause-prover/harness-evaluator; no `explore` alias; no BDD2/contract-run/parallel-routing diff; actual HOME contains 12 byte-identical projections and both hosts report present.
- Supporting artifacts: architecture archive cards, contract-assets/inspection-migration modules and workstreams, checks/runs cache.
- Claude attempt 1: two P1s and two P2s; all four were addressed before re-review. The runner now blocks source checkout/real HOME and passes disposable HOME to child commands; root-cause Claude tools are explicit; the todo says six; runtime plus negative tests replace prompt-only confidence.
- Claude attempt 2: found two remaining P1 boundary cases. The guard now rejects source/real-HOME in either repo or HOME position, and adoption must pass the shared boundary preflight before commands with the same explicit repo/HOME.
- Claude attempt 3: confirmed those fixes except that adoption's two-step command sequence could drop validated values. It is now one guarded invocation whose runtime test proves identical canonical repo/HOME injection into both existing commands.
- Claude attempt 4: found the real benchmark config's sibling workspace was incompatible with guarded mode, ambient source-root overrides leaked, and the retired detached-preflight flag remained. Guarded mode now chooses a repo-internal workspace, scrubs known overrides for both profiles, and removes the dead flag; tests cover the real default and contamination.
- Claude attempt 5 produced an ambiguous no-findings sentence; the required standalone clarification found git/grader HOME leakage and a future-path symlink escape. Every guarded subprocess now receives disposable HOME plus scrubbed overrides, and nearest-existing-ancestor canonicalization rejects symlink escapes before writes. Regression tests instrument git hooks, the real grader wrapper, and a symlinked workspace ancestor.
- Claude attempt 6 found config env could restore scrubbed variables and manifest/config reads preceded containment. Child env is now scrubbed after config merge, and guarded input paths are canonicalized and checked before JSON reads; tests inject both attacks.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/runs/run-20260713T001635-91927-20260712-2215-agent-fleet-specialists.json` (pass before terminal plan markers were cleared).

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-12 23:00:50 CST (initial); 2026-07-12 23:56:00 CST (final acceptance)
> **External Completed**: 2026-07-13 00:01:03 CST
> **Reviewed Diff Fingerprint**: sha256:aff50ec8478ddbbeef5cb4636616de0a3be09c72d611acd878474a616714a49a
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: none
- Acceptance checklist: final standalone Claude review returned exactly `No P1 or P2 findings.`

## Behavior Diff Notes

- Fleet grows from four to six complete repo-owned personas with deterministic host projections.
- Root-cause-prover writes only bugfix evidence inside contract allowed paths and never implements the production fix.
- Harness-evaluator runs existing surfaces only in a complete disposable repo/HOME; source or real HOME yields BLOCKED.
- Native Explore remains informal host capability; formal contract exploration uses the repo-owned persona without alias or inheritance.

## Residual Risks / Follow-ups

- Skills and core adoption commands are runner-guarded; Codex TOML still has no per-path writable allowlist for any additional read-only contextual inspection.
- Actual user-level fleet installation completed only after external acceptance and repository gates passed.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Focused/full/package/runtime smokes pass. |
| Product depth | 9/10 | Adds diagnosis and evaluation roles without adding gates or benchmark authority. |
| Design quality | 9/10 | Explicit authority/sandbox boundaries; residual dispatch-enforced disposable constraint documented. |
| Code quality | 10/10 | Exact lists, all-source preflight, deterministic projections, focused runtime regression. |

## Failing Items

- None; internal and external acceptance both pass.

## Retest Steps

- Re-run: focused five-file suite, full suite, final `verify-sprint`, and actual HOME readiness after install.
- Re-check: package has six sources; HOME has twelve exact projections; no BDD2/contract-run/worker-routing diff.

## Summary

- Internal and external PASS. Awaiting final repository gates and HOME mutation/readback.
