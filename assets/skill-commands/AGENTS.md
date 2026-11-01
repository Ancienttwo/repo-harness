# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

## Local Context Contract

- Skills in this directory are intent/workflow-level entrypoints: each must orchestrate multiple CLI capabilities or carry domain rules beyond a single command invocation.
- Do not add a skill that only renames one CLI subcommand or one engine verb; that content belongs in CLI `--help` or `docs/reference-configs/`.
- Per-engine-verb sibling skills are forbidden: one engine has one facade skill, not one skill per engine verb.
