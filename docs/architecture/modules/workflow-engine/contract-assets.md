# Architecture Module: workflow-engine/contract-assets

> **Capability ID**: `workflow-engine-contract-assets`
> **Matched Prefixes**: `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`, `.ai/harness/policy.json`, `.ai/context/context-map.json`, `.ai/context/capabilities.json`, `scripts/capability-resolver.ts`, `scripts/capability-config.ts`, `scripts/contract-run.ts`, `src/cli/commands/capability-context.ts`, `assets/templates`, `assets/reference-configs`, `docs/reference-configs`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

Contract assets define what the engine installs and what generated repos verify.

Authoritative files:

- `assets/workflow-contract.v1.json`: source contract.
- `.ai/harness/workflow-contract.json`: self-host runtime copy.
- `.ai/harness/policy.json`: self-host workflow policy and external tooling guidance.
- `.ai/context/context-map.json`: progressive context loading contract.
- `.ai/context/capabilities.json`: capability registry for longest-prefix ownership.
- `scripts/capability-resolver.ts`: sole registry reader, validator, and longest-prefix matcher.
- `scripts/capability-config.ts`: explicit authority-creation and capability-add command.
- `src/cli/commands/capability-context.ts`: one-way projection of registered capability context into controlled agent blocks.
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
- Missing, malformed, or non-existent capability prefixes fail closed; the resolver does not synthesize authority from legacy context blocks or directory scans.
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

## 2026-07-11 Capability Authority Closeout

- `.ai/context/capabilities.json` is the only runtime capability authority. Resolver commands fail when it is missing or malformed and reject registered prefixes that do not exist.
- `capability-config add` remains the explicit creation path for a new registry; normal reads no longer derive capabilities from `agent-context-blocks.txt`, environment variables, or nested agent files.
- Capability context files and the ArchContext boundary export remain deterministic, one-way projections of the registry. They do not become alternate authoring surfaces.

## 2026-07-11 Archive Evidence Gate Closeout

- `archive-workflow.sh` is the completion archive authority. `Completed` now
  requires the linked contract to be `Fulfilled`, the review to recommend
  `pass`, current `verify-sprint` structured evidence, passing external
  acceptance or its explicit manual override, and the architecture freshness
  helper to succeed before any workflow artifact moves.
- `Abandoned` and `Superseded` remain non-completion outcomes and preserve the
  complete plan and lifecycle artifact bodies. They do not synthesize passing
  evidence.
- `archive-architecture-request.sh` accepts only a live `Pending` request.
  `Resolved` additionally requires the request's declared architecture module
  to exist and be passed as an existing, repository-contained durable artifact.
  Queue/index projection is rebuilt and checked before and after the move.
- Current-status refresh, architecture reindex, and Sprint backlog back-fill
  failures now propagate to the caller and restore the pre-archive live
  workflow/architecture snapshot. A failed projection can neither be reported
  as a successful finish nor strand the plan/request only in archive storage;
  the same command can be retried after repairing the failed dependency.
- These gates reuse the existing workflow-state, verify-sprint, architecture
  queue, and freshness authorities. No new dependency or compatibility parser
  was added.

## 2026-07-12 Agent Fleet Worker Routing Telemetry Closeout

- `scripts/contract-run.ts` (mirrored byte-for-byte to `assets/templates/helpers/contract-run.ts` through the existing helper projection route) is now a matched prefix of this capability. It is the task-delegation contract runner: it reads a `tasks/contracts/*.contract.md` execution brief, preflights it, generates worker/verifier prompts, optionally dispatches them, and writes a run manifest. This is a distinct "contract" concept from `assets/workflow-contract.v1.json` (the install/workflow contract this capability already owned) — the two share the word by coincidence, not by schema or lifecycle, but both are contract-lifecycle tooling this capability already narrates (compare the pre-existing `scripts/contract-worktree.sh` mention in the 2026-05-29 closeout above).
- Contract roles (`parent`/`explorer`/`worker`/`verifier`; existing generic mode/purpose defaults at `scripts/contract-run.ts:340-346`, unchanged) now also map to the four fixed, model-pinned fleet profiles (`explorer`, `fast-worker`, `deep-reasoner`, `gatekeeper`) through a new `delegation_plan.role_profiles` manifest field (`scripts/contract-run.ts:792-797`):
  - `parent` -> `"orchestrator"`: never model-assigned; not one of the 4 profiles.
  - `explorer` -> `"explorer"` (fixed).
  - `worker` -> derived in `buildRun()` (`scripts/contract-run.ts:754-758`) from the resolved runner dispatch value, without renaming `RunnerContract.preferred`/`fallback`'s pre-existing dispatch-mechanism vocabulary (`subagent` / `codex-subagent` / `codex-exec` / `main-thread`): dispatch `main-thread` -> `"sol-high"`; dispatch `codex-subagent` or `codex-exec` -> the raw dispatch label passed through unchanged (Codex is an independent peer provider, not one of the 4 profiles); any other dispatch (e.g. `subagent`) -> `"fast-worker"`.
  - `verifier` -> `"gatekeeper"` (fixed).
  - `deep-reasoner` sits outside this role table entirely, as an independent escalation path not bound to any single contract role.
- New `--effort <tier>` CLI flag (parsed at `scripts/contract-run.ts:148-151`; validated by the local `EFFORT_TIERS`/`parseEffort()` pair at `scripts/contract-run.ts:190-201` against the closed vocabulary `low`/`medium`/`high`/`xhigh`/`max`, the same tiers `buildFamilyEffortMap()` in `scripts/install-agent-fleet.sh` already uses — kept as a local literal list rather than a shared import because that copy lives inside an embedded Node.js heredoc, not an importable module). Record-only, matching the pre-existing `--runner` philosophy: `contract-run.ts` never itself selects, spawns, or degrades a runner or effort tier. Defaults to `"high"` only when the resolved dispatch is the contract's worker fallback and no explicit `--effort` is passed (`scripts/contract-run.ts:758`).
- New manifest telemetry fields are additive only; `RunnerContract`, `parseRunner()`, `runChild()`, and the run-mode control flow are unchanged:
  - `runner_usage.path`: `"worker_preferred"` | `"worker_fallback"` (`scripts/contract-run.ts:780`).
  - `runner_usage.effort`: resolved effort tier string or `null` (`scripts/contract-run.ts:781`).
  - `delegation_plan.role_profiles`: `{ parent, explorer, worker, verifier }` as derived above (`scripts/contract-run.ts:792-797`).
- Regression coverage lives in `tests/contract-run.test.ts`: the preferred path, the `codex-subagent`/off-policy runner passthrough, the `main-thread` worker-fallback path (`sol-high` plus default effort `"high"`), the `codex-exec` passthrough, and an explicit `--effort xhigh` override sharing one scenario, `"runner metadata from the contract flows into the manifest"` (`tests/contract-run.test.ts:742-891`); invalid `--effort` rejection is `"invalid --effort value exits with usage error"` (`tests/contract-run.test.ts:893-897`).

## Workstream Ledger

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`

## Optimization Backlog

- Promote `bun scripts/capability-resolver.ts validate --format text` into the strict workflow gate after one more real architecture slice.
- Keep optional long-form docs in default brain stubs; mirror valuable repo-authored docs only through manifest `sync.direction=repo-to-brain` entries.
