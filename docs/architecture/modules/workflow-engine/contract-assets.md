# Architecture Module: workflow-engine/contract-assets

> **Capability ID**: `workflow-engine-contract-assets`
> **Matched Prefixes**: `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`, `.ai/harness/policy.json`, `.ai/context/context-map.json`, `.ai/context/capabilities.json`, `assets/templates`, `assets/reference-configs`, `docs/reference-configs`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

Contract assets define what the engine installs and what generated repos verify.

Authoritative files:

- `assets/workflow-contract.v1.json`: source contract.
- `.ai/harness/workflow-contract.json`: self-host runtime copy.
- `.ai/harness/policy.json`: self-host workflow policy and external tooling guidance.
- `.ai/context/context-map.json`: progressive context loading contract.
- `.ai/context/capabilities.json`: capability registry for longest-prefix ownership.
- `assets/templates/` and `.claude/templates/`: generated workflow document templates.
- `assets/reference-configs/` and `docs/reference-configs/`: repo-local and installable reference config corpus.

## P2 Trace

Concrete route: engine calls `pi_install_workflow_contract` -> copies
`assets/workflow-contract.v1.json` into `.ai/harness/workflow-contract.json` ->
`pi_write_harness_policy` merges defaults without overwriting explicit repo
values -> `pi_write_context_map` writes root and discoverable context policy ->
`pi_write_capability_registry` preserves existing registry or writes a generated
one when missing.

Type transformations:

- JSON contract asset -> installed JSON manifest.
- Shell policy template -> merged `.ai/harness/policy.json`.
- Selected blocks or capability registry -> context map and module/workstream ownership.

Error paths:

- Contract/runtime parity drift is caught by `tests/workflow-contract.test.ts`.
- Capability orphan modules are caught by `capability-resolver.ts validate`.
- Brain manifest drift is caught by `scripts/check-brain-manifest.sh`; opted-in repo-to-brain mirror drift is caught by `scripts/sync-brain-docs.sh --check`.

## P3 Decision

Contract assets are separated from runtime state so generated repos can verify
themselves without a service. The invariant is that tracked contract files are
durable truth, while `.ai/harness/checks/latest.json`, handoff packets, failure
logs, architecture events, worktrees, and run snapshots are
ignored runtime state.

At 10x generated repos, the first failure would be self-host behavior diverging
from generated output. The smallest coherent guard is parity tests plus
self-migration dry-run.

## 2026-05-29 Cleanup Script Policy Closeout

- `worktree_strategy.cleanup_script` is part of the policy contract surface. It advertises the terminal cleanup command generated repos can call after `finish` has already archived and merged a contract worktree.
- The runtime owner remains `scripts/contract-worktree.sh`; `.ai/harness/policy.json`, `scripts/ensure-task-workflow.sh`, and `scripts/lib/project-init-lib.sh` only publish the command shape for self-host and generated repos.
- File-prefix capability requests such as `.ai/harness/policy.json` still belong to `workflow-engine-contract-assets`; local capability context is projected to `assets/AGENTS.md` and `assets/CLAUDE.md`.
- No new architecture snapshot or human diagram is required because the module boundary, entrypoints, and dependency direction are unchanged.

## 2026-06-12 Architecture Queue Contract Closeout

- The self-host workflow contract helper inventory now names
  `architecture-queue.sh` as the architecture request helper; the retired
  `architecture-drift.sh` is removed from the source and installable helper
  templates.
- `.ai/harness/policy.json` and generated policy templates expose
  `architecture.freshness_gate`, `gate_min_severity`, pending block markers, and
  `queue_script` so slice 2 can promote the gate from advisory to strict without
  changing the queue data model.
- The contract invariant remains byte parity between
  `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json`;
  helper installation stays flat under `scripts/`.

## 2026-07-06 Delegation Policy Auto Mode Closeout

- `.ai/harness/policy.json` now documents that `delegation.mode=auto` is
  install-time standing user authorization for bounded Codex delegation on
  prompts without explicit trigger words.
- Global `~/.repo-harness/config.json` remains the user-level authority for the
  mode choice and takes precedence over repo policy when the value is exactly
  `auto` or `explicit`; repo policy is still the generated/self-host fallback.
- This is a policy text contract change only. It does not change contract asset
  ownership, helper inventory shape, byte-parity requirements, or generated repo
  storage boundaries.

## Workstream Ledger

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`

## Optimization Backlog

- Promote `bun scripts/capability-resolver.ts validate --format text` into the strict workflow gate after one more real architecture slice.
- Keep optional long-form docs in default brain stubs; mirror valuable repo-authored docs only through manifest `sync.direction=repo-to-brain` entries.
