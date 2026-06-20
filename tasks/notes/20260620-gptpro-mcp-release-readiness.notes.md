# 2026-06-20 GPT Pro MCP release readiness notes

- Release prep moved the ChatGPT Oracle app preselection and MCP invocation-evidence entries from `Unreleased` into the `0.7.4` changelog surface.
- `assets/skill-version.json` now describes the full `0.7.4` release scope: user-scope ChatGPT MCP repo discovery, GPT Pro Connector read-back safeguards, package-dispatched architecture helper fixes, and retired compact-adopt root wrappers.
- Publish must happen only after PR #12 is merged to `main`; npm `repo-harness@0.7.4`, tag `v0.7.4`, and the GitHub release are intentionally absent during this prep slice.
