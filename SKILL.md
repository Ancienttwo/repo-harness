---
name: repo-harness
description: routes repo-harness requests through the CLI and hook automation plugin for init, update, scaffold, migrate, audit, repair, and ship workflows
when_to_use: "repo-harness, initialize repo-local agentic development harness, scaffold new project with repo-harness, migrate repo-local agentic development harness, audit repo-local agentic development harness, repair repo-local agentic development harness"
---

# repo-harness

`repo-harness` is the CLI and hook automation plugin for repo-local agentic
development. The skill entrypoint is a compatibility router over the versioned
workflow engine and CLI command facades.

Compatibility boundary:

- internal engine: CLI plus hook-backed tasks-first harness
- contract ID: tasks-first-harness-v1
- canonical skill, CLI, and package name: `repo-harness`
- new-project creation surface: `repo-harness-scaffold` (secondary generator)

The former `repo-harness-skill` and `project-initializer` aliases have been
fully removed. They are no longer recognized, synced, or cleaned up by any
tooling. Historical markers left behind in long-migrated repos are inert
evidence and are not handled.

The skill should not carry the whole workflow contract in prose. It should:

1. inspect the repository
2. classify the workflow state
3. choose the correct path
4. rely on the repo contract, migration scripts, and tests for enforcement

## When to use

- install or refresh the CLI+hooks workflow in an existing repo
- create a new project or module scaffold only when the user asks for a new product/module skeleton, then attach the harness
- migrate an older repo to the current tasks-first harness
- audit drift between prompts, hooks, scripts, and repo-local contract files
- repair broken task-sync, workflow-contract, or handoff surfaces

## When not to use

- runtime bug debugging inside an already healthy AI workflow
- generic project scaffolding unrelated to AI routing or repo-local workflow contracts
- using scaffold to adopt an existing repo; route that to `repo-harness-init`,
  `repo-harness-migrate`, `repo-harness-upgrade`, or `repo-harness-repair`
- ordinary product feature work

## Router Protocol

Always start with structured inspection, not prompt guessing.

### Step 1. Inspect first

Run:

- `bun scripts/inspect-project-state.ts --repo <path> --format text`
  - fallback: `node --experimental-strip-types scripts/inspect-project-state.ts --repo <path> --format text`

Read the result fields:

- `mode`
- `legacy_contract_version`
- `drift_signals`
- `required_decisions`
- `safe_defaults`

### Step 2. Choose one path

If the request maps to a public command facade, name that route before running
checks or edits, then read the matching
`assets/skill-commands/<repo-harness-command>/SKILL.md` and follow that
facade's protocol. For example, pre-merge or release readiness requests route
to `repo-harness-check`, while broken task sync, hook routing, handoff, context,
policy, or helper surfaces route to `repo-harness-repair`.

1. **Scaffold**
   - use only when creating a new project, app, or module skeleton
   - route to `repo-harness-scaffold`
   - choose the A-K project catalog entry, then optional `ai_native_profile`
   - attach the harness after the project structure exists
   - do not use this path for existing-repo adoption
2. **Initialize**
   - use when the repo has no meaningful tasks-first workflow yet
3. **Migrate**
   - use when the repo has legacy workflow docs, missing contract manifest, or stale harness artifacts
4. **Audit**
   - use when the repo mostly works but the user wants drift analysis and enforcement review
5. **Repair**
   - use when the repo has a current contract surface but broken task-sync, hooks, or handoff behavior
### Step 3. Prefer engine actions over prompt-only fixes

Default order:

1. for new projects, scaffold the requested project/module shape first
2. migrate legacy docs if needed
3. install or refresh workflow contract artifacts
4. sync hooks, helpers, and templates
5. merge the guidance-only `external_tooling` profile into `.ai/harness/policy.json`
6. verify the repo-local contract

Do not treat hooks as the primary source of truth. The repo contract lives in repo files.

## Core Engine Surfaces

The single machine-readable contract source is:

- `assets/workflow-contract.v1.json`

The installed runtime copy inside a repo is:

- `.ai/harness/workflow-contract.json`

The main engine entrypoints are:

- `scripts/inspect-project-state.ts`
- `scripts/migrate-workflow-docs.ts`
- `scripts/migrate-project-template.sh`
- `scripts/check-agent-tooling.sh`
- `scripts/check-task-workflow.sh`
- `scripts/create-project-dirs.sh`

## CLI Command Facade Surface

The command facades live in `assets/skill-commands/` as compatibility wrappers
over the same CLI and hook engine. Use them for routing when the host discovers
skills; the implementation authority stays in the CLI, scripts, hooks, and
contract files:

- `repo-harness-plan`: interactive planning; no repo mutation by default
- `repo-harness-review`: plan review across product, engineering, design, and DevEx
- `repo-harness-autoplan`: automatic plan -> self-review twice -> implementation -> check -> ship pipeline
- `repo-harness-ship`: validate finished worktrees, push branches, and create PRs by default
- `repo-harness-init`: install or refresh the harness in an existing repo
- `repo-harness-scaffold`: create a new project or module scaffold, then attach the harness
- `repo-harness-migrate`: migrate legacy workflow docs and stale harness artifacts
- `repo-harness-upgrade`: refresh an installed harness through manifest-owned upgrade actions
- `repo-harness-capability`: add selected capability boundaries without running full init/migrate/upgrade
- `repo-harness-architecture`: resolve architecture drift requests and update docs or diagrams without harness refresh
- `repo-harness-handoff`: prepare or resume Codex handoff packets for long-task rollover
- `repo-harness-deploy`: check deploy and private operations configuration without publishing or deploying
- `repo-harness-repair`: repair broken task sync, hook routing, handoff, context, policy, or helpers
- `repo-harness-check`: run verification gates and report release or pre-merge readiness
- `repo-harness-prd`: generate an upper-layer PRD in `plans/prds/`
- `repo-harness-sprint`: plan a sprint backlog in `plans/sprints/` from a PRD or source spec, then expand each row with `$think` before the task-contract flow
- `repo-harness-goal` / `repo-harness:goal`: prepare a Codex/Claude `/goal` prompt from detailed PRD or Sprint artifacts; request those documents before starting when missing
- `repo-harness-gptpro-setup` / `repo-harness:gptpro_setup`: guide `gptpro_browser` ChatGPT Web browser/session setup and `gptpro_mcp` ChatGPT Connector MCP setup without treating GPT Pro as API quota
- `repo-harness-gptpro` / `repo-harness:gptpro`: consult or continue GPT Pro through the local ChatGPT Web browser/session bridge while presenting `gptpro consult/read/continue/open` wording over the underlying `browser-*` engine commands

Internal steps such as `hooks-init`, `docs-init`, and `create-project-dirs` are
not public commands. They stay behind `init`, `scaffold`, `migrate`, and
`upgrade` so users choose intent instead of implementation details.

## Plan Index

Keep A-K as stable scaffold codes, but route them as stack-family handles, not
product prescriptions. Choose by frontend shell, backend/runtime boundary,
deployment target, data authority, and sidecar needs first. Product domains
such as finance, CRM, Web3, healthcare, and commerce are overlays.

Core Plans (A-F), routed as stack families:
- Plan A: Astro-first SSR/content shell. Use Astro for SSR, content, docs,
  marketing, and mostly-static app shells with islands where needed.
- Plan B: Vite 8 client-only app shell. Use Vite + React + TanStack
  Router/Query plus shadcn/Radix-style UI for dense interactive apps and
  internal tools that do not need crawler-visible SSR landing HTML.
- Plan C: TanStack Start Workers webapp. Prefer TanStack Start + Vite +
  Cloudflare Workers when the same React webapp needs public SEO/SSR at `/`
  and authenticated or browser-heavy workspace routes under `/app`. Use
  route-level `ssr: false` for `/app`; Next.js is not a default recommendation.
- Plan D: Shared frontend/backend monorepo. Prefer Bun workspaces with apps,
  packages, shared contracts, a Hono gateway, and optional Turborepo only when
  repo scale needs orchestration.
- Plan E: Cloudflare edge web stack. Prefer Workers for TanStack Start SSR
  webapps, Pages only for static/client-only assets or content shells, and R2,
  KV, Queues, Durable Objects, and Hyperdrive where they fit. Do not default to
  D1; use Postgres/Supabase or SQLite/Turso unless the D1 tradeoff is explicit.
- Plan F: Mobile/realtime companion. Use Expo Router on React Native New
  Architecture, with NativeWind where useful and explicit voice/media/realtime
  boundaries when needed.

Custom Presets (G-K), routed as sidecar/runtime families:
- Plan G: Python research/data/agent sidecar. Use `uv`, FastAPI or Pydantic AI,
  DuckDB/Polars, evals, and artifact storage behind the app gateway.
- Plan H: Go high-concurrency or financial sidecar. Use Go/Gin or narrow Go
  workers for market data, FIX/RFQ, fan-out, infra adapters, and TS-adjacent
  high-concurrency services.
- Plan I: Local-first or lightweight SQL stack. Use SQLite, Turso/libSQL,
  Turso Sync for new local-first sync work, Loro or other sync primitives, and
  explicit replication/ownership contracts.
- Plan J: Rust native/performance sidecar. Use Rust for parsers, indexing,
  sandboxing, native kernels, and low-latency tools when the team can support
  the operational complexity.
- Plan K: Fully custom configuration. Use when the stack cannot be expressed as
  a composition of the families above.

Agent runtimes that need stable Node APIs, long-lived processes, local tools,
or heavier sidecars should default to VPS deployment behind the Hono gateway,
not Cloudflare Workers. Cloudflare remains the preferred web/edge delivery
surface, not the mandatory agent execution environment.

## AI-native scaffold overlay

`repo-harness-scaffold` keeps A-K as the stack-family catalog and uses
`ai_native_profile` as a separate overlay axis. The default profile is `none`,
so generated output stays on the selected family unless the user asks for agentic
runtime behavior. Use an overlay only when the generated app needs agent UI,
streaming protocol, tool boundary, sidecar, shared state, approvals, artifacts,
or observability.

Supported profile IDs live in `assets/initializer-question-pack.v4.json`.
Current stack guidance:

- Use Astro for SSR/content/docs shells and Vite 8 for rich interactive
  surfaces. Prefer a shared monorepo over disconnected frontend/backend repos.
- Use TanStack Start + Vite + Cloudflare Workers when a SaaS webapp needs
  public landing SEO/SSR and a client-heavy workspace in the same product
  surface. Keep `/` SSR/prerender-capable and `/app` client-only.
- Do not scaffold `apps/marketing` plus `apps/web` as the default answer to
  SEO/SSR. Treat a static marketing app as explicit legacy/rollback or content
  scope, not as the normal SaaS webapp split.
- Use React Router Framework Mode or Vike only as fallback evaluations if the
  Start + Workers thin scaffold gate fails. Do not default to Next.js.
- Use Expo Router for mobile and keep React Native New Architecture
  compatibility visible in the scaffold.
- Use assistant-ui or AI SDK UI for chat and generative UI primitives; use
  AG-UI when the frontend and backend need a durable event stream for runs,
  tools, shared state, interrupts, approvals, replay, or multimodal updates.
- Use Bun/Hono as the default app-facing agent gateway. The gateway owns auth,
  policy, run IDs, tool contracts, approval state, streaming, and telemetry
  before any model framework or sidecar runs.
- Prefer Cloudflare for web and edge delivery, but keep agent runtimes on VPS
  when they need Node compatibility, local tools, long-lived workers, or heavier
  sidecars. D1 is opt-in, not the default database.
- Use MCP or narrow HTTP jobs for tools and sidecars. Do not let MCP servers,
  model providers, or agent frameworks become product authority.
- Keep orchestration swappable: AI SDK for simple provider/tool streaming;
  OpenAI Agents SDK, Mastra, LangGraph, Pydantic AI, or a custom runner only
  when the product needs multi-step state, handoffs, memory, evals, approvals,
  or durable execution.
- Prefer Postgres or Supabase for durable app authority. Use SQLite or
  Turso/libSQL for lightweight, local-first, edge, or embedded workloads.
  Treat object storage, queues, Redis, vector stores, ClickHouse,
  Temporal/Inngest/BullMQ/Trigger.dev, and OpenTelemetry as opt-in capability
  boundaries, not mandatory scaffold defaults.

Generated structure overlays currently exist for:

- `runtime-console`: assistant-ui/AG-UI run console, Bun/Hono agent gateway,
  run store, contracts, approvals, artifacts, replay, and telemetry
- `product-copilot`: in-product copilot panel, AG-UI app-domain events, product
  context loaders, business action tools, authorization, and approval policies
- `sidecar-kernel`: Bun/Hono app gateway with Python, Go, or Rust kernels behind
  MCP tools or narrow HTTP jobs
- `collaborative-editor`: editor surface with document contracts, CRDT/sync
  ownership, and user-visible agent action boundaries

Do not turn AI-native overlays into more lettered plans. Do not make A2UI,
specific model providers, vector DBs, workflow engines, tracing vendors, or
sidecar languages mandatory defaults.

Scaffold is not an existing-repo adoption path. If the target already has a
product tree, use `repo-harness-init`, `repo-harness-migrate`,
`repo-harness-upgrade`, or `repo-harness-repair` and preserve the existing app
shape. `create-project-dirs`, `hooks-init`, and `docs-init` remain internal
steps behind public commands, not standalone user-facing scaffold aliases.

## Migration Rules

For legacy repos, migrate old document surfaces before refreshing templates.

Legacy paths include:

- `docs/plan.md`
- `docs/TODO.md`
- `docs/PROGRESS.md`
- `docs/contract.md`
- `docs/review.md`
- `docs/handoff.md`
- `HANDOFF.md`

Use:

- `bun scripts/migrate-workflow-docs.ts --repo <path> --dry-run`
- `bun scripts/migrate-workflow-docs.ts --repo <path> --apply`

Migration defaults:

- preserve user-authored content
- archive uncertain legacy content instead of guessing
- remove repo-local Skill Factory and auto-memory surfaces when present
- archive legacy `docs/PROGRESS.md` content; do not regenerate it as a default workflow surface
- keep `tasks/todos.md` limited to deferred medium/long-term goals, including the tradeoff and revisit trigger
- move hidden contracts and deep findings into topic-scoped `docs/researches/*.md`
- distill repeated corrections into `tasks/lessons.md`
- merge missing `external_tooling` defaults into `.ai/harness/policy.json` without overwriting explicit user values
- keep gstack/gbrain/CodeGraph detection advisory-only; do not auto-install, auto-upgrade, auto-sync, or auto-enable MCP
- let `repo-harness init` bootstrap the required global runtime in one pass:
  CLI install, repo-harness runtime alias sync, user-level hook adapters, Waza
  (`think`, `hunt`, `check`, `health`), Mermaid, brain root persistence, and
  CodeGraph CLI/MCP configuration
- treat Waza as Codex-first: `~/.codex/skills` is the Codex runtime source, `~/.agents/skills` is only skills CLI staging/cache, and updates require stage -> copy to Codex -> `cmp` verification

## Repo-Local Contract

Preserve these semantics:

- `plans/` is the timestamped plan catalog; `.ai/harness/active-plan` selects the active plan, with `.claude/.active-plan` as a legacy fallback during transition
- `plans/plan-*.md` must carry a workflow inventory before implementation: active plan, owning worktree, contract, review, notes, deferred ledger, checks, run snapshots, scope owner, switching rule, and worktree isolation path
- `tasks/todos.md` is the deferred-goal ledger; active execution stays in the plan's `## Task Breakdown`
- `tasks/lessons.md` stores correction-derived rules
- `docs/researches/*.md` stores deep repo findings and hidden contracts by topic
- `tasks/contracts/` and `tasks/reviews/` are completion gates
- `tasks/contracts/*.contract.md` must repeat the workflow inventory and make `allowed_paths` the edit-scope authority
- `tasks/workstreams/` stores durable capability progress
- `docs/CHANGELOG.md` stores release history
- `assets/hooks/` is the installable hook product source; `.ai/hooks/` is a full live runtime only in repos that pin `"hook_source": "repo"`
- user-level `~/.claude/settings.json` and `~/.codex/hooks.json` are the host adapter surfaces; repo-local `.claude/hooks/`, `.claude/settings.json`, and `.codex/hooks.json` are legacy cleanup targets

## Hook Workflow Protocol

When the task mentions hooks, hook workflow, Codex hook detection, or hook-based
automation, treat it as a runtime-harness slice, not a generic config edit.

Map the route first:

1. `assets/hooks/` is the installable source.
2. The active runtime resolves central-first through `repo-harness-hook`; `.ai/hooks/`
   is a full repo-local implementation only when `"hook_source": "repo"` is pinned.
3. User-level `~/.claude/settings.json` and `~/.codex/hooks.json` are adapters
   that dispatch to `repo-harness-hook` or the compatibility `repo-harness hook`
   route.
4. Codex also requires the user-level hook config to be trusted in Codex Settings before it
   executes.
5. Generated `.claude/hooks/`, repo-local `.claude/settings.json`, and repo-local
   `.codex/hooks.json` are legacy cleanup targets; preserve only user-authored
   `custom-*.sh` hooks.

Trace one real event before changing behavior, for example:

`UserPromptSubmit -> adapter -> repo-harness-hook -> prompt-guard.sh -> plan
or advisory output`

or:

`PostToolUse(Edit|Write) -> adapter -> repo-harness-hook ->
post-edit-guard.sh -> architecture drift, brain sync, contract verification,
task handoff`

For Codex hook failures, debug in this order: user-level `~/.codex/hooks.json`,
Codex Settings trust, `repo-harness-hook` resolution, the active target hook
script, then `.ai/harness/events.jsonl` or `.claude/.trace.jsonl` evidence.

Hooks are accelerators and guards. They do not replace `plans/`, `tasks/`,
contracts, reviews, policy, checks, or handoff artifacts. Heavy workflows such as
autoresearch must not silently run as background hook mutations. The retired
`autoresearch-advisory.sh` hook is not part of `.ai/hooks`, user-level adapters,
or installable hook templates. If autoresearch evidence is needed, the agent
runs it explicitly and keeps local run products under ignored `autoresearch/`
when they must remain in the workspace.

Verify hook workflow changes with hook-specific evidence:

- default hook asset parity between `assets/hooks/` and `.ai/hooks/`, with
  no self-host-only hook exclusions
- `bun test tests/hook-runtime.test.ts tests/workflow-contract.test.ts`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `.ai/harness/checks/latest.json`, `.ai/harness/events.jsonl`, or handoff readback

## Output Ownership

This skill may create or update:

- `AGENTS.md`
- `AGENTS.md`
- `.ai/hooks/*`
- `.claude/settings.json`
- `.codex/hooks.json`
- `.claude/templates/*`
- `docs/spec.md`
- `docs/reference-configs/*.md`
- `tasks/todos.md`
- `tasks/lessons.md`
- `docs/researches/*`
- `tasks/contracts/*`
- `tasks/reviews/*`
- `tasks/workstreams/*`
- `deploy/README.md`
- `deploy/sql/*` for ordered deployment SQL files
- `.ai/harness/*`
- helper scripts under `scripts/`

## Verification

When changing the engine, migration path, contract manifest, or self-hosted workflow, run:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bash scripts/migrate-project-template.sh --repo . --dry-run
```

For migration-focused work, also inspect and dry-run legacy doc migration explicitly:

```bash
bun scripts/inspect-project-state.ts --repo . --format text
bun scripts/migrate-workflow-docs.ts --repo . --dry-run
```

## Iteration Notes

- Keep this file short; detailed policy belongs in `docs/reference-configs/`
- Keep stack-specific detail in assets and references, not in this skill body
- If the router changes, update `evals/evals.json`
- If the contract changes, update templates, migration, checks, and tests together
