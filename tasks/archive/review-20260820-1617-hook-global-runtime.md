> **Archived**: 2026-08-20 16:17
> **Related Plan**: plans/archive/plan-20260528-1436-hook-global-runtime.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1617

# Sprint Review: hook-global-runtime

> **Status**: Phase 0 acceptance complete (2026-05-28 17:11, user-acknowledged Codex side); Phase 1 contract still open
> **Plan**: plans/plan-20260528-1436-hook-global-runtime.md
> **Contract**: tasks/contracts/hook-global-runtime.contract.md
> **Notes File**: tasks/notes/hook-global-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-05-28 17:11
> **Recommendation**: pass for Phase 0 operational smoke (canary prep + real host smoke + Codex user acceptance); 5 advisory micro-tests deferred; Phase 1 CLI implementation still open

## Mode Evidence

- Selected route: Waza `/check` branch acceptance.
- P1 map: current branch only contains Phase 0 canary prep, workflow task artifacts, and a portable strict-check fix. It does not contain the Phase 1 CLI runtime, installer, doctor, migrate, docs, or distribution surfaces named by the wider contract.
- P2 trace: `scripts/canary-global-hook.sh install` writes tagged hook entries to host-level Codex and Claude JSON files, `status` counts tagged entries and Codex trust-state keys, and `uninstall` removes only entries whose command contains `agentic-dev-canary`.
- P3 decision: accept the canary prep as a bounded reviewable unit, but do not mark the full global hook runtime contract complete until Phase 1 artifacts and host smoke evidence exist.

## Verification Evidence

- Commands run:
  - `bash -n scripts/canary-global-hook.sh`
  - `HOME="$(mktemp -d)" bash scripts/canary-global-hook.sh install`
  - `HOME="$(mktemp -d)" bash scripts/canary-global-hook.sh status`
  - `HOME="$(mktemp -d)" bash scripts/canary-global-hook.sh uninstall`
  - `bun test`
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-task-sync.sh`
  - `bash scripts/check-task-workflow.sh --strict`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `bun test tests/helper-scripts.test.ts`
- Manual checks: no real `~/.codex/hooks.json` or `~/.claude/settings.json` mutation was performed during acceptance; canary install/uninstall was validated under a temporary `HOME`.
- Supporting artifacts: `plans/plan-20260528-1436-hook-global-runtime.md`, `tasks/contracts/hook-global-runtime.contract.md`, `tasks/notes/hook-global-runtime.notes.md`, `scripts/canary-global-hook.sh`.
- Implementation notes reviewed: yes.
- Run snapshot: current shell transcript.

## Behavior Diff Notes

- Adds a dual-host canary script for Phase 0 operational validation.
- Fixes `check-task-workflow.sh` capability binding detection on macOS/BSD grep by matching literal `>` portably.

## Residual Risks / Follow-ups

- Phase 0 still needs real host smoke: install canary into actual user-level hook files, restart/trigger Codex and Claude, record trust prompt and hash behavior, then uninstall.
- Phase 1 remains unimplemented: CLI `install` / `hook` / `status` / `doctor` / `migrate`, contract schema changes, docs, distribution, and migration behavior.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 7/10 | Phase 0 canary prep works in isolated HOME; real host smoke remains manual. |
| Product depth | 6/10 | Correctly narrows the first slice, but does not yet deliver the global CLI product. |
| Design quality | 7/10 | Keeps repo-local artifacts and host-global canary separate. |
| Code quality | 8/10 | Shell syntax and idempotent JSON mutation validated; portable grep fix applied. |

## Failing Items

- Full contract exit criteria are not met; this review only accepts the Phase 0 prep slice.

## Retest Steps

- Re-run the commands listed in Verification Evidence.
- For real host smoke, run `bash scripts/canary-global-hook.sh install`, trigger Codex/Claude events, capture `status` and log output, then run `bash scripts/canary-global-hook.sh uninstall`.

## Phase 0 Acceptance Outcome (2026-05-28 17:11)

- **User acknowledged Codex side**: "Codex方面我已验收" (口头, 2026-05-28); Claude 侧 acceptance 隐含 (本会话 169+ user-level fires 持续在线).
- **Real-host smoke completed**: canary install → restart Codex + accept 5 new trust prompts (11 → 16 hash entries) → 5 events × 2 opt-in repos triggered → uninstall + verified 0/5 entries + 16/16 hash residue (Codex 不 GC).
- **Operational Matrix data quality**: Row 1/3 完全 evidence-driven; Row 2/4/5 主体 evidence-driven; 5 manual gaps (prompt 文案/UI surface, Codex 拒绝路径, Codex 同 (i,j) 改 command, Claude ConfigChange 时延, non-opt-in repo silent-exit-0) 已标 🔶 advisory 留到 Phase 1 1G self-migration 阶段.
- **Phase 1 design data points hardened** in `tasks/notes/hook-global-runtime.notes.md` § Phase 0 Closeout: Codex hash key composition, hash-skip behavior, Claude auto-reload timing, new-entry-only trust prompt, append-after array semantics.

## Summary

- Phase 0 operational smoke complete with real host evidence and Codex user acceptance. 5 advisory micro-tests deferred. Phase 1 CLI runtime (install/hook/status/doctor/migrate + distribution + self-migration) remains the full open scope; do not claim global hook runtime is complete until 1H closeout.
