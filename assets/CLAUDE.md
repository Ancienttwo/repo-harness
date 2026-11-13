# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

<!-- BEGIN CAPABILITY CONTEXT -->
## Capability Context

- Capability ID: `workflow-engine-contract-assets`
- Domain: `workflow-engine`
- Name: `contract-assets`
- Primary prefix: `.ai/context`
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md`

## Positioning

Owns the package workflow contract, repo opt-in marker, templates, capability nodes, and the standalone resolver projection.

## Source Map

- Primary prefix: `.ai/context` (entrypoint)
- Architecture module: `docs/architecture/modules/workflow-engine/contract-assets.md` (design-source)

## Refresh Hints

- `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts`
- `bun scripts/capability-resolver.ts validate --format text`
- `bun run check:helpers`
<!-- END CAPABILITY CONTEXT -->

<!-- BEGIN ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.contract-assets" rendererVersion="archcontext.agent-context-renderer/v2" outputDigest="sha256:90c741e172d323849052c9de68df15df33ba25a4b3e1fe7b4148abd7810ac102" -->
# Agent Context: Contract Assets

- id: `capability.workflow-engine.contract-assets`
- kind: `capability`
- summary: Owns the package workflow contract, repo opt-in marker, templates, capability nodes, and the standalone resolver helper file.
- source.include: `agents/fleet/**`, `.codex/agents/**`, `scripts/install-agent-fleet.sh`, `assets/workflow-contract.v1.json`, `.ai/context/**`, `.archcontext/model/nodes/**`, `scripts/capability-resolver.ts`, `scripts/capability-config.ts`, `scripts/contract-worktree.sh`, `scripts/merge-gate.ts`, `scripts/ship-worktrees.sh`, `assets/templates/**`, `assets/reference-configs/**`, `docs/reference-configs/**`, `assets/AGENTS.md`, `assets/CLAUDE.md`, `.archcontext/**`, `docs/adr/**`, `src/core/capabilities/**`, `assets/project-structures/**`, `assets/plan-map.json`, `assets/versions.json`, `.claude/templates/**`, `scripts/workflow-contract.ts`, `scripts/check-context-map.ts`, `scripts/check-context-files.sh`, `scripts/select-agent-context-blocks.sh`, `scripts/sync-reference-configs.ts`, `scripts/contract-worktree-runtime.ts`, `scripts/worktree-merge-lib.sh`, `scripts/cutover-closure.ts`, `scripts/new-spec.sh`, `scripts/summarize-failures.sh`, `scripts/maintenance-triage.sh`, `scripts/heartbeat-triage.sh`, `scripts/check-deploy-sql-order.sh`, `scripts/factor-lab-new.sh`, `scripts/factor-lab-promote.sh`, `scripts/factor-lab-reject.sh`, `scripts/factor-lab-check.sh`
- source.exclude: `assets/reference-configs/external-tooling.md`, `docs/reference-configs/external-tooling.md`, `docs/reference-configs/install-profiles.md`, `docs/reference-configs/chatgpt-coding-mcp.md`, `docs/architecture/**`, `docs/researches/**`, `.ai/harness/**`, `docs/design/**`, `references/plugins-core.md`
- extensions.lspProfile: `typescript-lsp`
- extensions.verification: `bun run test:files tests/install-agent-fleet.test.ts --timeout 60000 --max-concurrency 1`, `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts`, `bun scripts/capability-resolver.ts validate --format text`, `bun run check:helpers`
- extensions digest: sha256:d5fffb6e85afb214469388a99a430077d4946e04e881c4877b0f5d4a104e128e
<!-- END ARCHCONTEXT AGENT CONTEXT id="capability.workflow-engine.contract-assets" -->
