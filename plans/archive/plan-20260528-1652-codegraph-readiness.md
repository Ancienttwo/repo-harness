# Plan: Codegraph Vendoring + Tool Readiness

> **Status**: Archived
> **Created**: 20260528-1652
> **Slug**: codegraph-readiness
> **Planning Source**: codex-plan
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/codegraph-readiness.contract.md`
> **Sprint Review**: `tasks/reviews/codegraph-readiness.review.md`
> **Implementation Notes**: `tasks/notes/codegraph-readiness.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260528-1652-codegraph-readiness.md`
- Sprint contract: `tasks/contracts/codegraph-readiness.contract.md`
- Sprint review: `tasks/reviews/codegraph-readiness.review.md`
- Implementation notes: `tasks/notes/codegraph-readiness.notes.md`
- Todo projection: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/codegraph-readiness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan when present; `.claude/.active-plan` is a legacy fallback during transition. Use `scripts/switch-plan.sh --plan plans/plan-20260528-1652-codegraph-readiness.md` when multiple plans exist.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260528-1652-codegraph-readiness.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260528-1652-codegraph-readiness.md`.

## Approach
### Strategy
Use Option D from the captured consult, with the review corrections below as the authoritative execution guard.

The implementation keeps host adapter installation and tool readiness separate:

```text
agentic-dev install --target codex|claude|both
  -> writes host global hook adapters only

agentic-dev tools ensure codegraph
  -> resolves local/global CodeGraph
  -> may install/sync project readiness state
  -> does not write MCP config by default

agentic-dev doctor
  -> reports readiness only
  -> prints remediation commands
  -> does not mutate dependencies, indexes, daemons, or MCP config
```

Existing `scripts/check-agent-tooling.sh` CodeGraph detection is part of the source path. The implementation must migrate or wrap that logic instead of creating an unrelated second detector.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `tasks/contracts/codegraph-readiness.contract.md` | Add | Scope and verification contract for this plan |
| `tasks/notes/codegraph-readiness.notes.md` | Add | Design decisions and review corrections |
| `tasks/reviews/codegraph-readiness.review.md` | Add | Pending implementation review surface |
| `package.json`, `bun.lock` | Modify | Add vendored CodeGraph dependency and lockfile |
| `scripts/check-agent-tooling.sh`, `assets/templates/helpers/check-agent-tooling.sh` | Refactor | Reuse or delegate its current CodeGraph detector and keep generated helper parity |
| `scripts/ensure-codegraph.sh` | Add | Thin entrypoint for CI/bootstrap and local ensure |
| `src/cli/**` | Add | Future CLI tools command and doctor integration |
| `.ai/harness/policy.json`, `assets/workflow-contract.v1.json`, `scripts/ensure-task-workflow.sh`, `scripts/lib/project-init-lib.sh` | Modify | Align generated policy/template surfaces with the vendoring decision or declare a self-host exception |
| `tests/check-agent-tooling.test.ts`, `tests/create-project-dirs.runtime.test.ts`, `tests/migration-script.test.ts`, `tests/cli/**`, `tests/tooling/**` | Modify/Add | Cover detector migration, generated policy, CLI behavior, and integration |
| `docs/reference-configs/external-tooling.md`, `docs/architecture/modules/verification/codegraph-readiness.md`, `.ai/context/capabilities.json`, `CLAUDE.md`, `AGENTS.md` | Modify/Add | Document the new readiness model |

### Code Snippets
See captured planning output.

### Data Flow
```text
Dependency install path
  bun install
    -> package.json devDependency
    -> node_modules/.bin/codegraph
    -> scripts/ensure-codegraph.sh / CLI resolver

Read-only check path
  agentic-dev doctor --json
    -> checkCodegraph()
    -> resolve local/global bin
    -> read MCP/index/daemon status
    -> print remediation
    -> no install, no sync, no MCP writes

Mutation path
  agentic-dev tools ensure codegraph
    -> ensureCodegraph()
    -> may run bun install / codegraph init / codegraph sync
    -> default installMcp=false
    -> emits structured actions

Compatibility path
  scripts/check-agent-tooling.sh --strict-readiness
    -> calls or mirrors the same CodeGraph readiness logic
    -> preserves existing external-tooling report contract
```

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |
| Generated policy still says `do-not-add-package-dependency` | High | Tests or downstream generated repos contradict the vendored strategy | Update `.ai/harness/policy.json`, generator heredocs, and tests, or declare a self-host-only exception |
| Two CodeGraph detectors drift | High | Doctor and `check-agent-tooling.sh` report different readiness | Migrate existing detector behavior into one reusable implementation |
| Doctor mutates developer machines | Medium | A read-only diagnostic can unexpectedly install packages or rewrite indexes | Keep `doctor` read-only and move mutations to `tools ensure codegraph` |
| Global MCP config points at a different binary than the vendored one | Medium | This repo looks ready while the MCP server uses another CodeGraph | Report local/global drift and leave MCP mutation opt-in |

## Plan Review Corrections

- Materialized the missing sprint contract, notes, and review files before any implementation projection.
- Added generated policy/template/test surfaces to scope because current policy explicitly says CodeGraph should not be a package dependency.
- Resolved `--strict-readiness` as existing, not an open question.
- Reframed `doctor` as read-only. `tools ensure codegraph` owns all mutation.
- Kept `tasks/todo.md` on hook-global runtime until this Draft is approved and projected.

## Task Contracts
- Contract file: `tasks/contracts/codegraph-readiness.contract.md`
- Review file: `tasks/reviews/codegraph-readiness.review.md`
- Implementation notes file: `tasks/notes/codegraph-readiness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/codegraph-readiness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and mirrored to `.claude/.active-plan` unless --no-active is used; latest non-archived `plans/plan-*.md` is a compatibility fallback only.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `tasks/todo.md`, `tasks/contracts/codegraph-readiness.contract.md`, `tasks/reviews/codegraph-readiness.review.md`, and `tasks/notes/codegraph-readiness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/codegraph-readiness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260528-1652-codegraph-readiness.md`; after execution revert branch `codex/codegraph-readiness` or the generated task artifacts

## Captured Planning Output

# Codegraph Vendoring + Tool Readiness

> Status: Draft (do NOT execute — gated behind hook-global-runtime Phase 0 closeout)
> Source: codex-plan (session 019e6db1-47b5-75d2-957f-d59e0fddb3db, two-round consult on 2026-05-28)
> Origin: derived from "B vs C" debate during hook-global-runtime Phase 0; codex independently recommended Option D (unified CLI surface, separate registry) over both B (independent plan) and C (fold into active plan).

## Goal

Vendor `@colbymchenry/codegraph` as a repo `devDependency` so cross-machine bootstrap is `bun install` instead of `npm install -g codegraph + codegraph install --target codex`. Surface codegraph readiness through the same `agentic-dev` CLI that hosts the global hook runtime — without polluting the host-adapter installer's `--target` semantics.

## Rationale (why D, not B or C)

- **C (fold into hook-global-runtime plan)** is rejected: it would overload `agentic-dev install --target` from "host adapter writer" into "host or tool readiness orchestrator". host targets write global config + handle trust; tool targets install deps + init repo state + may spawn daemons + may mutate `.codegraph/`. Same word, different lifecycle, rollback, permissions, and failure modes. Registry rots on the first non-codegraph tool.
- **B (pure independent plan)** is rejected: it creates split-brain — `agentic-dev doctor` says hooks fine while codegraph is missing or stale. Long-term that is a product lie because the user experiences the machine as one readiness contract.
- **D wins**: keep `install --target codex|claude|both` host-only; add a separate `agentic-dev tools ensure codegraph` verb plus `doctor.checkCodegraph()`. Unified CLI surface, separate registry. Future extension point: `agentic-dev tools ensure <other-tool>`.

## Scope

- In scope:
  - `package.json`: add `@colbymchenry/codegraph` to `devDependencies`
  - `bun.lock`: commit lockfile
  - `scripts/ensure-codegraph.sh`: shell entry adapter (CI / postinstall / bootstrap). Thin — calls `bun src/cli/index.ts tools ensure codegraph "$@"` once CLI exists; uses a temporary `src/cli/tools/codegraph-runner.ts` during the dependency slice before Phase 1A CLI is built.
  - `src/cli/tools/codegraph.ts`: authoritative TS implementation (resolve / check / ensure)
  - `src/cli/commands/tools.ts`: registers `agentic-dev tools ensure codegraph` (and reserves `tools restart codegraph`, `tools mcp install codegraph` as later verbs)
  - `src/cli/commands/doctor.ts`: extend to call `checkCodegraph()` and surface `mcpRegistered / indexFresh / daemonRunning / globalFallbackUsed`
  - `.ai/hooks/lib/codegraph-bin.sh`: shared helper that resolves codegraph bin path (local-first, optional global fallback). Replaces ad-hoc `command -v codegraph` in any hook that needs it.
  - `tests/cli/codegraph.test.ts` + `tests/cli/codegraph-resolver.test.ts` + `tests/tooling/codegraph-integration.test.ts`
  - `scripts/check-agent-tooling.sh` and `assets/templates/helpers/check-agent-tooling.sh`: migrate or wrap the existing CodeGraph detector so `agentic-dev doctor`, `tools ensure codegraph --check`, and the legacy tooling report share one readiness model while generated helper copies stay aligned
  - Generated policy/template surfaces currently encoding CodeGraph as global-only tooling: `.ai/harness/policy.json`, `assets/workflow-contract.v1.json`, `scripts/ensure-task-workflow.sh`, `scripts/lib/project-init-lib.sh`, and related tests
  - Existing generated-policy tests that currently assert `vendoring_policy: do-not-add-package-dependency`: `tests/create-project-dirs.runtime.test.ts` and `tests/migration-script.test.ts`
  - `docs/architecture/modules/verification/codegraph-readiness.md` (new architecture module)
  - `docs/reference-configs/external-tooling.md`: add vendored codegraph section
  - `.ai/context/capabilities.json`: register `verification-codegraph-readiness` capability
  - `tasks/contracts/codegraph-readiness.contract.md` (new sprint contract)
  - `tasks/notes/codegraph-readiness.notes.md`, `tasks/reviews/codegraph-readiness.review.md`
  - `CLAUDE.md` + `AGENTS.md`: update line about codegraph from "non-vendored, required" to "vendored as devDep + verified by `agentic-dev doctor`"
- Out of scope (future direction):
  - Auto-writing MCP config to point at vendored bin (would break other repos that share global MCP). Stays manual / opt-in via later `agentic-dev tools mcp install codegraph --target both`.
  - Vendoring sentrux / gbrain / other tools. The `tools ensure X` shape is intentionally extensible; first additional tool gets its own slice.
  - Killing existing `~/.codegraph/` daemon on doctor run. `--restart-daemon` is explicit.
  - Removing global codegraph from user machines.

## Implementation Sketch (D-as-designed-by-codex)

### `src/cli/tools/codegraph.ts` API

```ts
export type CodegraphSource = "local" | "global" | "missing";
export type CodegraphStatus = "ready" | "warning" | "partial" | "missing" | "failed";

export interface CodegraphResolveOptions {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  preferLocal?: boolean;          // default true
  allowGlobalFallback?: boolean;  // default true; false = repo-only intent
}

export interface CodegraphResolution {
  source: CodegraphSource;
  binPath: string | null;
  version: string | null;
  globalBinPath?: string | null;
  localBinPath?: string | null;
  drift?: { local: string | null; global: string | null } | null;
  reason: string;
}

export interface CodegraphCheckResult {
  status: CodegraphStatus;
  resolution: CodegraphResolution;
  mcp: { codex: McpStatus; claude: McpStatus };
  index: { exists: boolean; status: "fresh" | "stale" | "missing" | "unknown"; path: string };
  daemon: { running: boolean | null; pid: number | null; source: "local" | "global" | "unknown" | null };
  commands: { init: string; sync: string; status: string };
  failures: ToolFailure[];  // each capped at ~4KB stdout/stderr; overflow links to ~/.codegraph/logs/
}

export interface CodegraphEnsureOptions extends CodegraphResolveOptions {
  init?: boolean;                                   // default true
  sync?: boolean;                                   // default true
  installMcp?: false | "codex" | "claude" | "both"; // default false — see Q6
  restartDaemon?: boolean;                          // default false
  json?: boolean;
}

export interface CodegraphEnsureResult extends CodegraphCheckResult {
  actions: ToolAction[];
  changed: boolean;
}

export function resolveCodegraph(opts: CodegraphResolveOptions): Promise<CodegraphResolution>;
export function checkCodegraph(opts: CodegraphResolveOptions): Promise<CodegraphCheckResult>;  // read-only
export function ensureCodegraph(opts: CodegraphEnsureOptions): Promise<CodegraphEnsureResult>; // mutates
```

### PATH resolution (key invariant)

- Never rely on shell `$PATH` for THIS repo's hook/CLI invocations.
- Resolution order: `<repoRoot>/node_modules/.bin/codegraph` → `command -v codegraph` (only if `allowGlobalFallback`) → missing.
- Hooks call `.ai/hooks/lib/codegraph-bin.sh` (thin printer) instead of inlining resolution logic.
- Version drift: local wins silently in execution; doctor reports `warning: local=X global=Y using=local`.

### MCP non-interference

- `ensureCodegraph({ installMcp: false })` is the default. Reason: MCP config lives in `~/.codex/config.toml` / `~/.claude/.mcp.json` — global host state. Auto-pointing it at a repo-local bin breaks other repos.
- Doctor reports `mcpRegistered: false` with remediation text; does NOT mutate.
- Later explicit verb: `agentic-dev tools mcp install codegraph --target codex|claude|both` (reserve, do not build yet).

### Edge case decision table

| Scenario | `doctor` returns |
|----------|------------------|
| Global exists, devDep declared, `bun install` not run | `status: partial`, `source: global`, `globalFallbackUsed: true`, remediation: `bun install` |
| `bun install` offline, Bun cache hit | `status: partial`, falls through to local |
| `bun install` offline, no cache | `status: missing`, remediation: `bun install` when online (NOT `npm install -g`) |
| `.codegraph/daemon.pid` from prior global session | do NOT kill; run `codegraph status .`; only `--restart-daemon` if bin/daemon mismatch or stale lock |
| User intentionally removed global, local bin present | `status: ready`; global absence silent |
| `allowGlobalFallback: false` AND local missing | `status: missing` (treats repo-only intent as authoritative) |

### Shell adapter strategy

- `scripts/ensure-codegraph.sh` is a thin entry. Once `src/cli/` exists: `exec bun src/cli/index.ts tools ensure codegraph "$@"`.
- Before Phase 1A CLI scaffold: shell calls temporary `src/cli/tools/codegraph-runner.ts` directly via `bun`. Merged into formal CLI in Phase 1A.
- Shell never reimplements init/sync/MCP logic. One source of truth.
- `agentic-dev doctor` never calls the mutating path. It only calls read-only check logic and prints the `tools ensure codegraph` remediation.

### `tasks/contracts/codegraph-readiness.contract.md` skeleton

- Capability ID: `verification-codegraph-readiness`
- Architecture domain: `verification`
- Architecture module: `docs/architecture/modules/verification/codegraph-readiness.md`
- `allowed_paths`:
  - `package.json`, `bun.lock`
  - `scripts/ensure-codegraph.sh`, `scripts/check-agent-tooling.sh`
  - `src/cli/**`, `tests/cli/**`, `tests/tooling/**`
  - `tests/check-agent-tooling.test.ts`, `tests/create-project-dirs.runtime.test.ts`, `tests/migration-script.test.ts`
  - `.ai/harness/policy.json`, `assets/workflow-contract.v1.json`, `scripts/ensure-task-workflow.sh`, `scripts/lib/project-init-lib.sh`
  - `docs/architecture/modules/verification/codegraph-readiness.md`
  - `docs/reference-configs/external-tooling.md`
  - `.ai/context/capabilities.json`, `.ai/hooks/lib/codegraph-bin.sh`
  - `tasks/contracts/codegraph-readiness.contract.md`, `tasks/notes/codegraph-readiness.notes.md`, `tasks/reviews/codegraph-readiness.review.md`
  - `tasks/todo.md`
  - `CLAUDE.md`, `AGENTS.md`
- Verification:
  - `bun install --frozen-lockfile` (CI variant; local `tools ensure codegraph` may use plain `bun install`; `doctor` stays read-only)
  - `bash scripts/ensure-codegraph.sh --check --json`
  - `bun test tests/cli/codegraph*.test.ts tests/tooling/codegraph*.test.ts`
  - `bash scripts/check-agent-tooling.sh --host both --strict-readiness --json` (`--strict-readiness` already exists today)
  - `agentic-dev doctor --json`

## Rollout Phases

### Phase 0: Gating

- **MUST NOT START implementation** until this plan has a materialized contract, notes, and review file, and hook-global-runtime Phase 0 acceptance remains recorded in `tasks/reviews/hook-global-runtime.review.md`.
- Do not require the whole hook-global-runtime contract to be `Done` before this plan exists. That contract stays `Partial` until Phase 1 CLI runtime closes.
- Do not project this plan into `tasks/todo.md` while hook-global-runtime Phase 1A is the active execution slice, unless the user explicitly switches plans or opens a separate worktree.

### Phase 1: Dependency slice (no CLI required)

- Add `@colbymchenry/codegraph` to `devDependencies`
- `bun install` to generate `bun.lock`
- Write `scripts/ensure-codegraph.sh` + temporary `src/cli/tools/codegraph-runner.ts`
- Extract current `scripts/check-agent-tooling.sh` CodeGraph semantics into the runner or call path so existing report behavior is preserved
- Update generated policy/template surfaces or explicitly encode a self-host-only vendoring exception
- Tests for resolver (local-present, global-present, both-present-with-drift, neither, allowGlobalFallback=false)
- `scripts/check-agent-tooling.sh` switches default recommendation

### Phase 2: CLI integration (after hook-global-runtime Phase 1A lands)

- Move runner logic to `src/cli/tools/codegraph.ts` proper
- Register `src/cli/commands/tools.ts` with subcommand `ensure codegraph`
- Wire `src/cli/commands/doctor.ts` to call `checkCodegraph()`
- Add a regression that `doctor --json` is read-only: no `bun install`, `codegraph init`, `codegraph sync`, or MCP writes
- `.ai/hooks/lib/codegraph-bin.sh` for hook reuse

### Phase 3: Contract + docs

- Write contract + capability + architecture module
- Update CLAUDE.md / AGENTS.md
- Update `docs/reference-configs/external-tooling.md`

### Phase 4: Closeout

- Contract verification suite passes
- codegraph init/sync smoke on this repo (vendored bin path)
- Confirm other repos still work with their global codegraph (no global config mutation by us)

## Resolved Design Decisions

1. **Architecture path**: keep hook-global runtime evidence in the existing `docs/architecture/global-hook-runtime.md`; add the new CodeGraph module under `docs/architecture/modules/verification/codegraph-readiness.md`.
2. **`--strict-readiness`**: already exists in `scripts/check-agent-tooling.sh`; this plan must preserve it.
3. **Shared tool types**: keep `McpStatus`, `ToolFailure`, and `ToolAction` local to the CodeGraph module for the first tool. Move them to `src/cli/tools/types.ts` only when a second tool reuses them.
4. **Lockfile strategy**: CI verification uses `bun install --frozen-lockfile`; `doctor` never runs install. `tools ensure codegraph` may run plain `bun install` and report lockfile changes as an action.
5. **Restart verb**: defer `agentic-dev tools restart codegraph`; do not reserve a half-built command in Phase 2.

## Claude (Sonnet 4.6) micro-adjustments on top of codex design

| Codex said | Claude refinement |
|---|---|
| `bun install --frozen-lockfile` as verification check | Fine for CI; local `tools ensure codegraph` may use plain `bun install`, but `doctor` stays read-only. |
| `.ai/hooks/lib/codegraph-bin.sh` helper | Place alongside existing `scripts/lib/workflow-state.sh` convention; one source of bin resolution per host. |
| `docs/architecture/global-hook-runtime.md` | Keep the existing hook-global runtime evidence path for this plan; only the new CodeGraph module uses `docs/architecture/modules/verification/codegraph-readiness.md`. |
| `failures: ToolFailure[]` with stdout/stderr | Cap each at ~4KB; overflow points to `~/.codegraph/logs/` via path reference. |
| `--restart-daemon` flag on ensure | Promote to standalone verb `agentic-dev tools restart codegraph` instead of overloading ensure. |

## Source

- Codex session: `019e6db1-47b5-75d2-957f-d59e0fddb3db` (continue via `/codex` in `.context/codex-session-id`)
- Origin debate: "B vs C" decision during hook-global-runtime Phase 0 execution, captured 2026-05-28
- Active plan being protected: `plans/plan-20260528-1436-hook-global-runtime.md` (do not modify Phase 1A `Target` types or `install --target` semantics from this plan)

## Annotations

<!--
Annotation cycle completed 2026-05-28.

Review corrections were incorporated externally (via plan-eng-review and codex consult)
rather than through inline annotation markers. The resolved corrections are recorded in
three places and no outstanding items remain:

  1. This plan body — "Plan Review Corrections" section, the rebuilt File Changes table,
     "Resolved Design Decisions" (replacing the prior Open Questions), and the Phase 0/1/2
     Rollout updates.
  2. tasks/notes/codegraph-readiness.notes.md — "Review Corrections Applied" section.
  3. tasks/reviews/codegraph-readiness.review.md — Eng Review CLEAR verdict and scorecard.

GSTACK REVIEW REPORT below records the verdict: ENG CLEARED for Draft plan quality.

No remaining annotation items. Plan is ready for Annotating -> Approved transition.
-->

## Task Breakdown
- [x] Materialize `tasks/contracts/codegraph-readiness.contract.md`, `tasks/notes/codegraph-readiness.notes.md`, and `tasks/reviews/codegraph-readiness.review.md`
- [x] Revise plan scope so generated policy/template/test surfaces are explicit
- [x] Resolve stale open questions from the first captured consult
- [x] Execute dependency and detector slice after plan projection
- [ ] Execute full CLI integration after hook-global runtime Phase 1A lands

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Not required for this tooling readiness correction |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues found | Earlier outside voice produced the Option D plan shape |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR | Initial 5 findings incorporated into plan, contract, notes, and review; 0 critical gaps open |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | No UI surface |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Not required for this plan correction |

- **CODEX:** Option D retained: unified CLI surface with separate tool readiness registry.
- **CROSS-MODEL:** Codex and eng review agree on keeping host adapter install separate from CodeGraph tool readiness.
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED for Draft plan quality. Implementation still requires explicit projection or a separate worktree because `tasks/todo.md` remains on hook-global-runtime.
