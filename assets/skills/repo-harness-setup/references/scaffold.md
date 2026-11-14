# Setup Mode: Scaffold

Use when the user asks to create a new project, app, or module skeleton.
Run the shared preflight in `../SKILL.md` first.

## Protocol

1. Confirm the target parent path, project name, plan catalog entry, and package manager.
2. Use the plan catalog A-K from `assets/plan-map.json`.
3. If the app needs agent runtime structure, select `ai_native_profile` as an overlay; otherwise keep the default `none`.
4. Run `scripts/init-project.sh` or the matching stack template path. The scaffold writes no init-managed part.
5. Run `rh init --repo <target-repo>`. It attaches the tasks-first workflow and writes the opt-in marker, the package scripts, the `.gitignore` managed block, the reference-config stubs and the seed files (`docs/spec.md`, `deploy/README.md`, `docs/architecture/index.md`, `docs/researches/README.md`, the context map, the brain manifest and the empty capability registry). It is the only writer of these parts.
6. The scaffold does not discover context blocks. For each existing directory that has its own `CLAUDE.md` or `AGENTS.md`, run `rh run capability-config add --repo <target-repo> --prefix <dir>` to register it.
7. Verify scaffold output and workflow checks.

## AI-native Overlay

The AI-native profile is an overlay, not a new plan code. Keep A-K for project
type, then use profile values such as `runtime-console`, `product-copilot`, or
`sidecar-kernel` to document agent UI protocol, Bun/Hono gateway, AG-UI event
transport, assistant-ui or CopilotKit surfaces, contracts, observability, and
MCP/HTTP sidecar boundaries.

## Failure Modes

- If no A-K plan fits, use Plan K and record the explicit stack choices.
- If the overlay would make product authority unclear, leave `ai_native_profile` as `none`.

## Boundaries

- Do not expose `create-project-dirs` as a public command; it is the internal directory/helper installer.
- Do not expose a separate AI scaffold command; this mode owns the overlay.
