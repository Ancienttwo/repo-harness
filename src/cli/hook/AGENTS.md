# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

## Local Context Contract

- `src/cli/hook/` owns host-event runtime authority: the typed route registry, the runtime and the handlers. Operator helpers run from the package through `rh run <helper>`.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `runtime-harness-hook-adapters`
- Domain: `runtime-harness`
- Name: `hook-adapters`
- Primary prefix: `src/cli/commands/install.ts`
- Architecture module: `docs/architecture/modules/runtime-harness/hook-adapters.md`

## Positioning

Installs and runs typed Claude, Codex and Pi host hook routes.

## Source Map

- Primary prefix: `src/cli/commands/install.ts` (entrypoint)
- Architecture module: `docs/architecture/modules/runtime-harness/hook-adapters.md` (design-source)

## Refresh Hints

- `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/workflow-contract.test.ts`
- `bun run test:files tests/cli/route-registry.test.ts tests/stop-handler.test.ts tests/cli/install.test.ts tests/cli/status.test.ts tests/cli/security.test.ts tests/cli/hook.test.ts tests/hook-protocol.test.ts --timeout 60000 --max-concurrency 1`
- `bun run test:files tests/pi-extension.test.ts tests/pi-compat.test.ts tests/cli/pi-install.test.ts --timeout 60000 --max-concurrency 1`
<!-- END CAPABILITY CONTEXT -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.hook-adapters" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:25bec8b15f2493f6111eb6a99b0c7c16b4dcc820e009b572ccaa4cce70298c76" -->
# Agent Context: Hook Adapters

- id: `capability.runtime-harness.hook-adapters`
- kind: `capability`
- summary: Installs and runs typed Claude, Codex and Pi host hook routes.
- source.include: `src/cli/hook/**`, `src/cli/installer/**`, `src/pi/**`, `src/effects/managed-tree.ts`, `src/cli/hook-entry.ts`, `src/effects/loop/**`, `src/effects/segmented-log.ts`, `src/effects/run-summary-retention.ts`, `src/cli/commands/install.ts`, `src/cli/commands/status.ts`, `src/cli/commands/security.ts`
- source.exclude: `src/cli/hook/agent-notice.ts`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun test tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/workflow-contract.test.ts`, `bun run test:files tests/cli/route-registry.test.ts tests/stop-handler.test.ts tests/cli/install.test.ts tests/cli/status.test.ts tests/cli/security.test.ts tests/cli/hook.test.ts tests/hook-protocol.test.ts --timeout 60000 --max-concurrency 1`, `bun run test:files tests/pi-extension.test.ts tests/pi-compat.test.ts tests/cli/pi-install.test.ts --timeout 60000 --max-concurrency 1`
- extensions digest: sha256:49e2bf2b4822fac7d5ba84f50c75857d23c82594885c2dc79f0230769d57d413
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.runtime-harness.hook-adapters" -->
