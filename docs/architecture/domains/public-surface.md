# Architecture Domain: Public Surface

> **Source**: `repo-harness run capability-resolver`
> **Owner**: Root router, command facade docs, repository adoption, and strategy reflection.

## Purpose

The public surface turns user intent into one of the supported CLI+hooks harness
actions without duplicating engine policy in prose. It includes the root skill
compatibility router, README, root agent docs, the `repo-harness` CLI, and thin
`repo-harness-*` command facades.

## Capabilities

- `public-surface-root-router` -> `docs/architecture/modules/public-surface/root-router.md`: routes repository-level product and agent context into capability-specific contracts.
- `public-surface-action-commands` -> `docs/architecture/modules/public-surface/action-commands.md`: defines the action command skills, the bundled skill packages and the skill-surface catalog.
- `public-surface-adoption` -> `docs/architecture/modules/public-surface/adoption.md`: plans and applies repository adoption through the filesystem transaction boundary.
- `public-surface-strategy-reflection` -> `docs/architecture/modules/public-surface/strategy-reflection.md`: collects a bounded strategy context packet and validates inert strategic proposals on explicit request.

## Stable Rules

- Root `SKILL.md` stays short and router-oriented.
- Root `AGENTS.md` and `CLAUDE.md` stay concise; detailed operating rules live in `docs/reference-configs/`.
- Public commands are CLI-backed facades. Internal steps such as `hooks-init`, `docs-init`, and `create-project-dirs` stay behind `init`, `scaffold`, `migrate`, and `upgrade`.
- `repo-harness-skill` remains a compatibility trigger, not the canonical name.
- The former `project-initializer` install paths have been fully removed; no tooling recognizes, syncs, or cleans them up.

## Verification Surface

- `bun test tests/action-command-skills.test.ts`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `repo-harness init --repo . --dry-run`
