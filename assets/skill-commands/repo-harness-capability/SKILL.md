---
name: repo-harness-capability
description: Adds or syncs explicit repo-local capability boundaries without running full repo-harness init, migrate, or upgrade.
when_to_use: "repo-harness-capability, add capability, add capacity, configure capability, only add selected capabilities, add subfolder AGENTS.md, add subfolder CLAUDE.md"
---

# repo-harness-capability

Use this command when the repo already has the repo-harness harness and the user
wants to add selected capability boundaries without refreshing the full harness.

## Protocol

1. Confirm the target repo path and selected capability prefixes.
2. Run `bun scripts/inspect-project-state.ts --repo <repo> --format text` when available to confirm the harness exists.
3. For each selected prefix, run:
   - `bun scripts/capability-config.ts add --repo <repo> --prefix <path>`
4. Add explicit `--id`, `--domain`, `--name`, and `--verification-hint` values when the inferred names would be unclear.
5. Verify with:
   - `bun scripts/capability-resolver.ts validate --repo <repo> --format text`
   - `bun scripts/capability-resolver.ts match --repo <repo> --path <path> --format json`

## Failure Modes

- If the prefix is ambiguous or too broad, stop and require explicit narrower prefixes.
- If the repo lacks the harness, route to `repo-harness-init`.
- If the change would refresh unrelated helpers, stop and keep capability work targeted.

## Boundaries

- Does not run `scripts/migrate-project-template.sh --apply`.
- Does not install or refresh the full harness.
- Does not create an application stack.
- Does not infer capabilities from broad directory globs; use explicit prefixes.
- Creates local `AGENTS.md` and `CLAUDE.md` contract files only for requested capabilities.
- Use `--create-prefix` only when the user explicitly wants the missing directory created.
