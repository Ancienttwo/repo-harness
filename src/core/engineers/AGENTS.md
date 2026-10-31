# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `runtime-harness-agent-runtime-effects`
- Domain: `runtime-harness`
- Name: `agent-runtime-effects`
- Primary prefix: `src/effects/engineers/agent-runtime-adapters`
- Architecture module: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`

## Positioning

Owns admitted session-bound, at-most-once Agent Runtime Effect V2 for the closed Herdr CLI adapter, inbox notification and durable offer wake.

## Source Map

- Primary prefix: `src/effects/engineers/agent-runtime-adapters` (entrypoint)
- Architecture module: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md` (design-source)

## Refresh Hints

- `bun run test:files tests/unit/r1-provider-neutral-agent-runtime.test.ts tests/unit/r1-agent-runtime-adapters.test.ts tests/unit/issue-281-task-offer-wake.test.ts --timeout 60000`
- `bun run check:type`
<!-- END CAPABILITY CONTEXT -->
