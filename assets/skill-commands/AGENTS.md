# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

## Local Context Contract

- Describe only the ownership, boundaries, stable entrypoints, and local verification commands for this functional block.
- Keep sibling `CLAUDE.md` and `AGENTS.md` files aligned. Claude Code consumes `CLAUDE.md`; Codex consumes `AGENTS.md`.
- Record the local LSP/tooling profile here when it differs from the repo default.
- Route deep implementation detail into nearby docs instead of inflating root agent context files.
- Treat `.ai/context/context-map.json` as the index of discoverable context files.
- Do not keep pushing context files deeper by default; add lower-level files only for a separately owned functional block with its own commands and invariants.
- Prefer repo-local workflow artifacts over tool-specific chat memory.
- Skills in this directory are intent/workflow-level entrypoints: each must orchestrate multiple CLI capabilities or carry domain rules beyond a single command invocation.
- Do not add a skill that only renames one CLI subcommand or one engine verb; that content belongs in CLI `--help` or `docs/reference-configs/`.
- Per-engine-verb sibling skills are forbidden (for example, no separate skill per `chatgpt browser-*` verb); `repo-harness-chatgpt` stays the single facade for that engine.
