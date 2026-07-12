# Task Review: agent-fleet-specialists

> **Status**: Done
> **Plan**: plans/plan-20260712-2215-agent-fleet-specialists.md
> **Contract**: tasks/contracts/20260712-2215-agent-fleet-specialists.contract.md
> **Notes File**: tasks/notes/20260712-2215-agent-fleet-specialists.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-13 01:52
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:75ec468598be86e0feb7809d42d6ba1651344ef430cd5d81578c316d6d933387
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
- Post-review rebase (2026-07-13): rebased onto `codex/repo-owned-agent-fleet`'s
  new tip via `git rebase --onto 63dbd86 443039c codex/agent-fleet-specialists`
  (replaying only this branch's own `9ad9262`), itself sitting on `origin/main`
  `7b6ba87` (10 commits ahead of the prior stack base `4c3612a`). New HEAD:
  `682cfc9`. Only `tasks/current.md` and `tasks/todos.md` conflicted (the
  architecture module auto-merged, keeping all three 2026-07-12 closeout
  sections); resolved by keeping the upstream worktree's already-reconciled
  snapshot/handoff/git-status block and ledger marker (this branch's
  conflicting rows were duplicate or already represented via an absolute-path
  entry — see notes file for detail). Re-ran every contract exit-criteria
  command against the rebased tree: `bun test` (1157 pass / 1 skip / 0 fail,
  509.24s); focused four-file suite (58 pass / 0 fail); `tests/run-skill-evals.
  test.ts` (12 pass / 0 fail); `bun run check:type` clean; `check:hooks` /
  `check:helpers` OK; all three `cmp` helper-parity checks identical; `npm pack
  --dry-run --json` lists all six `agents/fleet/*.md`; `check-deploy-sql-
  order.sh`, `check-architecture-sync.sh` (advisory, 0 blocking), and
  `check-task-sync.sh` (no changes detected) pass; `inspect-project-state.ts`
  reports no drift signals; `adopt --dry-run` plans 18 operations with no
  errors. Working tree is clean after the rebase.
- Unresolved external caveat: `repo-harness run check-task-workflow --strict`
  currently fails only its brain-doc-sync sub-check, and only for
  `docs/reference-configs/harness-overview.md` — a path neither this contract
  nor `repo-owned-agent-fleet`'s allowed paths own. That entry's external,
  machine-global brain-vault mirror (outside this git repository, shared by
  every worktree) currently holds unmerged content proven to belong to the
  separate, unrelated `harness-cost-baseline-slo` worktree/branch (absent from
  both `origin/main` and this branch), and that worktree's session appears to
  be actively writing to the same shared vault: the two entries this contract
  does own (`agentic-development-flow`, `external-tooling`) were fixed with a
  dry-run-verified, path-scoped `sync-brain-docs.sh --changed` call, then
  independently re-observed reverted to a third, even-older state minutes
  later. This is a live multi-session race on a non-git external singleton, not
  a defect introduced by this rebase; forcing a pass would require either
  destroying the other worktree's unmerged work or absorbing unrelated,
  unmerged content into this branch, both out of bounds. Recommend re-running
  `check-task-workflow --strict` once that concurrent activity quiesces before
  treating this specific gate as re-confirmed.
- Post-review fix (2026-07-13 01:52 CST): an independent Codex review found
  `assertDisposableRootBoundary` (`scripts/run-skill-evals.ts:242-277`)
  rejected the source checkout as repo/HOME using both an exact-match and a
  descendant check (`isInside(sourceRoot, X)`), but rejected the real HOME
  using only an exact-match check. A disposable repo/HOME pair nested inside
  the real HOME tree (e.g. `$HOME/scratch/repo` and `$HOME/scratch/home`)
  passed every existing check, including the sibling-directory check, and was
  silently accepted as disposable — confirmed concretely pre-fix with a
  fully-formed disposable repo under real `$HOME` producing `NO THROW —
  accepted as disposable`. Fixed by extending both real-HOME conditionals to
  `realHome && (repoRoot === realHome || isInside(realHome, repoRoot) ||
  isInside(repoRoot, realHome))` (and symmetrically for `home`), which also
  closes the reverse direction (disposable repo/HOME as an ancestor
  containing real HOME, e.g. `home = dirname(realHome)`) — a real gap because
  `runDisposableAdoptionProfile` and the skills profile run fully unsandboxed
  subprocesses with `cwd`/`HOME` pinned to these exact values and `home` has
  no required-file gate. Sibling check, source-checkout checks, and
  required-file checks were left untouched; no new dependency. Two regression
  tests added to `tests/run-skill-evals.test.ts` (descendant case via a real
  temp dir under `os.homedir()`; ancestor case via `dirname(realHome)` as
  `home`); both proven to fail on the unfixed code (for the wrong, unrelated
  reason in each case) and pass once restored. Verification re-run:
  `bun test tests/run-skill-evals.test.ts` (14 pass / 0 fail); `bun run
  check:type` (clean); full `bun test` (1159 pass / 1 skip / 0 fail, 11545
  expect() calls across 102 files, 471.94s). Full detail and command
  transcripts: notes file. This narrows, not widens, the P1 boundary already
  accepted in External Acceptance below; the reviewed diff fingerprint above
  predates this fix and was intentionally left untouched pending the next
  full re-review cycle.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-07-13T01:52:00+0800
> **External Completed**: 2026-07-13T02:00:42+0800
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:75ec468598be86e0feb7809d42d6ba1651344ef430cd5d81578c316d6d933387
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: none
- Acceptance checklist: pass — independent Codex review of the rebased two-commit stack (repo-owned-agent-fleet + agent-fleet-specialists) plus the disposable-HOME-boundary fix. Prior round found a false alarm (wrong role-count premise in the review prompt, dismissed), a confirmed P2 (assertDisposableRootBoundary only rejected exact real-HOME equality, not descendants/ancestors) which was fixed and reverified fail→pass, and an advisory-only retired-role cleanup gap (out of scope, no role removed in this change). Final pass returned exactly "No P1 findings" / "No P2 findings" against the fixed diff.
- Prior Claude self-review (2026-07-12, fingerprint sha256:aff50ec8...) superseded by this independent cross-vendor pass per this repo's external-acceptance policy (expected reviewer is Codex when running from Claude Code).
- Fingerprint note: `repo-owned-agent-fleet` (this branch's stacked parent commit) landed directly on `origin/main` as `63dbd86` during this session. The comparison base moved accordingly (`origin/main`/local `main` now equal `63dbd86`), shrinking the measured diff to this branch's own `682cfc9` commit only. The patch content of `682cfc9` itself is unchanged from what Codex reviewed above — only the base it's diffed against shifted — so the fingerprint was recomputed against the new base rather than re-reviewed.

## Behavior Diff Notes

- Fleet grows from four to six complete repo-owned personas with deterministic host projections.
- Root-cause-prover writes only bugfix evidence inside contract allowed paths and never implements the production fix.
- Harness-evaluator runs existing surfaces only in a complete disposable repo/HOME; source or real HOME yields BLOCKED.
- Native Explore remains informal host capability; formal contract exploration uses the repo-owned persona without alias or inheritance.

## Residual Risks / Follow-ups

- Skills and core adoption commands are runner-guarded; Codex TOML still has no per-path writable allowlist for any additional read-only contextual inspection.
- Actual user-level fleet installation completed only after external acceptance and repository gates passed.
- P2/advisory (2026-07-13, not fixed in this task): `scripts/install-agent-fleet.sh` only ever iterates the current `MANAGED_AGENTS` list (line 86: `["explorer", "deep-reasoner", "fast-worker", "gatekeeper", "root-cause-prover", "harness-evaluator"]`) and never calls `readdirSync`/`readdir` on `CLAUDE_TARGET_DIR`/`CODEX_TARGET_DIR` to find files that no longer correspond to a current source. If a role is later retired or renamed (removed from `MANAGED_AGENTS` and its `agents/fleet/<name>.md` deleted), the previously-installed `.claude/agents/<name>.md` and `.codex/agents/<name>.toml` for that old name are never revisited and never deleted — they persist indefinitely as orphaned files in the user's actual host config. The existing `deactivateMismatchedTarget`/"stale-identity-deactivated" logic (lines 281-286, 318-322) only rewrites a target whose *slot* (current agent name) has drifted to a different role's content; it does not prune slots for names no longer in `MANAGED_AGENTS` at all. Out of scope here since this task only adds two roles and removes none; documented as a residual risk for whichever future task retires or renames a role — that task should add a directory-scan-and-prune step (or an explicit uninstall path) before shipping.

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
