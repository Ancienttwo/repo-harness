# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `runtime-harness-agent-runtime-effects`
- Domain: `runtime-harness`
- Name: `agent-runtime-effects`
- Primary prefix: `src/core/engineers/agent-runtime-effect.ts`
- Architecture module: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md`
- Workstream: `tasks/workstreams/runtime-harness/agent-runtime-effects`

## Positioning

Owns the runtime-harness-agent-runtime-effects capability boundary declared in .archcontext/model/nodes.

## Source Map

- Primary prefix: `src/core/engineers/agent-runtime-effect.ts` (entrypoint)
- Architecture module: `docs/architecture/modules/runtime-harness/agent-runtime-effects.md` (design-source)
- Workstream: `tasks/workstreams/runtime-harness/agent-runtime-effects` (durable-progress)

## Refresh Hints

- `bun test tests/unit/r1-provider-neutral-agent-runtime.test.ts tests/unit/r1-agent-runtime-adapters.test.ts tests/unit/issue-281-task-offer-wake.test.ts tests/cli/engineer.test.ts tests/cli/mcp-engineer-tools.test.ts --timeout 60000`
- `bun run check:type`
<!-- END CAPABILITY CONTEXT -->
