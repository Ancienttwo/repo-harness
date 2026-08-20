> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Action Command Surface Notes

Date: 2026-05-25

## Decision

Expose action-style `agentic-dev-*` command skills as source-owned thin facades
under `assets/skill-commands/`.

## Rationale

- Public names stay action-oriented: `plan`, `review`, `autoplan`, `init`,
  `scaffold`, `migrate`, `upgrade`, `repair`, and `check`.
- The command surface still follows the gstack-style mental model: planning and
  review first, automatic pipeline second, mutating workflow actions last.
- `init` and `scaffold` stay separate so existing repo adoption does not get
  mixed with app or module creation.

## Boundary

`hooks-init`, `docs-init`, and `create-project-dirs` are intentionally not public
commands. They remain implementation steps inside the existing engine.

Prompt hooks may suggest `agentic-dev-autoplan` when a user asks whether
repeated work should become a skill, subagent, automation, or command extension.
The hook stays advisory-only: it must not plan, read external history stores, or
create assets without explicit user authorization.
