> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# README acknowledgements

Date: 2026-05-30

Scope: README-only documentation update for acknowledgements and dependency
clarity.

Decision:

- Add a compact `Acknowledgements and Tooling Dependencies` section to
  `README.md`.
- Keep gstack, Waza, `diagram-design`, and `gbrain` described as external
  operator tooling unless the repo explicitly installs or vendors them.
- Ground package dependencies in `package.json`: Bun as the maintainer runtime,
  `commander` as the runtime npm dependency, and CodeGraph as this repo's
  self-host dev dependency.

Tradeoff: this records the skills and repos that shaped the workflow without
expanding the README into a full dependency guide. Detailed install/update
instructions stay in `docs/reference-configs/external-tooling.md`.

## 2026-06-12 Codex contributor attribution

- Added OpenAI Codex to the README acknowledgement surface.
- Documented the explicit GitHub co-author trailer
  `Co-authored-by: codex <codex@openai.com>` for commits that materially include
  Codex-authored work.
- Kept attribution opt-in per commit instead of changing repo-harness commit
  scripts or hooks, so generated downstream repos do not inherit hidden AI
  trailer behavior.
