> **Archived**: 2026-08-07 23:19
> **Related Plan**: plans/archive/plan-20260807-1128-gitignore-dir-level-repo-harness.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260807-2319

# Task Review: gitignore-dir-level-repo-harness

> **Status**: Complete
> **Plan**: plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md
> **Contract**: tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md
> **Notes File**: tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-07 14:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

The two `pending` header fields are rubric metadata; the authoritative values
are written into the Acceptance Receipt Projection below by the receipt tooling.

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/core/adoption/gitignore-plan.ts` managed block, this repo's `.gitignore`, any other authored gitignore-projecting template, and the tests asserting the old per-file content — all inside contract `allowed_paths`.
- Actual files changed: 12 paths, all inside `allowed_paths`. Code and tests: `.gitignore`, `scripts/lib/project-init-lib.sh`, `src/core/adoption/gitignore-plan.ts`, `tests/create-project-dirs.runtime.test.ts`, `tests/scaffold-parity.test.ts`, `tests/workflow-contract.test.ts`, `tests/unit/gitignore-plan.test.ts` (new). Workflow artifacts: plan, contract, notes, this review, `tasks/todos.md` (timestamp only).
- Commands passed: `bun test` 2217 pass / 1 skip / 0 fail; `bun run check:type`; `bun src/cli/index.ts init --repo . --dry-run`; `git check-ignore -q .repo-harness/anything.json`; `repo-harness run check-task-workflow --strict`; `check-task-sync.sh`; `check-deploy-sql-order.sh`; `check-architecture-sync.sh`; `sync-helper-sources.ts --check` (52 helpers); `sync-hook-sources.ts --check` (3 files); `inspect-project-state.ts` (no drift signals).
- Residual risks: the three updated legacy assertions pair `toContain(".repo-harness/")` with a single `not.toContain` on one named retired entry, so they would not catch a hypothetical *different* per-file entry replacing the directory rule. The new `tests/unit/gitignore-plan.test.ts` closes that hole for the planner block by asserting the exact line plus an empty residual set.
- Reviewer action required: none
- Rollback: single revert of the slice commit restores the per-file entries; no data or state migration involved.

## Mode Evidence

- Selected route: gatekeeper acceptance review of an uncommitted delivery in the isolated worktree `codex/gitignore-dir-level-repo-harness`.
- P1/P2/P3 evidence: P1 — four authored surfaces project gitignore content downstream, found by scanning two independent managed-block markers (`.ai/harness/triage/*`, `.ai/harness/chatgpt/sessions/`) across the repo; only `src/core/adoption/gitignore-plan.ts`, `scripts/lib/project-init-lib.sh`, and this repo's `.gitignore` author it, with `tests/workflow-contract.test.ts` as the assertion face. P2 — traced the credential path: `repo-harness mcp serve --transport http` writes through `src/cli/mcp/auth.ts:63` into `<repo>/.repo-harness/`, whose only prior protection was two dead per-file entries plus setup-time compensation in `src/cli/mcp/setup.ts:736-739` that this path never reaches. P3 — a directory rule is the smallest change that closes the class instead of the instance; git cannot un-ignore inside an ignored directory, so the review confirmed no negation pattern exists and nothing under `.repo-harness/` is tracked.
- Root cause or plan evidence: plan `plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md` Slice 1; Task Profile is `code-change`, so the Root Cause Evidence Gate does not apply.

## Verification Evidence

- Waza `/check` run: not applicable; verification ran through the contract exit criteria and the repo required checks.
- Commands run: full `bun test` (2217 pass / 1 skip / 0 fail, 17203 expect() across 177 files, 682.84s), targeted `bun test` over the four gitignore-touching files (33 pass / 0 fail), `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`, `repo-harness run check-task-workflow --strict`, and the repo required check scripts. All exit 0.
- Manual checks: `git ls-files .repo-harness/` empty (contract falsifier); three `git check-ignore -v` probes (`anything.json`, `mcp.oauth-tokens.json`, `chatgpt-browser.tokens.json`) all resolve through the single `.gitignore:74` rule; `git check-ignore .repo-harness-owner.json` exits 1, proving no over-match of the installer owner marker; no `!.repo-harness/...` negation anywhere; `assets/templates/gitignore.template` confirmed to carry no `.repo-harness` entry; out-of-scope surfaces (`src/cli/mcp/setup.ts`, `src/cli/chatgpt-browser/engine.ts:174-179`, all of `src/cli/mcp/`) confirmed untouched by diff.
- Supporting artifacts: `.ai/harness/checks/latest.json` (verification evidence bound into the AcceptanceReceipt below).
- Implementation notes reviewed: yes — `tasks/notes/20260807-1128-gitignore-dir-level-repo-harness.notes.md`, including the recorded `allowed_paths` widening for `scripts/lib/project-init-lib.sh` and the deliberate decision not to relax the failing scaffold assertions.
- Run snapshot: `.ai/harness/runs/run-20260807T140032-32208-20260807-1128-gitignore-dir-level-repo-harness.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:f8ebd00eddb84d83669f8b8eca7de4c014d0651750a41d158d3db2763202c72f
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 467a6d26e2c2f44321e87485ac632f0a53c1fa3f
> **Verification Evidence SHA256**: sha256:ba8e8a52b67200470aca3ec7bd08441a23ada2d02f25528fb048794f656f72c2
> **Issued At**: 2026-08-07T06:27:01.202Z

- Summary: Directory-level .repo-harness/ gitignore rule verified across all four authored surfaces; scope matches allowed_paths, git ls-files .repo-harness/ is empty, .repo-harness-owner.json is not over-matched, no negation depends on descending into the directory; full bun test 2217 pass / 1 skip / 0 fail plus check:type, init dry-run, and every repo required check. Re-bound after the plan Task Breakdown checkboxes were ticked.
- Findings: none

## Behavior Diff Notes

- No runtime behavior changes. The only observable difference is which paths git ignores: every path under `<repo>/.repo-harness/` is now ignored instead of two dead per-file paths. Nothing under that directory was tracked before the change, so no file transitions from tracked to ignored.
- The per-file entries that `src/cli/mcp/setup.ts` appends during `mcp setup chatgpt` with repo scope become redundant next to the directory rule. Gitignore semantics tolerate the overlap; removing that compensation belongs to Slice 2.

## Residual Risks / Follow-ups

- Slice 2 carries the remaining work named as out of scope by the contract: retiring the repo config scope and `McpConfigScope`, removing the `ensureGitignoreEntries` compensation, relocating `chatgpt-browser.local.json` to user level, and clearing the inert `ignoreLines` array at `src/cli/chatgpt-browser/engine.ts:174-179` that still names the two retired per-file paths.
- A future contributor who needs to track a file under `.repo-harness/` cannot do it with a plain negation, because git does not descend into an ignored directory. That would require switching to `.repo-harness/*` plus an explicit negation. No such need exists today.
- `bun src/cli/index.ts init --repo . --dry-run` plans 0 operations in this source checkout by design, so it does not exercise the adoption planner's gitignore operation. That surface is covered instead by `tests/scaffold-parity.test.ts`, `tests/create-project-dirs.runtime.test.ts`, and `tests/unit/gitignore-plan.test.ts`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Closes the credential-exposure class at every authored surface; three probes and the empty `git ls-files` falsifier confirm it. |
| Product depth | 8/10 | Fixes the class rather than the reported instance, and stops at the declared slice boundary instead of pulling Slice 2 forward. |
| Design quality | 9/10 | One directory rule replaces six scattered per-file lines; no compatibility shim, no dual authority, no new abstraction. |
| Code quality | 8/10 | New unit test asserts exact lines and an empty residual set; the three updated legacy assertions remain substring-based with one negative each. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/unit/gitignore-plan.test.ts tests/workflow-contract.test.ts tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts`
- Re-check: `git check-ignore -v .repo-harness/mcp.oauth-tokens.json` reports IGNORED through `.gitignore:74`, `git check-ignore .repo-harness-owner.json` exits 1, and `git ls-files .repo-harness/` stays empty.

## Summary

- PASS. Per-file `.repo-harness/` gitignore entries collapse into one directory-level rule across all four authored surfaces, closing the path where `repo-harness mcp serve --transport http` leaves OAuth access and refresh tokens on disk in NOT-IGNORED state for any user who never ran `mcp setup chatgpt` with repo scope. Scope matches `allowed_paths` exactly and every out-of-scope surface named by the contract is untouched. Misfire checks are clean: nothing under `.repo-harness/` is tracked, no negation pattern depends on descending into the directory, and `.repo-harness-owner.json` is not over-matched. Verification ran in full: `bun test` 2217 pass / 1 skip / 0 fail, `check:type`, init dry-run, the contract exit criteria, and every repo required check.
