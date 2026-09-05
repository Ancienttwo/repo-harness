# Plan: Verification scope and profile snapshot consistency

> **Status**: Approved
> **Created**: 20260905-1446
> **Planning Source**: waza-think
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Named state/hook, prompt, assembly and exact-context/delta fixtures plus root integrity checks; no full suite
> **Rollback Surface**: Revert only the owned code, guidance and generated projection diff; no data migration
> **Spec**: `docs/spec.md`

## Promotion Gate
- **Merge/PR unit**: verification selection and current-profile guidance form one bounded repair.
- **Rollback surface**: revert this task's patch only.
- **Verification boundary**: focused state/guard progression, prompt/assembly, exact-context and delta evidence fixtures.
- **Review/acceptance boundary**: validate the named behavior and record commands/results here.
- **High-risk surface**: preserve profile risk floors and stale-evidence rejection; no guard disabling.
- **Why not checklist row**: user explicitly requested a file-backed plan for this shared workflow correction.

## Evidence Contract
- **State/progress path**: this plan's Task Breakdown.
- **Verification evidence**: executed command output and Verification Results in this plan.
- **Evaluator rubric**: no blanket full-suite trigger; bounded follow-up acceptance executes focused criteria; current-profile diagnostics reconcile historical lite guidance while standard/strict still block missing approvals.
- **Stop condition**: scoped regression and integrity checks pass, or a specific external blocker is reported without weakening checks.
- **Rollback surface**: revert only this task's code/rule/projection changes; no data migration.

## Goal
Complete the authorized verification-cost repair and remove the contradiction between a historical lite SessionStart snapshot and current edit-time plan requirements.

## P1 — Map
Verification selection is authored in root AGENTS/CLAUDE, generated host partials, contract templates, contract-run worker/verifier prompts, and the externally managed Waza check skill. Exact-context evidence execution and reuse already belong to verify-sprint/verify-contract. Profile selection belongs to src/core/workflow/profile.ts and src/effects/state/resolve-effective-state.ts; SessionStart projects that state through src/cli/hook/runtime.ts, and mutation-guard consumes it for the edit operation. The existing dirty diff belongs to this same authorized repair.

## P2 — Trace
A clean/no-task SessionStart resolves inspect/lite. Later edits add implementation paths and capabilities; the resolver unions the current diff and proposed edit paths and resolves standard. The old guidance says do not author a plan, while PlanStatusGuard blocks the current edit without reporting the newer profile. Reproduce this progression in one fixture with a real repository and the same resolver. Separately reproduce full-pass -> bounded follow-up -> parent-revised focused criteria, preserving the baseline snapshot and proving no additional full-suite invocation.

## P3 — Decision
Keep the single profile resolver, risk floor, plan approval guard, exact-context cache identity and evidence admission unchanged. Scope ceremony guidance to the observed state: lite means no mandatory ceremony, not a ban on user-requested planning or later promotion. Missing-plan feedback includes current profile/reasons/state revision and directs standard to one approved plan, strict to the existing execution flow. Do not disable guards, add fallback classifiers, cache stale passes, or create a second verification scheduler.

## Scope
- Retain and complete the existing verification rule/template/prompt changes and local Waza explicit-command repair.
- Complete assets/partials-agents/06-quality-safety.partial.md and its assembly tests.
- Update src/core/state/project-effective-state.ts ceremony guidance and src/cli/hook/mutation-guard.ts missing-plan diagnostics, with focused state and mutation fixtures.
- Make the missing-contract branch of scripts/check-task-workflow.sh consume the canonical state resolver's admission decision; preserve failures and existing-contract validation. Verify this branch with a focused helper fixture.
- Update existing documentation and tasks/lessons.md, synchronize generated mirrors, and bind durable evidence in this plan.
- Standard workflow uses this one plan as scope, progress, decisions, and validation authority; no separate contract/review/notes scaffolding is required. External release/publish and unrelated sprint/worktree cleanup are outside scope.

## Verification Boundary
Run bun test tests/contract-run.test.ts tests/assembly.test.ts tests/agents-assembly.test.ts tests/state/project-effective-state.test.ts tests/mutation-guard.test.ts tests/session-state-authority.test.ts tests/runtime-profile-enforcement.test.ts tests/plan-status-gate.test.ts. Run only the named expensive-criterion reuse, stale-context rejection, and bounded-delta fixtures from tests/helper-scripts.test.ts. Run check:type and check:state-boundaries for the hook/state seam. Run helper/reference projection checks and the six root integrity checks. Use isolated Waza command-selection smoke; no network/provider evaluations and no full bun test. Named fixtures cover the changed behavior; broader verification requires an observed uncovered risk, not a changed hash.

## Task Breakdown
- [x] Capture and activate this approved single-plan work-package.
- [x] Add and run the failing lite-snapshot -> current-standard diagnostic regression.
- [x] Repair snapshot guidance and profile-aware missing-plan feedback without weakening guard decisions.
- [x] Finish both generated host verification entrypoints and the bounded-delta acceptance regression.
- [x] Run scoped validation, synchronize mirrors and task evidence, and record any residual runtime installation gap.

## Rollback
Revert only the owned patch and its projections; restore the two locally changed Waza files if that repair is reverted. No schema, dependency, provider state, secrets, or persisted-data migration changes.

## Root Cause Evidence
- root_cause: SessionStart lite guidance was phrased as an absolute authoring ban; subsequent PreEdit resolved a larger standard scope but missing-plan feedback omitted that current profile and suggested strict scaffolding even for standard.
- repro: `bun test tests/mutation-guard.test.ts --test-name-pattern 'a lite snapshot yields'` on the old implementation reached PlanStatusGuard but lacked `current workflow profile: standard`; exit 1.
- regression_guard: the named fixture starts lite, allows one edit, rejects a five-file edit with the new standard profile/reasons/revision, and still blocks a raised standard edit without an approved plan.
- pre_fix_failure_artifact: captured command output in this session; the assertion failed at `tests/mutation-guard.test.ts:226` because the old message only said `without an active plan` and recommended `--execute` or disabling the guard.

## Verification Results
- Prompt/assembly/state/mutation batch: 97 passed initially; the two failed cases were corrected and rerun independently (AGENTS assembly 1 pass, profile transition 1 pass). Existing passing cases were not rerun.
- Session state authority/runtime profile/plan-status boundary: 51 passed, 0 failed.
- Canonical criterion reuse plus bounded follow-up: 1 passed, 38 assertions. The fixture preserves prior full-run evidence, revises the contract to a focused command for changed bytes, and proves the expensive invocation count does not increase.
- `bun run check:type`: pass.
- `bun run build:hook-bundle`: pass; 116 modules, built local bundle.
- Helper and reference projections: pass.
- `bun run check:state-boundaries`: pass after the user reported the separate reverse-dependency repair; 281 TypeScript files checked, canonical helper projection verified. No out-of-scope dependency fix applied by this task.
- Root integrity: deploy SQL, project-state inspection and init dry-run passed. `check-task-workflow.sh --strict` now passes after its unconditional missing-contract requirement was replaced with the canonical resolver's admission decision. Existing contracts still require capability bindings; unavailable or blocked resolution still fails closed.
- Workflow helper regression: pre-fix failed the standard admission assertion; post-fix 1 passed, 10 assertions, covering admission, resolver rejection/unavailability, and existing malformed contracts. Only this new fixture was run after the helper change; helper projection and diff hygiene were checked again.
- Task sync passed with the final substantive digest below. Shell syntax and diff hygiene passed.
- Architecture recovery: after user approval, retried `job-25ccb6969cb0b71633353266` through `architecture-projection retry-dead-letter`, then drained without further source edits. Drain succeeded with `resultStatus: applied`, receipt count 268, pending 0, running 0, deadLetters 0 and sourceJournalPending 0. The previous worktree-change precondition failure is cleared; no guard or projection workaround was applied.
- Post-recovery `bash scripts/check-architecture-sync.sh`: pass, blocking 0, provider ready. Generated projection changes remain uncommitted. No full suite was rerun for this operational recovery.
- No full suite or provider evaluation was run. Runtime decision conditions and cache identity are unchanged; focused fixtures exercise the modified guidance/diagnostic/selection boundaries.
- Local Waza explicit-command smoke passed earlier in this task: selected argv only, literal argument preservation, missing-command zero spawn, and exact exit status propagation. The externally managed skill remains a local patch that an upstream refresh may replace.
- Global runtime activation completed after explicit user approval. Packed the current source with `npm pack`, installed that tarball via `bun add -g`, and applied `repo-harness install --location global --target both --profile full`. CLI/hook and both host skill links resolve to `~/.bun/install/global/node_modules/repo-harness`; 11 changed source/template/bundle files match the source byte-for-byte. Installed hook bundle SHA256: `b3ad576a8c3f10c997c0621b92fede6112ab51f0f4207fb5e3f11b638c654680` (version remains 0.18.0; no registry publication).
- Installed-entry smoke: `repo-harness doctor --json` reports 12 ok, 0 warn, 0 fail; the installed workflow helper passes strict mode; `repo-harness state resolve --json --field guidance` returns the corrected snapshot guidance; `repo-harness-hook review-subject --target main --format json` returns status ok. Waza SKILL.md and run-tests.sh hashes are unchanged from before activation. No full suite was run.
- The broad profile installer was attempted first but rolled back after unrelated skill ownership checks failed. Activation used the package-manager and adapter-only entrypoints; no refused skill surface was overwritten or ownership guard disabled.
- Authorized Waza dependency refresh: installed `think`, `hunt`, `check`, and `health` with `skills add https://github.com/tw93/Waza/tree/v3.35.0 -g -a claude-code codex -s think hunt check health -y`. Latest release was verified through GitHub Releases; tag v3.35.0 resolves to `610b53a4ccc513031a6c1490ae45b25374ffac36`. Skills CLI wrote all four `ref: v3.35.0` lock entries. Complete Codex runtime directories and the four managed shared rules match staging; shared rules match the tag for both hosts. No repo npm dependency exists for Waza.
- Waza v3.35.0 still auto-detects broad tests in check/scripts/run-tests.sh. Preserved only the prior cost-policy changes in check/SKILL.md and that helper, atop the new release; all other managed skill files match upstream. Directory parity and explicit-command smoke passed (missing command exits 2, literal argv preserved, selected exit 23 propagated). No full test suite or skill evaluation was run for this dependency refresh.

> **Substantive Change SHA256**: `sha256:0cd4c824f6ed33d0e9e9a55748257e266dd9ad1541307079c75c274d1763d5ab`

## Main Integration Evidence

The user approved landing this completed repair as the prerequisite to context-drift diagnostics. A full disposable clone at `eb287895` preserved all 27 existing changed/untracked paths byte-for-byte. The following `9fd90f20` commit changed only separate risk-floor documentation; dependency bytes remained identical.

- Snapshot assembly/profile/prompt checks: 19 pass, 0 fail, 181 assertions. Missing-contract admission fixture: 1 pass, 0 fail, 10 assertions.
- Typecheck, 56 helper projections, 23 reference projections and state-boundaries (281 TypeScript files): pass. Wider earlier evidence above remains scoped to its original run; no full suite was repeated.
- Primary workflow, deploy SQL, project inspection and init dry-run pass; init has zero operations. Architecture drain completed with a noop receipt, pending/running/deadLetters/sourceJournalPending all zero, after the documentation-only target movement.
- Snapshot and logs: `/tmp/verify-context-integration-okcr7mzn/`. This prerequisite is committed separately from the diagnostics change; no unrelated working bytes are removed or folded into that implementation.
