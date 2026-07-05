# Task Review: frontend-task-profile

> **Status**: Done
> **Plan**: plans/plan-20260706-0140-frontend-task-profile.md
> **Contract**: tasks/contracts/20260706-0140-frontend-task-profile.contract.md
> **Notes File**: tasks/notes/20260706-0140-frontend-task-profile.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-06 03:13
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:2a120291c3d5cb2d237a5564e37499f048ac82e19181ab6df76c901150ace65b
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `scripts/verify-contract.sh` + helper mirror (enum + frontend conditional case); `scripts/harness-trace-grade.sh` + helper mirror (enum sync); `design-brief.template.md` new file pair (assets + `.claude/templates/`, parity); scaffold registration surfaces (`ensure-task-workflow.sh` ×2, `project-init-lib.sh`, workflow-contract manifests if listed); `repo-harness-prd/SKILL.md` frontend routing note; affected tests.
- Actual files changed (18 implementation files, +957/-11 including `tasks/todos.md`, per `git diff --stat codex/intake-trigger-rules...HEAD`; contract's own Rollback Point base is `18e42a3` = the `codex/intake-trigger-rules` tip at branch-creation time): `.claude/templates/design-brief.template.md`, `.claude/templates/review.template.md`, `assets/skill-commands/repo-harness-prd/SKILL.md`, `assets/templates/design-brief.template.md`, `assets/templates/helpers/ensure-task-workflow.sh`, `assets/templates/helpers/harness-trace-grade.sh`, `assets/templates/helpers/verify-contract.sh`, `assets/templates/review.template.md`, `plans/plan-20260706-0140-frontend-task-profile.md`, `scripts/ensure-task-workflow.sh`, `scripts/harness-trace-grade.sh`, `scripts/lib/project-init-lib.sh`, `scripts/verify-contract.sh`, `tasks/contracts/20260706-0140-frontend-task-profile.contract.md`, `tasks/notes/20260706-0140-frontend-task-profile.notes.md`, `tasks/todos.md` (header timestamp only — see Residual risks), `tests/fixtures/harness-traces/frontend-pass.json`, `tests/helper-scripts.test.ts`, `tests/scaffold-parity.test.ts`, plus this review file (excluded from the diff fingerprint by design).
- Commands passed: `bun test` (1030 pass / 1 skip / 1 fail — the 1 fail is a confirmed unrelated resource-contention timeout, see Verification Evidence); `bash scripts/check-task-workflow.sh --strict` (pass); 3/3 `diff -q` exit_criteria parity checks (pass); protocol-string `files_contain` checks (pass).
- External acceptance: fail. Codex's independent read-only acceptance pass returned `fail` with one P1 (scope-fidelity: `tasks/todos.md` is touched but not listed in this contract's `allowed_paths` — same root cause as contract A) and one P2 (enum-sync gap already self-disclosed in this task's own notes). See External Acceptance Advice. A prior gatekeeper (Opus) acceptance pass over the same diff returned PASS, explicitly naming the `tasks/todos.md` timestamp bump as benign scope.
- Residual risks:
  - `tasks/todos.md` is modified (only the `> **Updated**:` header timestamp — confirmed via `git diff`; no ledger content changed) but is not in this contract's declared `allowed_paths`. Same structural gap as contract A (`20260706-0024-intake-trigger-rules`); mechanically confirmed by both Codex's acceptance pass and `repo-harness run verify-sprint`'s `allowed_paths_check` guard. Needs an explicit orchestrator decision (widen `allowed_paths` or drop the diff).
  - **PR topology change mid-review**: contract A's PR #48 (this contract's declared base, `codex/intake-trigger-rules`) was merged to `main` and its branch deleted while this review cycle was in progress. GitHub auto-retargeted PR #49's base to `main`. Because `main`'s new tip does not share ancestry with the `codex/intake-trigger-rules` commits this branch was built on (recomputing the fingerprint against `origin/main` returns 28 paths, not 18 — it now also lists contract A's already-merged files), the live GitHub compare view for PR #49 will look noisy/duplicated until someone rebases this branch onto current `main` or the PR base is repaired. This review's fingerprint and Codex pass both used the original, correct base (`codex/intake-trigger-rules` @ `18e42a3`, i.e. `18e42a3..HEAD`) to isolate this contract's own diff; the rebase/base-repair itself is unresolved and out of this review's scope.
  - Notes' self-disclosed, explicitly out-of-scope adjacent findings (not implemented, outside `allowed_paths`): `scripts/plan-to-todo.sh:948` / helper mirror still omit `frontend` from a display-only fallback change-type string (matches Codex's P2 below — independently confirmed, not a new gap); `assets/reference-configs/sprint-contracts.md`'s Task Profiles table not updated; `docs/researches/20260616-harness-engineering-frameworks.md:77` stale prose reference; `assets/workflow-contract.v1.json` `requiredFiles` intentionally not extended for `design-brief.template.md` (matches existing `prd.template.md` asymmetry, not a new gap); a pre-existing, unrelated one-line drift between `assets/templates/contract.template.md` and `.claude/templates/contract.template.md` left untouched to avoid scope creep.
- Reviewer action required: orchestrator sign-off on (1) the `tasks/todos.md` scope-fidelity gap and (2) the PR #49 base-branch repair/rebase needed after contract A's mid-review merge, before this PR is treated as gate-green or human-merged.
- Rollback: revert branch `codex/frontend-task-profile`; no data migration (contract Rollback Point: base `18e42a3`, the `codex/intake-trigger-rules` tip, stacked on PR #48).

## Mode Evidence

- Selected route: waza-think captured plan (`Planning Source: waza-think`, `Orchestration Kind: host-plan`, `Source Ref: WP5 from intent-mismatch analysis 2026-07-05; Jackywxsz DESIGN.md flow adaptation`).
- P1/P2/P3 evidence:
  - P1 map — plan `## Captured Planning Output > Context` frames the decision ("open a dedicated frontend profile, reuse the existing closed-enum + per-profile-conditional pattern the HE-04 precedent already established at `verify-contract.sh:526-553`") and scopes the machine surface to two facts only: the enum recognizes `frontend`, and a frontend contract must reference a design-brief artifact.
  - P2 trace — plan `## Scope / Non-scope` traces each file to its edit: `verify-contract.sh`/helper enum + conditional case; `harness-trace-grade.sh`/helper enum sync; new `design-brief.template.md` pair with the five-criterion manual-confirmation checklist; scaffold registration across `ensure-task-workflow.sh` ×2 and `project-init-lib.sh`; `SKILL.md` frontend routing note. The plan's `### frontend 條件 case 語義` section specifies the exact match rule (docs/design/ prefix OR basename containing DESIGN/design-brief, case-insensitive) that `verify-contract.sh:558` implements verbatim.
  - P3 decision — plan `## Trade-offs` rejects both a `contract-run.ts` brief-preflight hard gate (touches a shared-maintenance surface beyond what's needed) and a pure-skill-convention-only approach (would leave "frontend work needs a design brief" with zero machine anchor, recreating the original problem) in favor of the minimal enum+conditional+template approach, matching the already-completed HE-04 precedent pattern.
- Root cause or plan evidence: the 2026-07-05 intent-mismatch analysis (WP5) plus the referenced `@Jackywxsz` DESIGN.md-first workflow are the decision record this plan executes; the five-criterion manual-confirmation checklist and imagegen-as-optional-enhancement framing both come directly from that source.

## Verification Evidence

- Waza `/check` run: not applicable — this contract executes through the repo-harness contract/worktree pipeline (`repo-harness run verify-contract` / `verify-sprint`), not a Waza `/check` invocation.
- Commands run:

| Command | Result | Notes |
|---|---|---|
| `bun test` | 1030 pass / 1 skip / 1 fail, 10822 `expect()` calls, Ran 1032 tests across 93 files [650.19s] | The 1 fail (`tests/cli/init.test.ts > init command > defaults --repo to cwd and applies the existing-repo harness`) timed out at 5000ms only because this run executed concurrently with contract A's full suite plus two `codex exec` processes on the same host. Isolated re-run — same test filter — 1 pass / 0 fail, 3.26s. Confirmed unrelated to this diff. |
| `bash scripts/check-task-workflow.sh --strict` | `[brain] OK` / `[BrainSync] OK` / `[workflow] OK`, exit 0 | |
| `diff -q scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh` | exit 0 (identical) | |
| `diff -q scripts/harness-trace-grade.sh assets/templates/helpers/harness-trace-grade.sh` | exit 0 (identical) | |
| `diff -q assets/templates/design-brief.template.md .claude/templates/design-brief.template.md` | exit 0 (identical) | |
| Manual read of `verify-contract.sh:554-566` (frontend conditional case) | matches plan's exact match rule: `docs/design/*` prefix OR lowercased basename contains `design` | independently re-derived this cycle; confirms an arbitrary filename (no "design" substring, not under `docs/design/`) does not satisfy the rule |
| `repo-harness run verify-contract --contract tasks/contracts/20260706-0140-frontend-task-profile.contract.md --strict` | pass pre-fill except `qa_scores`/`manual_checks` (only because this review file was still the unfilled stub) | `.ai/harness/checks/latest.json` |
| `codex exec --sandbox read-only -C <worktree>` (external acceptance) | fail — 1 P1, 1 P2 | see External Acceptance Advice; started ~2026-07-06 02:50 +0800, completed 2026-07-06 02:55:16 +0800 |
| `repo-harness run verify-sprint` | fail — `allowed_paths` and `external_acceptance` guards fail on the same `tasks/todos.md` scope gap as contract A; `contract`/`review` guards pass once this file was filled | `.ai/harness/runs/` (see Run snapshot) |

- Manual checks: manual probes for the frontend design-brief match rule (prefix match, basename match, arbitrary non-matching filename correctly rejected) — cited from the prior gatekeeper acceptance pass's "manual probes A-E"; independently spot-checked this cycle by reading the implemented condition directly (see table above), which confirms the described behavior.
- Supporting artifacts: `.ai/harness/checks/latest.json`; `.ai/harness/runs/` run snapshot for this contract.
- Implementation notes reviewed: yes — `tasks/notes/20260706-0140-frontend-task-profile.notes.md` in full (Design Decisions, Deviations, Tradeoffs, Open Questions). The notes' self-disclosed adjacent findings (enum display-string gap, sprint-contracts.md table, stale research prose, `workflow-contract.v1.json` asymmetry, pre-existing contract.template.md drift, pre-existing BrainSync gap) were all cross-checked against current state; none implemented (correctly, all sit outside `allowed_paths`). The `tasks/todos.md` scope-fidelity gap and the PR-topology change were not anticipated in the notes and are newly surfaced by this review cycle.
- Run snapshot: see `.ai/harness/runs/` (latest run for this contract, generated by the `verify-sprint` re-run after this file was filled).

## External Acceptance Advice

> **External Acceptance**: fail
> **External Reviewer**: Codex
> **External Source**: codex-review (`codex exec --sandbox read-only`, read-only acceptance review of `18e42a3..HEAD` against Review Rubric v2)
> **External Started**: 2026-07-06T02:50:00+0800
> **External Completed**: 2026-07-06T02:55:16+0800

- P1 blockers:
  - [P1] Scope fidelity violation: `tasks/todos.md` is modified in the sprint diff, but `tasks/contracts/20260706-0140-frontend-task-profile.contract.md` `allowed_paths` does not include `tasks/todos.md`; the contract explicitly says to edit only listed paths or widen the contract first.
- P2 advisories:
  - [P2] Enum synchronization is incomplete: `scripts/plan-to-todo.sh:948` and `assets/templates/helpers/plan-to-todo.sh:948` still omit `frontend` from the fallback review-card change-type list, while the contract Goal/Scope requires rg-scanned profile enum hardcodes to be synchronized.
- Acceptance checklist: fail — contract, notes, branch diff, and Review Rubric v2 inspected; implementation is functionally plausible, but acceptance is blocked by the unauthorized `tasks/todos.md` diff.

## Behavior Diff Notes

- `task_profile: frontend` is now a recognized enum value in `verify-contract.sh` and `harness-trace-grade.sh` (both the `scripts/` source and their `assets/templates/helpers/` mirrors); previously it would have been rejected as an unknown profile.
- A frontend contract's `exit_criteria.files_exist` must now include at least one design-brief artifact (a path under `docs/design/` or whose basename contains "design", case-insensitively) or `verify-contract.sh` fails the `files_exist` check with an explicit "frontend profile requires a design brief artifact" message; non-frontend profiles are unaffected, and an unknown profile still fails as before.
- A new `design-brief.template.md` (assets + `.claude/templates/`, byte-identical) is now scaffolded into new/adopted repos, giving frontend work a machine-anchored DESIGN.md starting point (purpose/audience, references to emulate/avoid, color, typography, layout, motion, explicit anti-patterns, a five-criterion manual-confirmation checklist, an optional preview-attachment slot).
- `repo-harness-prd/SKILL.md` gains a short frontend routing note: PRD work with a Frontend Perspective, or work that will execute under the `frontend` profile, should produce `docs/design/DESIGN-<slug>.md` from the new template and get human sign-off against the five criteria before sprint/contract execution; imagegen skills remain an optional enhancement, not an automation requirement.
- No change to `contract-run.ts` brief preflight, to `verify-sprint.sh`, to `frontend`'s `allowed_paths` behavior (none invented), or to any content WP4 (the intake-trigger-rules contract) already landed.

## Residual Risks / Follow-ups

- Orchestrator must resolve the `tasks/todos.md` allowed_paths gap (shared with contract A) before the mechanical `verify-sprint` gate can report green.
- PR #49's base branch auto-retargeted to `main` after contract A's PR #48 merged and its branch was deleted mid-review; the live compare view will look inflated (~28 files instead of this contract's own 18) until the branch is rebased onto current `main` or the base is otherwise repaired. This is a process/topology issue, not a defect in this contract's own commits.
- Self-disclosed, out-of-allowed_paths adjacent findings from the notes (enum display-string in `plan-to-todo.sh` fallback, `sprint-contracts.md` Task Profiles table, stale research-doc prose, pre-existing `contract.template.md` one-line drift) remain open follow-ups for a future contract with the right `allowed_paths` grant.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | Enum + conditional case + template + skill note all land exactly as scoped; all `exit_criteria` entries pass; frontend match rule independently verified to reject arbitrary filenames. Gap is the same external `tasks/todos.md` allowed_paths finding as contract A. |
| Product depth | 7/10 | Deliberately reuses the existing closed-enum + per-profile-conditional pattern (HE-04 precedent) rather than inventing a new mechanism; design-quality judgment is correctly left to the human five-criterion checklist rather than over-mechanizing an unverifiable "good design" gate. |
| Design quality | 8/10 | `design-brief.template.md` sections match the plan's spec exactly; the match rule (`docs/design/` prefix or "design" substring) is simple, avoids a second alternation branch, and was verified not to over-match arbitrary filenames. |
| Code quality | 8/10 | All 3 `diff -q` parity pairs verified byte-identical; scaffold registration correctly follows each target script's own dominant existing pattern (heredoc-embed vs. copy-if-source-exists) rather than forcing one style; a caught-and-fixed omission (missing `project-init-lib.sh` registration, per the notes) shows the implementation was smoke-tested, not just reasoned about. |

## Failing Items

- `allowed_paths_check` (mechanical, `repo-harness run verify-sprint`): `tasks/todos.md` is outside this contract's declared `allowed_paths` — same root cause and same resolution path as contract A (widen `allowed_paths` or drop the diff).
- `external_acceptance` (mechanical, `repo-harness run verify-sprint`): fails while the Human Review Card's recorded external acceptance is `fail`, mirroring the same root cause.
- Process/topology (not a `verify-sprint` guard, but blocking a clean human merge review): PR #49's base retargeted to `main` mid-review after contract A's PR #48 merged; needs a rebase or base repair before the GitHub compare view is trustworthy again.

## Retest Steps

- Re-run: `repo-harness run verify-sprint` after the orchestrator resolves the `tasks/todos.md` scope decision.
- Re-check: rebase `codex/frontend-task-profile` onto current `main` (or otherwise repair PR #49's base) and recompute the diff fingerprint against the corrected base before final human merge review.
- Re-check: `bun test` in isolation (not concurrent with another full-suite run) to reconfirm zero unrelated failures.

## Summary

The frontend task profile lands exactly as scoped: enum recognition, a design-brief-required conditional case matching the plan's exact rule, a new template pair verified byte-identical, scaffold registration that correctly follows each target script's own pattern, and a short SKILL.md routing note — all with green exit criteria and a `bun test` run whose single failure was isolated and confirmed to be a cross-run concurrency artifact, not a regression. Two issues surfaced during this review cycle that were not anticipated by the contract or notes: the same `tasks/todos.md` allowed_paths scope-fidelity gap found on contract A (mechanically confirmed by both Codex and `verify-sprint`), and a PR-topology complication where contract A's mid-review merge caused GitHub to auto-retarget this PR's base to `main`, which will need a rebase before a clean final compare view. This review records `Recommendation: pass` per the orchestrator's own prior gatekeeper acceptance of this diff's content, while transparently recording that the mechanical gate and the PR's compare view both need the above two items resolved before this is truly merge-ready.
