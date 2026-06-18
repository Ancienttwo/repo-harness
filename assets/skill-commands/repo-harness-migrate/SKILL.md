---
name: repo-harness-migrate
description: Migrates older Claude/Codex workflow repos to the current tasks-first harness while preserving or archiving user-authored docs and hooks.
when_to_use: "repo-harness-migrate, migrate legacy Claude repo, migrate docs/TODO.md, migrate docs/PROGRESS.md, legacy workflow docs"
---

# repo-harness-migrate

Use this command when inspection finds legacy workflow docs or stale harness artifacts.

## Protocol

1. Confirm the target repo path.
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text`.
3. Dry-run legacy document migration with `bun scripts/migrate-workflow-docs.ts --repo <repo> --dry-run` when legacy docs exist.
4. Apply through `bash scripts/migrate-project-template.sh --repo <repo> --apply`.
5. Verify task workflow, migration report, and archived legacy content.

## CHECKPOINTS

- CHECKPOINT: before applying migration, confirm the dry-run only removes `known_generated` files and preserves user-authored legacy content.

## Failure Modes

- If the inspector reports `mode: initialize`, route to `repo-harness-init`.
- If the inspector reports `mode: audit` with no drift, route to `repo-harness-check` or `repo-harness-upgrade`.
- If legacy docs contain uncertain user content, archive first and do not delete directly.

## Boundaries

- Preserve or archive user-authored content; never delete uncertain legacy docs directly.
- Remove only files marked `ownership=known_generated` by the workflow contract.
- Do not treat hooks as the only source of truth; the repo contract lives in repo files.
