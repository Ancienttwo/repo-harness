# project-initializer AGENTS.md

This repository self-hosts the `project-initializer` contract. Claude and Codex should follow the same repo-local workflow surface.

## Canonical Workflow Files

- `tasks/todo.md` for the current execution checklist and verification notes
- `tasks/lessons.md` for correction-derived rules
- `tasks/research.md` for deep repo knowledge
- `plans/` for timestamped plans, with `plans/archive/` for history
- `docs/PROGRESS.md` for milestone-only updates
- `.ai/harness/workflow-contract.json` for the installed workflow contract manifest
- `.ai/harness/policy.json` for the machine-readable workflow contract
- `.ai/context/context-map.json` for progressive context loading

## Operating Rules

- Sync `tasks/` whenever substantive repo changes are made.
- Treat `.ai/hooks/` as the shared hook implementation and `.claude/hooks/` as shims only.
- Keep `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json` in sync.
- Keep `CLAUDE.md` and `AGENTS.md` short; put detailed guidance in `docs/reference-configs/`.
- Treat Codex auto-compact as a fallback only; use `.ai/harness/handoff/current.md` and `.ai/harness/handoff/resume.md` for long-task rollover.
- Route complex planning/review/QA/release/browser-first flows to `gstack`, short implementation/debug/read-write checks to `Waza`, and knowledge sync/handoff retrieval to `gbrain`.
- Treat Waza as Codex-first: `~/.codex/skills` is the Codex runtime source; `~/.agents/skills` is skills CLI staging/cache only. Update by staging upstream Waza, copying the eight managed `SKILL.md` files into Codex, and verifying with `cmp`.
- Use `docs/reference-configs/external-tooling.md` and `bash scripts/check-agent-tooling.sh --host both --check-updates` for advisory environment checks only.
- When changing `scripts/migrate-project-template.sh` or `scripts/lib/project-init-lib.sh`, verify self-migration of this repo still works.
- Do not treat generated hook adapters or backup files as product deliverables.

## Required Checks

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```
