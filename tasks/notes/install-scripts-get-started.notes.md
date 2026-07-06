# Install Scripts Get Started Notes

- Decision: the no-Node install path is implemented as OS-specific installer scripts, not as a claimed prebuilt binary download.
- Rationale: the current CLI entrypoints use `#!/usr/bin/env bun`, so the truthful installer boundary is "ensure Bun, install `repo-harness` with Bun, verify `repo-harness --version`."
- Tradeoff: the README mirrors the CodeGraph-style copyable install block, but the package-manager fallback explicitly says the npm path still needs Bun on `PATH`.
- 2026-07-07 update: moved the Bun-owned bootstrap options out of collapsed README details blocks so `bunx repo-harness install`, `bun add -g repo-harness`, and the `npx` fallback are visible in the English and zh-CN first-run install sections. A live `repo-harness install` readback on 0.9.1 confirmed the expected idempotent behavior: when the CLI is already installed from Bun's global package source, the CLI reinstall step is skipped while host adapters, Waza/Mermaid/cross-review skills, brain config, and CodeGraph MCP refresh still run.
- 2026-07-07 visual update: added `docs/images/repo-harness-install-donkey-carrot.png` as the First 5 Minutes install-section banner in the English and zh-CN READMEs. The asset is a generated pixel-art donkey/carrot banner for the install path header, copied into the repo so the README does not depend on a local generated-image cache.
