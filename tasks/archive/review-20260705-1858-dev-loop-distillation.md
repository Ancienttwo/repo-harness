> **Archived**: 2026-07-05 18:58
> **Related Plan**: plans/archive/plan-20260705-1419-dev-loop-distillation.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260705-1858

# Task Review: dev-loop-distillation

> **Status**: Reviewed
> **Plan**: plans/plan-20260705-1419-dev-loop-distillation.md
> **Contract**: tasks/contracts/20260705-1419-dev-loop-distillation.contract.md
> **Notes File**: tasks/notes/20260705-1419-dev-loop-distillation.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-05 17:57
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:e843bd6557a9c51ff67e2a9096b74b83e91e690ba3689818097f328e75045c28
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: per plan slices 0/A1-A3/B1-B4/C1/D1(reduced)/G1/F1 — helper mirrors (scripts/ + assets/templates/helpers/), hook lib workflow-state.sh + stop-orchestrator.sh (assets/hooks canonical + .ai/hooks projection), contract template ×4 locations, contract-run.ts prompts/preflight/runner_usage, verify-sprint advisory, golden example doc, 4 SKILL.md, tests, plan/contract/review/notes/todos workflow files.
- Actual files changed: 33 files, +1568/-46 (`git diff --stat ca76def..HEAD`); all paths within contract `allowed_paths`; B5 intentionally absent (delegated to parallel branch `codex/projection-brief-advisory`); advisor files untouched (delivered by base commit ca76def).
- Commands passed: full F1 battery — bun test 1020 pass/1 skip/0 fail; tsc --noEmit exit 0; check:hooks projection OK (25 files); check-deploy-sql-order OK; check-architecture-sync advisory blocking=0; check-task-sync clean; check-task-workflow --strict exit 0; inspect-project-state drift_signals none; migrate --dry-run exit 0; 8-helper mirror parity zero drift; golden example preflight_pass; placeholder smoke fail-closed with issues [Goal, Scope, Why].
- External acceptance: unavailable at closeout (peer quota) — round-2 full Codex review recorded verbatim below with all findings dispositioned; Manual Override recorded per gate rule; re-run available after 2026-07-07 09:59 +0800 before push/PR.
- Residual risks: B5 landed on main as 38141a6 (feat(plan-to-todo): surface advisory brief preflight at contract projection, Phase 2 slice 3) rather than via this branch; dual resume-packet writers (lib function + codex-handoff-resume.sh) may drift cosmetically — dedup noted as follow-up; capture-plan.sh duplicate `## Task Breakdown` bug recorded as promotion candidate (out of scope); stacked-base merge ordering is owned by the user's PR flow (#39/#40 first).
- Reviewer action required: inspect diff and card
- Rollback: drop branch `codex/dev-loop-distillation` and its worktree; stack base `codex/advisor-file-coupled-nudge` (ca76def) and `main` unaffected; no data migration.

## Mode Evidence

- Selected route: plan-mode audit (orchestrator) → approved work-package plan → fast-worker slice execution (setup / A1-A3 / B1-B3 / B4+C1+D1+G1) → F1 battery finished inline by orchestrator after executor session limit.
- P1/P2/P3 evidence: `plans/plan-20260705-1419-dev-loop-distillation.md` §審計結論（P1 架構圖 / P2 委派路徑 trace / P3 設計判斷 + 8 原則對照 + 引擎級發現 E1-E5）.
- Root cause or plan evidence: `docs/researches/20260705-superpowers-evaluation-file-coupled-delegation.md` + plan Context (distill 8 agent-capability principles into the file-coupled brief surface).

## Verification Evidence

- Waza `/check` run: this closeout review (battery + cross-vendor external acceptance recorded in this file).
- Commands run: see Human Review Card "Commands passed" (12-item F1 battery, raw outputs mirrored in notes Evidence Links).
- Manual checks: golden example self-certifies via guard test and direct preflight (`preflight_pass`); placeholder-template smoke fails closed with `incomplete_brief` and issues including the new Why check; B2 conditional prompt branches (Exemplar line, Stop Conditions bullets, verifier Why) hand-verified against a scratch contract (notes, Design Decisions).
- Supporting artifacts: `tasks/notes/20260705-1419-dev-loop-distillation.notes.md` (Design Decisions / Deviations / Evidence Links F1 block / Promotion Candidates).
- Implementation notes reviewed: yes — deviations A1 (prologue+helper_dir bundle), A3 (stop-orchestrator second-writer fix), B5 removal all documented with rationale.
- Run snapshot: written by `verify-sprint` at closeout (`.ai/harness/checks/latest.json` + `.ai/harness/runs/`).

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-07-05T17:07:00+0800
> **External Completed**: 2026-07-05T17:57:52+0800
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:e843bd6557a9c51ff67e2a9096b74b83e91e690ba3689818097f328e75045c28
> **Reviewed Scope**: branch+staged+unstaged+untracked

Manual Override: peer CLI quota-exhausted mid-closeout — round 3 re-run returned "You've hit your usage limit... try again at Jul 7th, 2026 9:59 AM" (OpenAI side). Round 2 completed a FULL cross-vendor review of this branch (209k tokens, codex exec -s read-only, model_reasoning_effort=high) at fingerprint sha256:0366fda0b1941de2526beb0155ad029cdbc546a8d70442ffec93851c9dbd9493; the only delta between that reviewed state and the current fingerprint is commits 3c0fe9d (contract scope doc alignment) and d80c50a (test-only additions) — both implementing exactly what the round-2 findings demanded — plus this review file itself (excluded from fingerprints by design). Re-run true acceptance after the quota reset before pushing the stacked PR.

- P1 blockers: none outstanding — round-2 P1 dispositions: (1) "contract still claims B5" fixed in 3c0fe9d; (2) "committed review is fail/pending" and (3) "dirty worktree = review file" are closeout-ordering artifacts resolved by this very commit (the review completes and commits at finish by design).
- P2 advisories: "weak prompt propagation assertions" — fixed in d80c50a (verbatim Why/Exemplar/Stop-Conditions/Goal/Scope propagation asserted plus negative Exemplar branch).
- Acceptance checklist: manual_override (round-2 review + remediation evidence above; round-3 peer re-run blocked by quota until 2026-07-07 09:59 +0800)

### Round-2 Codex findings (verbatim)

- [P1] HEAD 里的 review artifact 仍然是失败态，不能作为 mergeable unit。`tasks/reviews/20260705-1419-dev-loop-distillation.review.md` 在已提交版本中是 `Recommendation: fail`、`Verdict: pending`、`External Acceptance: unavailable`，而 contract 明确要求 review pass 和 evaluator review pass。当前 worktree 里有未提交的 review 填写，但那不是 `ca76def..HEAD` 的 mergeable 内容。
- [P1] contract scope 和实际交付不一致。contract Goal/Scope 仍包含 B5 projection advisory；但计划里 B5 是 unchecked 且转交平行分支，notes 也说本分支未实现 B5。要么修 contract/goal/scope 把 B5 移出本 unit，要么把 B5 落在本分支。
- [P1] `git status --porcelain` 不干净：`M tasks/reviews/20260705-1419-dev-loop-distillation.review.md`。`git ls-files --others --exclude-standard` 在忽略 `node_modules` 和 `.ai/harness` 后为空，没有 unexpected untracked。
- [P2] prompt/preflight 核心测试偏弱。`tests/contract-run.test.ts` 只断言 worker/verifier prompt 包含标题和一句 rubric 文案，没有断言实际 `Why` 内容、`Exemplar` 行、Stop Conditions bullets、verifier Goal/Scope/Why 都从 contract 正确流入 prompt。实现当前看起来有写入这些字段，但测试对主要契约退化不够敏感。
- Round-2 tail: `P1 blockers: committed review fails/pending; B5 scope mismatch; dirty worktree` / `P2 advisories: weak prompt propagation assertions` / `Acceptance checklist: fail`

## Behavior Diff Notes

- Contract brief surface: template gains required `## Why`, optional `## Stop Conditions` and `> **Exemplar**` (all four template locations; E4 wording drift fixed, `.claude`/`assets` copies now byte-identical).
- contract-run worker prompt now carries why-first context, mandatory self-verification (run exit_criteria commands before reporting, paste outputs, no invented checks), notes-file memory duty, and stop/escalate contract; verifier prompt gains Intent (Goal/Scope/Why) as context only while the verdict stays exit_criteria-strict and adds a worker-evidence cross-check.
- Preflight adds exactly one new required check (`## Why` concrete); fail-closed only at consumption (`contract-run run`), never at projection.
- verify-sprint prints `[Maintenance]` promotion/triage advisories at finish (stderr, exit code provably unchanged by test).
- Stop-event handoff now also writes `resume.md` (plus mtime resync after minimal-change-review second write) — clears the standing `check-task-workflow --strict` failure.
- contract-run manifest records `runner_usage: {used, off_policy}`; `--runner` flag added; policy.json never read by contract-run (brief stays authoritative).
- Helper mirror invariant now enforced for all common helpers by generalized parity test (sole intentional exception: migrate-project-template.sh).

## Residual Risks / Follow-ups

- See Human Review Card residual risks (B5 landed on main as 38141a6, dual resume writers, capture-plan duplication bug, stacked merge ordering).
- `[BriefPreflight]` advisory on the parallel branch should print `brief_preflight.issues` once both branches merge (notes, Open Questions).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Full battery green (1020 tests, strict workflow check, both smokes); B5 delegated out, not missing |
| Product depth | 8/10 | 8/8 article principles land in shipped product surfaces (template/prompts/preflight/skills/example) |
| Design quality | 8/10 | Consumption-gate placement over projection hard gate; YAGNI kill list honored; minimal new abstractions |
| Code quality | 9/10 | Byte-mirror invariant test-locked; per-slice commits; deviations documented with rationale |

## Failing Items

- (none)

## Retest Steps

- Re-run: the 12-item F1 battery from plan §切片 F1 (worktree root).
- Re-check: `bun scripts/contract-run.ts preflight --contract docs/reference-configs/contract-brief-example.md --json` → preflight_pass; placeholder-template copy → fail/incomplete_brief with Goal/Scope/Why issues.

## Summary

- Phase 3 distills the 8 agent-capability principles (why-first, file-based context, golden example, capability routing, mandatory self-verification, independent verification, persistent memory, stop conditions) into the file-coupled delegation brief surface, and closes the engine-integrity gaps found in the audit (helper mirror drift + parity lock, resume packet staleness). 11 slices shipped on this branch, B5 delegated to the parallel projection-advisory branch, advisor half of D1 inherited from base commit ca76def.
