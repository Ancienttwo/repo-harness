---
name: repo-harness-architecture
description: Resolves repo-harness architecture drift requests and updates architecture docs or diagrams without running full init, migrate, or upgrade.
when_to_use: "repo-harness-architecture, architecture drift, architecture doc, architecture diagram, update architecture index, resolve architecture request"
---

# repo-harness-architecture

Use this command when the harness already exists and the user wants a focused
architecture documentation, drift-request, or diagram pass.

## Protocol

1. Confirm the target repo path and architecture scope.
2. Inspect `docs/architecture/index.md` and pending files under `docs/architecture/requests/`.
3. When the scope maps to repo code or config, resolve the capability with:
   - `repo-harness run capability-resolver match --repo <repo> --path <path> --format json`
4. Update the smallest relevant architecture artifact:
   - umbrella status in `docs/architecture/index.md`
   - module or snapshot docs under `docs/architecture/`
   - Mermaid fenced block in the relevant module or snapshot Markdown when a visual flow materially helps
   - optional human-readable diagram artifact under `docs/architecture/diagrams/`
5. Use Markdown Mermaid as the semantic diagram source; use `mermaid` only for optional human-readable HTML renderings grounded in observed repo files.
6. Archive handled requests with:
   - `repo-harness run archive-architecture-request --request <request> --status <resolved|superseded|rejected|no-change> --artifact <path> --note <text>`
   - For `resolved`, the live `Pending` request must declare `> **Architecture Module**:` and that exact existing module path must be supplied as an `--artifact`.
7. Verify with:
   - `repo-harness run check-architecture-sync`
   - `repo-harness run capability-resolver validate --repo <repo> --format text`
   - `repo-harness run check-task-workflow --strict` when repo workflow surfaces changed

## Failure Modes

- If no pending architecture request exists, report `no-change` and do not invent one.
- If capability resolution is ambiguous, stop at the matching paths and ask for a narrower scope.
- If `check-architecture-sync.sh` blocks in strict mode, resolve or archive the pending request card for the touched capability before finishing the worktree.
- If diagram rendering fails, keep the Mermaid Markdown source and report the render failure.

## Boundaries

- Does not run `scripts/migrate-project-template.sh --apply`.
- Does not install or refresh the full harness.
- Does not let hooks rewrite architecture prose; hooks only record drift requests.
- Does not vendor `mermaid`; it remains an external installed skill for optional human-readable HTML.
- Keeps `docs/architecture/requests/` pending-only by archiving handled requests.
