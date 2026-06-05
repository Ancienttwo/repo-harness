---
name: repo-harness-scaffold
description: Branch command that creates a new project or module scaffold from the repo-harness plan catalog A-K, then attaches the repo-local workflow harness.
when_to_use: "repo-harness-scaffold, scaffold new project, create new app with agentic workflow, Plan A, Plan B, Plan C, Plan D, Plan E, Plan F, Plan G, Plan H, Plan I, Plan J, Plan K"
---

# repo-harness-scaffold

Use this branch command when the user asks to create a new project, app, or module skeleton.

## Protocol

1. Confirm the target parent path, project name, plan catalog entry, and package manager.
2. Use the plan catalog A-K from `assets/plan-map.json`.
3. If the app needs agent runtime structure, select `ai_native_profile` as an overlay; otherwise keep the default `none`.
4. Run `scripts/init-project.sh` or the matching stack template path.
5. Attach the tasks-first workflow through the same contract install path used by `repo-harness-init`.
6. Verify scaffold output and workflow checks.

## AI-native Overlay

The AI-native profile is an overlay, not a new plan code. Keep A-K for project
type, then use profile values such as `runtime-console`, `product-copilot`, or
`sidecar-kernel` to document agent UI protocol, Bun/Hono gateway, AG-UI event
transport, assistant-ui or CopilotKit surfaces, contracts, observability, and
MCP/HTTP sidecar boundaries.

## Failure Modes

- If the target already contains an app or repo workflow, route to `repo-harness-init`, `repo-harness-migrate`, or `repo-harness-upgrade`.
- If no A-K plan fits, use Plan K and record the explicit stack choices.
- If the overlay would make product authority unclear, leave `ai_native_profile` as `none`.

## Boundaries

- Do not use this command for an existing repo that only needs hooks, docs, or harness files.
- Do not expose `create-project-dirs` as a public command; it is the internal directory/helper installer.
- Do not expose a separate AI scaffold command; this command owns the overlay.
- If the user says "initialize existing repo", route to `repo-harness-init`.
