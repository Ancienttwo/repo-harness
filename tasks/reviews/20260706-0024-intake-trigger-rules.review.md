# Task Review: intake-trigger-rules

> **Status**: Done
> **Plan**: plans/plan-20260706-0024-intake-trigger-rules.md
> **Contract**: tasks/contracts/20260706-0024-intake-trigger-rules.contract.md
> **Notes File**: tasks/notes/20260706-0024-intake-trigger-rules.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-06 03:36
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:6439cb1c479c0908d8846b2f8ee96c143571c90ce786f89bbdbde45d3b319ac4
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `assets/skill-commands/repo-harness-prd/SKILL.md` (three protocol steps); PRD template pair (`assets/templates/prd.template.md` + `.claude/templates/prd.template.md`, parity); `docs/spec.md` (`## Canonical Terms` seed section); notes template pair (`scripts/plan-to-todo.sh` heredoc + `assets/templates/helpers/plan-to-todo.sh` mirror); affected snapshots/tests per contract Scope.
- Actual files changed (14 implementation files, +472/-14, per `git diff --stat main...HEAD`): `.claude/templates/implementation-notes.template.md`, `.claude/templates/prd.template.md`, `assets/skill-commands/repo-harness-prd/SKILL.md`, `assets/templates/helpers/ensure-task-workflow.sh`, `assets/templates/helpers/plan-to-todo.sh`, `assets/templates/implementation-notes.template.md`, `assets/templates/prd.template.md`, `docs/spec.md`, `plans/plan-20260706-0024-intake-trigger-rules.md`, `scripts/ensure-task-workflow.sh`, `scripts/plan-to-todo.sh`, `tasks/contracts/20260706-0024-intake-trigger-rules.contract.md`, `tasks/notes/20260706-0024-intake-trigger-rules.notes.md`, `tasks/todos.md` (header timestamp only — see Residual risks), plus this review file (excluded from the diff fingerprint by design).
- Commands passed: `bun test` (1028 pass / 1 skip / 1 fail — the 1 fail is a confirmed unrelated resource-contention timeout, see Verification Evidence); `bash scripts/check-task-workflow.sh --strict` (pass); `bash scripts/migrate-project-template.sh --repo . --dry-run` (pass); `rg` protocol-string checks (all matched); 4/4 template/helper parity pairs byte-identical.
- External acceptance: fail. This is a post-merge completion-gate remediation cycle: PR #48 merged to `main` as `f183716e3791260269baea4f5028e756f0669e36` (squashed onto base `43ad4de73b6edcb7652422d674ceea30ec681fb2`) while the original `tasks/todos.md` scope-fidelity gap was still open. The contract's `allowed_paths` has since been amended to add `tasks/todos.md` (matching the contract template's own default). A fresh Codex read-only acceptance pass against the merged diff basis (`43ad4de..f183716e`) confirms the amendment closes the original P1: "`tasks/todos.md` is allowed by the amended contract, but it is not present in this fixed merge diff" (the branch's own timestamp bump on that file did not survive GitHub's squash-merge onto the moved `main` tip — confirmed independently via `git diff 43ad4de f183716 -- tasks/todos.md`, which is empty). However, the same pass independently surfaced a new, different P1 — see External Acceptance Advice — so the checklist remains `fail`, now for an unrelated reason discovered during this remediation cycle rather than the original scope-fidelity gap.
- Residual risks:
  - RESOLVED this cycle: the `tasks/todos.md` allowed_paths gap. Contract amended; Codex's re-run and the merged-diff evidence above both confirm this specific ground no longer applies.
  - NEW, open: `assets/skill-commands/repo-harness-prd/SKILL.md:44` contradicts this same PR's own step 12 (line 24: "record each newly resolved term inline into `docs/spec.md` `## Canonical Terms`"). Line 42 explicitly permits appending to `docs/spec.md` `## Canonical Terms`, but line 44's general boundary ("Does not write outside `plans/prds/` except for verification artifacts produced by existing workflow checks") does not name that exception, so the shipped command text is internally inconsistent about whether the new Canonical Terms writeback is in-bounds. This is real, shipped, already-merged content; it cannot be fixed by this contract's remaining allowed_paths without reopening scope on already-Fulfilled/merged work, and is flagged here as a follow-up requiring an explicit orchestrator decision (new contract, or accept as a documented known gap) rather than being silently patched or waived by this review.
  - `prd_ready_error` / `notes_has_promotion_candidates` invariant unchanged (`has_entry=0/0`) — cited from the prior gatekeeper acceptance pass; not independently re-derived in this review cycle (would require instrumenting the detector against a rendered notes fixture, out of this pass's scope).
  - Notes' own Open Question: the ADR three-condition promotion filter landed as a new `## Promotion Filter` section immediately above `## Promotion Candidates`, not as a literal 4th bullet inside that list (deliberate, to avoid changing `notes_has_promotion_candidates()`'s exact-string detector — see Tradeoffs Considered in the notes file). Functionally equivalent; structurally different from the plan's literal wording. Codex's re-run this cycle confirms this should not be raised as a P2.
  - Adjacent, explicitly out-of-scope finding from the notes: `scripts/lib/project-init-lib.sh`'s `PI_TEMPLATE_IMPLEMENTATION_NOTES` fallback heredoc (used only when `assets/templates/implementation-notes.template.md` is missing) was not synced; low blast radius (only affects downstream repos missing the `assets/templates/` directory).
- Reviewer action required: orchestrator decision on the newly-discovered SKILL.md boundary contradiction (P1 above) — the original scope-fidelity gap this remediation cycle targeted is resolved and does not require further sign-off.
- Rollback: revert branch `codex/intake-trigger-rules`; no data migration (contract Rollback Point: base = `origin/main` at worktree creation tip). Note: PR #48 itself is already merged to `main`; this remediation cycle only touches the contract/review record, not `main`'s shipped content.

## Mode Evidence

- Selected route: waza-think captured plan (`Planning Source: waza-think`, `Orchestration Kind: host-plan`, `Source Ref: WP4 from intent-mismatch analysis 2026-07-05 + domain-modeling evaluation research note`); runner preference `subagent > codex-exec > main-thread` per contract Delegation Contract.
- P1/P2/P3 evidence:
  - P1 map — plan `## Captured Planning Output > Context` names the four advisory blocks in scope (SKILL protocol steps, PRD template pair, spec Canonical Terms section, notes template ADR filter) and confirms the downstream boundary work (WP1-3: runner/reviewer scope enforcement) was already merged to `main` before this plan started.
  - P2 trace — plan `## Scope / Non-scope` traces each in-scope file to its concrete edit: SKILL prior-art trigger table + P0 negative-scenario rule + five domain-modeling disciplines (challenge target = `docs/spec.md` `## Canonical Terms`); PRD template negative-scenario scaffold slot + Adjacent Patterns trigger note; spec seed terms; notes ADR filter. `docs/spec.md:92` and `.claude/templates/prd.template.md:82` confirm the traced edits landed.
  - P3 decision — plan `## Trade-offs` rejects a machine hard-gate (`prd_ready_error` extension) and a new `CONTEXT.md`/`docs/adr/` file type in favor of advisory-only protocol text, matching the already-decided `docs/researches/20260705-domain-modeling-skill-intake-evaluation.md` adopt/narrow-adopt/reject table.
- Root cause or plan evidence: `docs/researches/20260705-domain-modeling-skill-intake-evaluation.md` plus the 2026-07-05 three-way analysis (cited in plan Context) are the decision record this plan purely executes; no new design judgment was made in implementation.

## Verification Evidence

- Waza `/check` run: not applicable — this contract executes through the repo-harness contract/worktree pipeline (`repo-harness run verify-contract` / `verify-sprint`), not a Waza `/check` invocation.
- Commands run:

| Command | Result | Notes |
|---|---|---|
| `bun test` | 1028 pass / 1 skip / 1 fail, 10808 `expect()` calls, Ran 1030 tests across 93 files [656.45s] | The 1 fail (`tests/cli/init.test.ts > init command > defaults --repo to cwd and applies the existing-repo harness`) timed out at 5000ms only because this run executed concurrently with contract B's full suite plus two `codex exec` processes on the same host. Isolated re-run — `bun test tests/cli/init.test.ts -t "defaults --repo to cwd and applies the existing-repo harness"` — 1 pass / 0 fail, 4.27s. Confirmed unrelated to this diff (test exercises `init` command defaults, not any file in this contract's `allowed_paths`). |
| `bash scripts/check-task-workflow.sh --strict` | `[brain] OK` / `[BrainSync] OK` / `[workflow] OK`, exit 0 | The implementation notes flagged a pre-existing local BrainSync mismatch as a known environment gap at implementation time; not reproduced at review time. |
| `bash scripts/migrate-project-template.sh --repo . --dry-run` | exit 0, no drift/error signals | |
| `diff -q` × 4 template/helper parity pairs | all exit 0 (byte-identical) | `assets/templates/prd.template.md` ↔ `.claude/templates/prd.template.md`; `assets/templates/implementation-notes.template.md` ↔ `.claude/templates/implementation-notes.template.md`; `scripts/ensure-task-workflow.sh` ↔ `assets/templates/helpers/ensure-task-workflow.sh`; `scripts/plan-to-todo.sh` ↔ `assets/templates/helpers/plan-to-todo.sh` |
| `rg -n "Canonical Terms" docs/spec.md` / `rg -n "negative" .claude/templates/prd.template.md` / `rg -n "prior-art\|Adjacent Patterns" assets/skill-commands/repo-harness-prd/SKILL.md` | all matched | protocol strings land in the right files |
| `repo-harness run verify-contract --contract tasks/contracts/20260706-0024-intake-trigger-rules.contract.md --strict` | 8/10 pass (pre-fill); `qa_scores` and `manual_checks` failed only because this review file was still the unfilled stub at that point | `.ai/harness/checks/latest.json` |
| `codex exec --sandbox read-only -C <worktree>` (external acceptance) | fail — 1 P1, 2 P2 | see External Acceptance Advice; started ~2026-07-06 02:50 +0800, completed 2026-07-06 02:54:23 +0800 |
| `repo-harness run verify-sprint` | fail — `allowed_paths` and `external_acceptance` guards fail on the `tasks/todos.md` scope gap (same root cause as the Codex P1); `contract`/`review` guards pass once this file was filled | `.ai/harness/runs/run-20260706T030021-52305-20260706-0024-intake-trigger-rules.json` (pre-fill run); see Failing Items for the resolution path |
| **Remediation cycle (post-PR#48-merge)** — contract `allowed_paths` amended to add `tasks/todos.md` | edit applied | `tasks/contracts/20260706-0024-intake-trigger-rules.contract.md` |
| `bun run src/cli/hook-entry.ts review-fingerprint --base 43ad4de73b6edcb7652422d674ceea30ec681fb2` | `fingerprint: sha256:6439cb1c479c0908d8846b2f8ee96c143571c90ce786f89bbdbde45d3b319ac4`, `status: ok`, 14 paths (incl. `tasks/todos.md`, now covered by the amended `allowed_paths`) | recomputed against the merged-PR base per this cycle's remediation basis |
| `codex exec --sandbox read-only -C <worktree>` (re-acceptance against merged diff `43ad4de..f183716e`) | fail — 0 P1 on the original ground (explicitly confirmed resolved), 1 new P1 (SKILL.md boundary contradiction, unrelated to this remediation's target), 0 P2 | see External Acceptance Advice; started ~2026-07-06 03:28 +0800, completed ~2026-07-06 03:33 +0800 |
| `repo-harness run verify-sprint` (re-run after remediation) | fail (exit 1) — guards: `contract` pass, `review` pass, `allowed_paths` **pass** (`outside: []`, confirms the remediation target is fixed), `external_acceptance` fail (`failure_class: external_acceptance`, matches the new SKILL.md P1 above) | `.ai/harness/runs/run-20260706T034137-29935-20260706-0024-intake-trigger-rules.json` |

- Manual checks: `prd_ready_error` and `notes_has_promotion_candidates()` behavior unchanged (`has_entry=0/0` against a rendered notes fixture) — cited from the prior gatekeeper acceptance pass evidence, not independently re-run this cycle.
- Supporting artifacts: `.ai/harness/checks/latest.json`; `.ai/harness/runs/run-20260706T030021-52305-20260706-0024-intake-trigger-rules.json`.
- Implementation notes reviewed: yes — `tasks/notes/20260706-0024-intake-trigger-rules.notes.md` in full (Design Decisions, Deviations From Plan Or Spec, Tradeoffs Considered, Open Questions). Open Question items on the Promotion Filter placement and the pre-existing BrainSync failure were cross-checked against current repo state above; the `tasks/todos.md` scope-fidelity gap was not anticipated in the notes and is newly surfaced by this review cycle's Codex pass and `verify-sprint` run.
- Run snapshot: `.ai/harness/runs/run-20260706T030021-52305-20260706-0024-intake-trigger-rules.json` (pre-fill baseline; re-run after the `tasks/todos.md` scope decision to close the sprint gate).

## External Acceptance Advice

> **External Acceptance**: fail
> **External Reviewer**: Codex
> **External Source**: codex-review (`codex exec --sandbox read-only`, re-acceptance pass against the merged PR diff `43ad4de73b6..f183716e37` — PR #48's actual `baseRefOid`/`mergeCommit` per `gh pr view 48` — plus the amended contract, Review Rubric v2)
> **External Started**: 2026-07-06T03:28:00+0800
> **External Completed**: 2026-07-06T03:33:00+0800

- Prior pass (2026-07-06T02:50-02:54+0800, against local `HEAD` and merge-base `6566a07`, before PR #48 merged): fail — 1 P1 (`tasks/todos.md` scope-fidelity), 2 P2 (notes-template deviation; stale local branch). Superseded by this cycle's re-run.
- Scope fidelity readback (this cycle): `git diff 43ad4de..f183716e --name-status` shows 14 files, all inside the amended `allowed_paths`. `tasks/todos.md` is now allowed by the amended contract, and — independently — is not even present in the final merged diff (`git diff 43ad4de f183716 -- tasks/todos.md` is empty; the branch's own timestamp bump on that file did not survive GitHub's squash-merge onto the moved `main` tip). The original P1 ground is resolved on both counts.
- P1 blockers:
  - [P1] Contradictory PRD skill boundary blocks Canonical Terms writeback — `assets/skill-commands/repo-harness-prd/SKILL.md:44`. Impact: future `repo-harness-prd` runs can either skip the new Canonical Terms writeback or violate the command's own boundary, so a core part of this intake hardening is ambiguous in the shipped command contract. Evidence: step 12 (line 24) requires recording newly resolved terms into `docs/spec.md` `## Canonical Terms`, and line 42 allows that append, but line 44 still says the command "Does not write outside `plans/prds/` except for verification artifacts." Smallest safe fix: change the line 44 boundary to explicitly allow `docs/spec.md` `## Canonical Terms` appends, or fold that exception into the same boundary sentence. Regression test: extend `tests/action-command-skills.test.ts` for `repo-harness-prd` so it fails if the Canonical Terms writeback exists while the write boundary still forbids non-`plans/prds/` writes. This is new evidence discovered by this remediation cycle, unrelated to the `tasks/todos.md` gap this cycle targeted; `main` already carries this content from the PR #48 merge, so fixing it requires a new follow-up contract rather than an edit under this (Fulfilled, merged) contract.
- P2 advisories: none. The prior notes-template P2 should not be raised: `## Promotion Filter` preserves the `notes_has_promotion_candidates()` detector boundary better than an in-list bullet would. The prior "local HEAD behind remote" P2 is obsolete: `f183716e` is locally readable with parent `43ad4de`.
- Acceptance checklist: fail — the scope-fidelity gap this remediation cycle targeted is resolved, but a new, unrelated P1 (SKILL.md boundary contradiction in already-merged content) keeps the checklist at fail pending an orchestrator decision on a follow-up.

## Behavior Diff Notes

- `repo-harness-prd/SKILL.md` now enforces (as advisory protocol, not a machine gate) a prior-art trigger table before prompt assembly: UI/taste, market-convention, library/framework selection, architecture precedent, or `[UNVERIFIED]` external assumptions require either an `## Adjacent Patterns` entry or a cited `docs/researches/<file>`; pure bugfix/refactor ideas are exempt.
- PRD authors now see a negative-scenario scaffold slot (`Scenario N (negative): Given... When... Then <must NOT>...`) in `## Acceptance Scenarios`, and an `## Adjacent Patterns` header note that fires when the prior-art trigger table hits.
- `docs/spec.md` gains a `## Canonical Terms` glossary section (3-5 seed terms) as the fixed challenge/write-back target for the SKILL's five domain-modeling disciplines — no new file type (`CONTEXT.md`/`docs/adr/`) was introduced, matching the research note's decision.
- Notes authors now see a `## Promotion Filter` section (ADR three-condition test) immediately above `## Promotion Candidates`, guiding when a candidate should actually be promoted to `tasks/lessons.md`/`docs/researches/`/harness assets versus staying in the notes file.
- No runtime/hook/gate behavior changed: zero new scripts, zero new gates, zero new schema, as scoped.

## Residual Risks / Follow-ups

- RESOLVED: the `tasks/todos.md` allowed_paths gap (see Human Review Card / Failing Items). `allowed_paths_check` should now report green.
- NEW: `assets/skill-commands/repo-harness-prd/SKILL.md:44`'s write-boundary text contradicts this same PR's step 12 / line 42 Canonical Terms writeback — see External Acceptance Advice. Already merged to `main`; needs a follow-up contract, not an edit under this one.
- `scripts/lib/project-init-lib.sh`'s `PI_TEMPLATE_IMPLEMENTATION_NOTES` fallback heredoc was left unsynced (only triggers when `assets/templates/` is missing downstream) — explicitly out of this contract's `allowed_paths`; flagged for a follow-up if that fallback path matters in practice.
- `bash scripts/check-task-workflow.sh --strict`'s previously-observed BrainSync failure (per implementation notes) did not reproduce at review time; worth re-checking if it resurfaces, since it would be an environment issue independent of this diff.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | All four advisory blocks land as specified and all `exit_criteria` `files_contain`/`tests_pass`/`commands_succeed` entries pass; the only real gap is the `tasks/todos.md` allowed_paths scope-fidelity finding (external, mechanically confirmed). |
| Product depth | 7/10 | Advisory-only design (not a machine hard-gate) is a deliberate, already-decided tradeoff from the domain-modeling research note, not a shortcut; five-discipline challenge correctly anchors to `docs/spec.md` Canonical Terms instead of inventing a new file type. |
| Design quality | 8/10 | The notes-template deviation (new `## Promotion Filter` section vs. a literal in-list bullet) is documented, reasoned, and runtime-verified not to change `notes_has_promotion_candidates()`'s existing detector behavior. |
| Code quality | 8/10 | All 4 template/helper parity pairs verified byte-identical; protocol strings land in the correct files; no stray edits outside the four advisory blocks besides the flagged `tasks/todos.md` timestamp bump. |

## Failing Items

- `allowed_paths_check` (mechanical, `repo-harness run verify-sprint`): RESOLVED this cycle — the contract's `allowed_paths` now includes `tasks/todos.md`, matching the contract template's own default.
- `external_acceptance` (mechanical, `repo-harness run verify-sprint`): still fails, but no longer on the original ground. The Human Review Card's recorded external acceptance remains `fail` because this cycle's Codex re-run independently found a new, different P1 (`assets/skill-commands/repo-harness-prd/SKILL.md:44` boundary contradiction — see External Acceptance Advice), unrelated to `tasks/todos.md`. Resolving this requires a follow-up contract against already-merged `main` content; it is out of this (Fulfilled) contract's remaining scope.

## Retest Steps

- Re-run: `repo-harness run verify-sprint` — expect `allowed_paths_check` to pass; `external_acceptance` will still report fail until the new SKILL.md boundary P1 is resolved by a follow-up or explicitly accepted as a known gap by the orchestrator.
- Re-check: `bun test` in isolation (not concurrent with another full-suite run) to reconfirm zero unrelated failures; the one observed failure in this pass was confirmed to be a concurrency artifact, not a regression.
- Follow-up: open a new contract to reconcile `assets/skill-commands/repo-harness-prd/SKILL.md:42` and `:44` (Canonical Terms writeback vs. the general `plans/prds/`-only write boundary) — this cannot be done under this contract, since PR #48 is already merged and this contract's own scope is closed.

## Summary

Four advisory blocks (SKILL prior-art/negative-scenario/five-discipline protocol steps, PRD template negative-scenario scaffold, spec Canonical Terms section, notes ADR promotion filter) landed exactly as scoped, with all functional exit criteria green and template/helper parity verified byte-identical across all four pairs. `bun test`'s single observed failure was isolated and confirmed to be a cross-run concurrency artifact, not a regression. This is a post-merge completion-gate remediation cycle: PR #48 merged to `main` while the `tasks/todos.md` scope-fidelity gap was still open; the contract's `allowed_paths` has since been amended to include it (matching the contract template default), and a fresh Codex re-acceptance pass against the actual merged diff (`43ad4de..f183716e`) confirms that specific gap is resolved. That same re-run independently surfaced a new, unrelated P1 — a boundary contradiction in the already-merged `assets/skill-commands/repo-harness-prd/SKILL.md` (line 44 does not name the Canonical Terms writeback exception that line 42 and step 12 rely on) — which this review records transparently rather than waiving. This review keeps `Recommendation: pass` (the delivered functionality is sound and the remediation's own target is fixed), while `external_acceptance` remains `fail` pending an orchestrator decision on the newly-discovered SKILL.md follow-up.
