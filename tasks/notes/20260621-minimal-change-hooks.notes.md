# Minimal-Change Hooks Notes

## 2026-06-21 PR1 Slice

- Source PRD: `plans/prds/Cherry-pick Analysis of Ponytail into Repo-harness Hooks.md`.
- Source sprint: `plans/sprints/20260621-minimal-change-hooks.sprint.md`.
- Baseline commit for this worktree: `e60a1d6fc4cd9afda6c5cd9b42d56c0cd5363b86` (`main` / `origin/main`).
- Main checkout was dirty on `codex/release-0.7.5`; this work runs in isolated branch/worktree `codex/minimal-change-hooks` at `/Users/ancienttwo/Projects/repo-harness-wt-minimal-change-hooks`.
- Full sprint is a 10-day backlog. This delivery intentionally implements the first coherent PR slice only: policy parser, fixed context renderer, hook-only CLI, SessionStart internal hook, route registry wiring, repo/assets parity, and targeted tests.
- `signals` and `review` hook-only CLI actions currently fail open: `signals` is stdout-silent and `review` returns an internal `unknown`/`disabled` JSON shape. They are not wired into PostToolUse or Stop in this slice.
- Public route tuples are unchanged. Only `SessionStart.default.scripts` adds `minimal-change-context.sh` between `session-start-context.sh` and `security-sentinel.sh`.
- The feature is advisory-only. `mode=enforce` normalizes to `advice` with a warning and `blocking=false`.

## Baseline Evidence

- `bun run check:type` initially failed before implementation because dependencies were not installed in the new worktree (`tsc: command not found`). `bun install --frozen-lockfile` fixed the environment.
- Pre-change targeted hook suite had one existing failure: `tests/hook-recursive-copy.test.ts` timed out at 15s in `migrate-project-template`; 149 tests passed, 1 failed. This was recorded before code changes and should not be treated as a minimal-change regression without a rerun in a less loaded environment.

## 2026-06-21 PR2 Slice

- Implemented `src/cli/hook/minimal-change-signals.ts` as a bounded, single-path objective signal collector. It supports package.json new/removed dependency signals, untracked/new file signals, protected concern classification, low-confidence abstraction candidates, deterministic fingerprinting, and atomic report writes.
- Wired `repo-harness-hook minimal-change signals --phase post-edit --path <path>` to the collector. The hook-only CLI remains stdout-silent for signals and fail-open on errors.
- Added `.ai/hooks/minimal-change-observer.sh` and `assets/hooks/minimal-change-observer.sh`; both extract the current Edit/Write path through `hook-input.sh`, call the hook-only CLI, and never emit host decision JSON.
- Updated `PostToolUse.edit` internal scripts to `['post-edit-guard.sh', 'minimal-change-observer.sh']`. Public route event/routeId/matcher/order are unchanged.
- Added script-level soft-missing only for `minimal-change-observer.sh`, so stale repo-pinned hooks skip the new advisory observer without weakening the existing required `post-edit-guard.sh`.
- `mode=off` produces no report. Identical event fingerprints do not rewrite the existing report.
- 2026-06-22 review follow-up changed missing/malformed policy to default-off and made
  `minimal-change-observer.sh` silent unless `post_edit_observer:true` is explicitly set.

## 2026-06-21 PR3 Slice

- Integrated prompt advice through the existing `prompt-guard.sh` owner. No new `UserPromptSubmit` route script was added.
- Prompt advice is emitted only after the decision engine returns `PG_ACTION=allow` for an execution intent. Block/advisory gates such as missing spec, missing plan, incomplete evidence, or missing contract keep their existing output without minimal-change noise.
- `mode=off` now returns a silent success path for prompt advice; this caught and fixed a `set -e` edge where empty helper output had returned exit 1.
- Integrated Stop review through the existing `stop-orchestrator.sh` owner. No new `Stop` route script was added.
- Stop reads the internal `minimal-change review --phase stop` JSON, upserts report
  path/verdict/finding count into `.ai/harness/handoff/current.md`, and appends
  findings to existing Stop block reasons when another Stop gate already blocks.
- Non-blocking Stop success remains free of host decision JSON. The Codex dispatcher still forwards only valid Stop decision JSON and suppresses handoff noise.
- 2026-06-22 review follow-up moved the `stop_hook_active` guard before handoff
  refresh/review so recursive Stop continuations have no file side effects.

## 2026-06-21 PR4 Slice

- Added explicit `minimal_change` opt-in policy to self-host policy, init/migration policy templates, and the strict workflow bootstrap path.
- Added `docs/reference-configs/minimal-change-hooks.md` plus packaged `assets/reference-configs/minimal-change-hooks.md`; registered the file in minimal/full reference config lists and workflow-contract required files.
- Updated README, Chinese README, and changelog to document minimal-change as advisory review evidence instead of a hard enforcement layer.
- Updated scaffold, migration, workflow-contract, helper-script, and route/runtime tests so adoption, package, repo-pinned hooks, non-pinned pruning, and missing observer soft-skip paths cover the new files.
- Fixed a fixture-only regression in `tests/helper-scripts.test.ts`: its temporary workflow surface had to create the new required reference config file after PR4 registered it in the workflow contract.

## Final Verification

- `bun run check:type` passed.
- `bun test --timeout 120000 --max-concurrency 2` initially found the helper-script fixture gap above; after the fix, the relevant helper subset passed.
- A full isolated CI pass completed with `BUN_TEST_TIMEOUT_MS=120000 BUN_TEST_MAX_CONCURRENCY=1 BUN_TEST_ISOLATE_FILES=1 bash scripts/check-ci.sh`.
- That CI pass included all test files, workflow checks, repository inspection, package dry-run, and tarball smoke; final result: `[ci] OK`.
