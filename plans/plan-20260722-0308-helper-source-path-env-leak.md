# Plan: REPO_HARNESS_HELPER_SOURCE_PATH env leak lets nested helper invocations resolve the wrong package root

> **Status**: Executing
> **Created**: 20260722-0308
> **Slug**: helper-source-path-env-leak
> **Program**: unblocks Sprint C acceptance machinery (verify-sprint bun-test criterion)
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bun test tests/install-agent-fleet.test.ts + full bun test + bun run check:helpers + repo-harness run check-task-workflow --strict + contract-run preflight --json + repo-harness run verify-sprint --prepare-acceptance
> **Rollback Surface**: Revert branch codex/helper-source-path-env-leak; no data migration, no schema
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md`
> **Task Review**: `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md`
> **Implementation Notes**: `tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Out-of-band hotfix authored directly against a proven diagnosis; not routed through Codex Plan or Waza think.
- Source ref: (none)
- Due diligence:
  - P1 map: `scripts/install-agent-fleet.sh:37` leaks `REPO_HARNESS_HELPER_SOURCE_PATH` trust into `tests/install-agent-fleet.test.ts` child invocations under `repo-harness run verify-sprint`'s bun-test criterion wrapper.
  - P2 trace: helper-runner.ts exports the parent helper's own resolved path so it can find its true package root; a child process that blindly inherits that var and applies the same `${VAR:-$0}` pattern for an unrelated script wrongly trusts it.
  - P3 decision rationale: guard acceptance by basename-of-self match instead of scrubbing test env, so the fix holds for every real invocation path, not just the test harness.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-0308-helper-source-path-env-leak.md`
- Sprint contract: `tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md`
- Sprint review: `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md`
- Implementation notes: `tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-0308-helper-source-path-env-leak.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-0308-helper-source-path-env-leak.md`.

## Approach
### Strategy
One narrow out-of-band hotfix work-package. Task Profile: bugfix (Root Cause Evidence below is pre-captured for the anchor defect, `scripts/install-agent-fleet.sh:37`).

- **Anchor defect (CONFIRMED)**: `scripts/install-agent-fleet.sh:37` `helper_source="${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}"` blindly trusts the env var. Under `repo-harness run verify-sprint`, the helper runtime exports `REPO_HARNESS_HELPER_SOURCE_PATH=<...>/assets/templates/helpers/verify-sprint.sh` for its own use; the criterion wrapper `env -u BASH_ENV bash --noprofile --norc -c "bun test"` does not strip it; `tests/install-agent-fleet.test.ts` forwards `{...process.env, HOME: home}` to the installer child, so the installer resolves `package_root` from the leaked verify-sprint path (the real global/dev install) instead of `$0` (the test's packaged bad fixture) — 8 tests wrongly pass (exit 0) where fail-closed was expected.
- **Fix**: accept `REPO_HARNESS_HELPER_SOURCE_PATH` only when it is plausibly the running script's own forwarded identity — an existing file whose basename equals `basename "$0"` (or the file's existing `BASH_SOURCE[0]`-derived self-reference where already used) — otherwise fall back to the script's own path. Product-side guard; tests are not scrubbed (that would mask the defect class).
- **Class sweep**: every `${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}` instance and close variant (if-based `-n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}"` acceptance, and the TypeScript analog in `capability-config.ts`) gets the same guard, in both `scripts/` and its `assets/templates/helpers/` twin via `bun run sync:helpers`.
- **Regression guard**: a new case in `tests/install-agent-fleet.test.ts` injects a decoy `REPO_HARNESS_HELPER_SOURCE_PATH` (pointing at a different real existing helper, `assets/templates/helpers/verify-sprint.sh`) into the installer child env and asserts the installer still fails closed on a bad packaged fixture. Red-first: captured on unfixed code before the script fix lands.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Basename-of-self guard at every consumer | Fixes the defect at its real trust boundary; holds for every real invocation path, not just tests | Touches every consumer of the pattern (13 files) | **Chosen** |
| Scrub `REPO_HARNESS_HELPER_SOURCE_PATH` in the test's child env instead | Zero product code change | Masks the defect class; leaves every non-test nested invocation still vulnerable | Rejected |
| Strip the var at the helper-runner export boundary instead of guarding consumers | Smaller diff (one file) | The var's whole purpose is to survive a script being copied/adopted elsewhere; stripping it there breaks that legitimate use | Rejected |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `scripts/install-agent-fleet.sh` | edit | `:37` basename-of-self guard before trusting `REPO_HARNESS_HELPER_SOURCE_PATH` (anchor defect) |
| `scripts/check-agent-tooling.sh` | edit | `:4` same guard (identical shape) |
| `scripts/ship-worktrees.sh` | edit | `:29` same guard |
| `scripts/prepare-codex-handoff.sh` | edit | `:37` same guard |
| `scripts/sprint-backlog.sh` | edit | `:25` same guard |
| `scripts/contract-worktree.sh` | edit | `:29` same guard |
| `scripts/workstream-sync.sh` | edit | `:16` direct-assignment guard + `:89-90` `helper_sibling()` if-based guard |
| `scripts/ensure-task-workflow.sh` | edit | `:12` same guard |
| `scripts/heartbeat-triage.sh` | edit | `:20` same guard (variable named `SCRIPT_DIR`) |
| `scripts/architecture-queue.sh` | edit | `:78-79` `helper_sibling()` if-based guard |
| `scripts/check-architecture-sync.sh` | edit | `:97-98` `helper_sibling()` if-based guard |
| `scripts/check-task-workflow.sh` | edit | `:615` `package_helper_dir()` guard, preserving its existing hardcoded-relative-path fallback tier |
| `scripts/capability-config.ts` | edit | `:35-36` TypeScript analog: guard against `basename(fileURLToPath(import.meta.url))` |
| `assets/templates/helpers/*` twins of the twelve `.sh`/`.ts` files above | generated | `bun run sync:helpers` projection |
| `tests/install-agent-fleet.test.ts` | edit | `runInstaller()` gains an optional `extraEnv` parameter; new regression-guard test with a decoy `REPO_HARNESS_HELPER_SOURCE_PATH` |
| `.ai/harness/runs/helper-source-path-env-leak-pre-fix.log` | new (artifact) | Captured pre-fix failing run of the new test on unfixed code |

### Code Snippets
Guard shape (bash, direct-assignment sites):
```bash
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
```
Guard shape (bash, `helper_sibling()` if-based sites) swaps the bare `-n` test for the same three-part check, comparing against that file's own self-reference (`$0` or `${BASH_SOURCE[0]}`, whichever the file already uses).

### Data Flow
`repo-harness run verify-sprint` (helper-runner.ts) → exports its own resolved path as `REPO_HARNESS_HELPER_SOURCE_PATH` for `verify-sprint.sh`'s own use → `verify-sprint.sh`'s bun-test criterion wrapper inherits full env → `bun test` → `tests/install-agent-fleet.test.ts` spawns the installer child with `{...process.env, HOME: home}` → installer now rejects the inherited var (basename mismatch) and falls back to its own `$0`.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Guard rejects a legitimate adopted-copy forwarding case | Low | Medium | Guard accepts same-basename forwarding unconditionally (the adopted-copy design intent); only a differently-named script is rejected |
| Helper twins drift after hand-editing `scripts/*` | Low | Low | `bun run sync:helpers` regenerates `assets/templates/helpers/*`; `bun run check:helpers` gates parity |
| Existing tests that rely on same-basename decoy forwarding regress | Low | Low | Surveyed every existing test that sets this env var before editing; all set same-basename decoys |

## Task Contracts
- Contract file: `tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md`
- Review file: `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md`
- Implementation notes file: `tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Branch `codex/helper-source-path-env-leak`, one PR; out-of-band hotfix, not a Sprint C row.
- **Rollback surface**: Revert branch codex/helper-source-path-env-leak; no data migration, no schema.
- **Verification boundary**: bun test tests/install-agent-fleet.test.ts + full bun test + bun run check:helpers + repo-harness run check-task-workflow --strict + contract-run preflight --json + repo-harness run verify-sprint --prepare-acceptance.
- **Review/acceptance boundary**: `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: none named — helper scripts plus one test file; the guard is additive and only rejects previously-mistrusted leaked values.
- **Why not checklist row**: verification_boundary — this unblocks Sprint C's own acceptance machinery (verify-sprint's bun-test criterion), so it must land and verify independently before any Sprint C row can trust that criterion again.

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-0308-helper-source-path-env-leak.md` task breakdown, `tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md`, `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md`, `tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, `.ai/harness/runs/helper-source-path-env-leak-pre-fix.log`
- **Evaluator rubric**: `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert branch codex/helper-source-path-env-leak; no data migration, no schema

## Captured Planning Output

(none — this plan is authored directly from a prior diagnosis pass, not captured from Codex Plan or Waza think.)

## Task Breakdown

- [ ] Verify the deterministic repro myself (both env-var states) before editing anything
- [ ] Add the regression-guard test to `tests/install-agent-fleet.test.ts` (decoy pointing at `assets/templates/helpers/verify-sprint.sh`); capture its pre-fix failing run to `.ai/harness/runs/helper-source-path-env-leak-pre-fix.log`
- [ ] Fix the anchor defect `scripts/install-agent-fleet.sh:37` with the basename-of-self guard
- [ ] Sweep the repo for every `${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}`-class instance and close variant; apply the same guard to each
- [ ] `bun run sync:helpers` to project `scripts/*` onto `assets/templates/helpers/*`; `bun run check:helpers` to confirm parity
- [ ] Re-run the regression-guard test green; re-run the two deterministic env repros green
- [ ] Full `bun test`, `repo-harness run check-task-workflow --strict`, `contract-run preflight --json`, `repo-harness run verify-sprint --prepare-acceptance`
- [ ] Commit locally (no push, no PR)

## Constraints

- No benchmark end-to-end runs, no `--profile/--scenario/--regrade-existing`, no `--force`, no push, no PR.
- Tests are not scrubbed to hide the leak; the fix is product-side only.
- Nothing beyond the guard, the sweep, the regression test, and lifecycle docs.

## Acceptance

- Both deterministic env repros from the diagnosis flip to green with the fix in place.
- `tests/install-agent-fleet.test.ts` is fully green, including the new regression-guard case.
- Full `bun test` is green.
- Helper twin sync check is green.
- `repo-harness run check-task-workflow --strict` and `contract-run preflight --json` are green in the worktree.
- `repo-harness run verify-sprint --prepare-acceptance` is green (the acid test this defect previously broke).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Verify the deterministic repro myself (both env-var states) before editing anything
- [x] Add the regression-guard test to `tests/install-agent-fleet.test.ts` (decoy pointing at `assets/templates/helpers/verify-sprint.sh`); capture its pre-fix failing run to `.ai/harness/runs/helper-source-path-env-leak-pre-fix.log`
- [x] Fix the anchor defect `scripts/install-agent-fleet.sh:37` with the basename-of-self guard
- [x] Sweep the repo for every `${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}`-class instance and close variant; apply the same guard to each
- [x] `bun run sync:helpers` to project `scripts/*` onto `assets/templates/helpers/*`; `bun run check:helpers` to confirm parity
- [x] Re-run the regression-guard test green; re-run the two deterministic env repros green
- [x] Full `bun test`, `repo-harness run check-task-workflow --strict`, `contract-run preflight --json`, `repo-harness run verify-sprint --prepare-acceptance`
- [ ] Commit locally (no push, no PR)
