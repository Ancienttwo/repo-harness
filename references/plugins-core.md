# Retired Claude Plugin Reference

This file is kept only to document the retired compatibility boundary.

`repo-harness` no longer installs or recommends the old Claude plugin bundle as
part of first-run setup. The active setup path is:

```bash
npx -y repo-harness install
```

That command bootstraps the global CLI, user-level hook adapters, repo-harness
runtime aliases, Waza (`think`, `hunt`, `check`, `health`), Mermaid, brain root
configuration, and CodeGraph CLI/MCP readiness.

Existing repositories should use:

```bash
npx -y repo-harness init
```

Use `repo-harness install` for global setup. The legacy plugin setup script is removed.
Global setup does not install retired Claude marketplace plugin bundles.

Project creation moved to the branch command `repo-harness-scaffold`; it is not
the main existing-repo adoption path.
