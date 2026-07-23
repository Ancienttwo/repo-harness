# Setup Mode: Capability Configuration

Source facade: `assets/skill-commands/repo-harness-capability`.

Use when the repo already has the harness and the user wants to add selected
capability boundaries without refreshing the full harness. Run the shared
preflight in `../SKILL.md` first (selected capability prefixes are the
capability-specific addition to that preflight).

## Protocol

1. For each selected prefix, run `bun scripts/capability-config.ts add --repo <repo> --prefix <path>`.
2. Add explicit `--id`, `--domain`, `--name`, and `--verification-hint` values when the inferred names would be unclear.
3. Verify with `bun scripts/capability-resolver.ts validate --repo <repo> --format text` and `bun scripts/capability-resolver.ts match --repo <repo> --path <path> --format json`.

## Failure Modes

- If the prefix is ambiguous or too broad, stop and require explicit narrower prefixes.
- If the change would refresh unrelated helpers, stop and keep capability work targeted.

## Boundaries

- Does not run `repo-harness adopt`.
- Does not install or refresh the full harness.
- Does not create an application stack.
- Creates local `AGENTS.md` and `CLAUDE.md` contract files only for requested capabilities.
- Use `--create-prefix` only when the user explicitly wants the missing directory created.
