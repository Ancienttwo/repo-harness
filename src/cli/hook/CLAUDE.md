# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

## Local Context Contract

- `src/cli/hook/` owns host-event runtime authority: the typed route registry, the runtime and the handlers. Operator helpers run from the package through `repo-harness run <helper>`.

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
