# Hooks Configuration Guide

Use this guide for repo-local hook configuration details.

## Project Hook Source of Truth

- Repo-local `tasks/` files are the primary cross-agent contract.
- Repo-local `plans/` files are the sole source of truth for the active plan.
- Shared hook implementation: `.ai/hooks/`.
- Team-configurable Claude adapter: `.claude/settings.json` (committable).
- Personal overrides only: `.claude/settings.local.json` (optional).
- Claude adapter: `.claude/settings.json` dispatches into `.ai/hooks/run-hook.sh`.

Use `.ai/hooks/` as the shared implementation layer. Use hooks as advisory accelerators, not as the only source of workflow enforcement.

## Hook Presets

### A) Balanced Shared Guardrails (recommended)
- Runtime profile: Plan-only (recommended), configurable to Permissionless/Standard.
- `PreToolUse (Edit|Write)`: worktree guard (warn by default, opt-in hard block), pre-edit guard (TDD/BDD + asset-layer reminders).
- `PostToolUse (Edit|Write)`: post-edit guard (doc drift + task handoff summary).
- `PostToolUse (Bash)`: post-bash advisory reminders.
- `PostToolUse (all tools)`: `trace-event.sh` structured JSONL trace + context-pressure session monitor.
- `UserPromptSubmit`: prompt guard (plan sync + TDD/BDD reminders).
- `Stop`: finalize-handoff summary refresh.
- Automatic checkpoint commits are disabled in the shared default.

### B) Balanced + Release Guard
- Same as A, plus `changelog-guard.sh` for repos that want release reminders.

### C) Balanced + Advisory Extras
- Same as A, plus optional advisory hooks like `anti-simplification.sh` when teams explicitly want more reminders beyond the default `post-bash.sh` and `context-pressure-hook.sh`.

### D) Minimal
- `UserPromptSubmit` only.

### E) No Hooks
- Skip project-level hook config.

### F) Custom
- Define explicit matcher + command sets.

## Hook Files to Copy

| Asset File | Target Path |
|---|---|
| `assets/hooks/hook-input.sh` | `.ai/hooks/hook-input.sh` |
| `assets/hooks/run-hook.sh` | `.ai/hooks/run-hook.sh` |
| `assets/hooks/*.sh` | `.ai/hooks/*.sh` |
| `assets/hooks/lib/` | `.ai/hooks/lib/` |
| `assets/hooks/settings.template.json` | `.claude/settings.json` |

Bundled hook assets include:
- `assets/hooks/tdd-guard-hook.sh`
- `assets/hooks/pre-code-change.sh`
- `assets/hooks/anti-simplification.sh`
- `assets/hooks/post-bash.sh`
- `assets/hooks/context-pressure-hook.sh`
- `assets/hooks/changelog-guard.sh`
- `assets/hooks/session-start-context.sh`
- `assets/hooks/finalize-handoff.sh`
- `assets/hooks/worktree-guard.sh`
- `assets/hooks/atomic-pending.sh`
- `assets/hooks/atomic-commit.sh`
- `assets/hooks/trace-event.sh`

Generated `.claude/hooks/` shims are legacy artifacts. Current migration removes
known generated shims and preserves only user-authored `.claude/hooks/custom-*.sh`
files.

## Customization Notes

- Non-monorepo projects can remove package-related doc drift triggers.
- Non-Expo projects can remove Metro config drift checks.
- Non-Turborepo projects can remove `turbo.json` drift checks.
- Keep durable shared policy in `CLAUDE.md`, repo-local workflow files, and reference configs rather than hidden runtime caches.
- Use `tasks/lessons.md` for repeated corrections and `tasks/research.md` for deep findings instead of hook-managed auto-memory.

## Failure Logging

- Blocking hooks emit structured JSON with: `guard`, `action`, `reason`, `fix`, `failure_class`, `run_id`.
- Failure classes are intentionally limited to:
  - `missing_artifact`
  - `state_violation`
  - `contract_failure`
  - `quality_gate`
- Hook failures append JSONL records to `.ai/harness/failures/latest.jsonl`.
- Use `bash scripts/summarize-failures.sh` to aggregate the latest failure log, or `--run-id <id>` to inspect a single run.
