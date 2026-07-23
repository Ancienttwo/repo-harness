# Setup Mode: Migrate

Source facade: `assets/skill-commands/repo-harness-migrate`. This reference
is written directly from that facade's protocol; it deliberately does not
reuse text from the packaged `references/migration-guide.md` document (the
plan requires a fresh rewrite, not an import of that older guide).

Use when inspection finds legacy workflow docs or stale harness artifacts.
Run the shared preflight in `../SKILL.md` first.

## Protocol

1. Dry-run the canonical transaction with `repo-harness adopt --repo <repo> --dry-run` when legacy docs exist.
2. Apply with `repo-harness adopt --repo <repo>`; it archives legacy docs and removes only ownership-proven generated files.
3. Verify task workflow, transaction manifest, and archived legacy content.

## Checkpoints

- Before applying migration, confirm the dry-run only removes `known_generated` files and preserves user-authored legacy content.

## Failure Modes

- If the inspector reports `mode: audit` with no drift, the repo is already current: use `repo-harness-check` for release readiness, or this package's own `upgrade` mode for a refresh.
- If legacy docs contain uncertain user content, archive first and do not delete directly.

## Boundaries

- Preserve or archive user-authored content; never delete uncertain legacy docs directly.
- Remove only files marked `ownership=known_generated` by the workflow contract.
- Do not treat hooks as the only source of truth; the repo contract lives in repo files.
