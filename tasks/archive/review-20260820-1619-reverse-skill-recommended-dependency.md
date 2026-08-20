> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260810-1128-reverse-skill-recommended-dependency.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1619

# Task Review: reverse-skill-recommended-dependency

> **Status**: Reviewed
> **Plan**: plans/plan-20260810-1128-reverse-skill-recommended-dependency.md
> **Contract**: tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md
> **Notes File**: tasks/notes/20260810-1128-reverse-skill-recommended-dependency.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-10 11:28
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: Skill catalog, install/update/init selection, integrity effect, tests, runtime docs, workflow artifacts.
- Actual files changed: intended scope only; primary dirty checkout remained untouched and implementation stayed in the contract worktree.
- Commands passed: full `bun test` (2348 pass, 1 skip), focused 5-file suite, typecheck, reference-config parity, architecture/task/workflow/deploy gates, project-state audit, init dry-run, tarball smoke, live pinned disposable install smoke.
- Residual risks: upstream content is intentionally high-risk and retains an invalid target-mention authorization assumption; default profiles never select it, and explicit use still requires independent scope/RoE review. Same-UID malicious concurrent filesystem replacement is outside the installer boundary because that principal can rewrite the installed Skill after commit; protecting against it requires OS isolation or a privileged broker.
- Reviewer action required: commit the plan/contract authority, rerun prepared evidence, then record the contract-frozen Claude AcceptanceReceipt.
- Rollback: remove the catalog entry, explicit flag, provider/integrity projection, tests, and documentation as one unit.

## Mode Evidence

- Selected route: Waza `/check`-style architecture and security specialist review.
- P1/P2/P3 evidence: catalog authority -> explicit CLI option -> isolated Skills CLI fetch -> digest verification -> canonical locked staging commit -> host projection.
- Root cause or plan evidence: live upstream inspection falsified the original full-profile direction; `field-journal/precedent-auth.md` treats target mention as authorization.

## Verification Evidence

- Waza `/check` run: post-merge architecture and security specialists found
  integrity-route, host-preflight, and staging-symlink gaps; all were fixed and
  covered by focused regression tests. The final adversarial pass additionally
  found an install flag attribute mismatch plus a late-failure/concurrent update
  rollback gap; explicit CLI routing, transactional update compensation, and a
  shared install/update lock now close both paths. No introduced finding remains
  open.
- External Claude review reported two P2 candidates. The lock/mutation HOME
  precedence mismatch was valid and is fixed with a focused regression. The
  proposed `init` lock expansion was rejected after tracing the public action:
  it always passes `hostAdapters: false` and `externalSkills: false`, and
  `runInit` has no other production caller, so the claimed shared host mutation
  is unreachable from `repo-harness init`.
- Commands run: `bun test`; focused catalog/init/global-runtime/profile/integrity tests; all required repository checks and tarball smoke.
- Manual checks: pinned upstream list/install in disposable HOME; 41 selectable skills, 348 selected files, scanner reported Critical Risk/17 alerts; final repo-harness smoke projected exactly one Codex symlink and cleaned temporary roots.
- Supporting artifacts: plan, contract, notes, and this review.
- Implementation notes reviewed: yes.
- Run snapshot: final full suite completed locally in 489.46s; contract prepare run
  `.ai/harness/runs/run-20260810T125910-82347-20260810-1128-reverse-skill-recommended-dependency.json`
  passed 15/15 criteria but correctly refused evidence binding with
  `contract_not_committed`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:7c6b1280572f5866e3fe053bdafda176b4b1be87da8d17c4eba82353ab2d3132
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: b9639f26cef478514e9917059da313fd42741d2e
> **Verification Evidence SHA256**: sha256:dcb4008f1a043119ed633592f859dd2675955e1b2b88b221d03d57e83b3a8af0
> **Issued At**: 2026-08-11T11:57:41.979Z

- Summary: Claude reviewed the final production diff after merging origin/main b9639f26, confirmed the HOME-authority fix, and returned PASS with no remaining actionable correctness, security, or contract findings.
- Findings: none

## Behavior Diff Notes

- `minimal`, `full`, and repo `init` projections are unchanged.
- `repo-harness install --with-reverse-skill` and `repo-harness update --with-reverse-skill` are the only selection routes.
- The required selector rejects missing entries, profile-selected entries, unsupported hosts, and missing integrity before provider execution.
- Integrity-bound installs write first to a disposable HOME, then commit verified bytes through same-filesystem temp copy, post-copy hash, canonical exclusive lock, and atomic rename before host projection.
- Catalog validation rejects integrity metadata on any profile-selected or non-external package, and runtime projection rejects non-canonical staging roots plus unowned host paths before shared staging changes.
- Host and staging ancestor symlinks, dangling host roots, and inherited Bun/npm cache roots are covered by hostile-path regression tests; all writes remain under canonical or disposable roots.
- Full install/update and global adapter install/uninstall share one exclusive
  host transaction boundary: a failed late step restores only its own snapshot,
  while a concurrent process waits and cannot have its successful projection
  removed by another rollback.

## Residual Risks / Follow-ups

- The upstream router is not safe authority by itself. Documentation and CLI help preserve this as an explicit operational boundary; optional upstream toolchains were not installed or executed.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Explicit install/update and default exclusion are proven end to end. |
| Product depth | 9/10 | Recommendation remains usable without weakening authority boundaries. |
| Design quality | 9/10 | Catalog, selector, integrity, lock, and projection authorities are separated. |
| Code quality | 9/10 | Fail-closed fault tests cover drift, missing authority, partial copy, dangling paths, and process death. |

## Failing Items

- None in implementation review. Typed AcceptanceReceipt remains pending
  because uncommitted plan/contract authority cannot bind prepared evidence.

## Retest Steps

- Re-run: contract exit criteria and full `bun test`.
- Re-check: pinned live disposable install, digest, and one-host projection.

## Summary

- Recommend pass. The dependency is registered and installable only through an explicit, immutable, integrity-bound path; default behavior and host authority remain unchanged.
