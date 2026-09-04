# Plan: Local Human Control Board v1

> **Status**: Archived
> **Created**: 20260824-0103
> **Slug**: local-human-control-board-v1
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Typed operator API, React browser states, desktop/mobile acceptance, package smoke, and root required checks
> **Rollback Surface**: Delete or revert the isolated codex/local-human-control-board-v1 branch; no data migration or remote deployment exists
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md`
> **Task Review**: `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260824-0103-local-human-control-board-v1.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260824-0103-local-human-control-board-v1.md`
- Sprint contract: `tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md`
- Sprint review: `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md`
- Implementation notes: `tasks/notes/20260824-0103-local-human-control-board-v1.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260824-0103-local-human-control-board-v1.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260824-0103-local-human-control-board-v1.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md`
- Review file: `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md`
- Implementation notes file: `tasks/notes/20260824-0103-local-human-control-board-v1.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260824-0103-local-human-control-board-v1.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Delete or revert the isolated codex/local-human-control-board-v1 branch; no data migration or remote deployment exists
- **Verification boundary**: Typed operator API, React browser states, desktop/mobile acceptance, package smoke, and root required checks
- **Review/acceptance boundary**: `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260824-0103-local-human-control-board-v1.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md`, `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md`, and `tasks/notes/20260824-0103-local-human-control-board-v1.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Delete or revert the isolated codex/local-human-control-board-v1 branch; no data migration or remote deployment exists

## Captured Planning Output

# Local Human Control Board v1

## Goal

Ship one reviewable, localhost-only, read-only Human Control Board that translates the `repo-harness-page` warm-paper design system into an operator dashboard. The slice must prove the browser boundary, the Fleet read-model reuse, the responsive information architecture, and the packaged runtime path without adding workflow mutations or a second source of truth.

Primary design authority: `docs/design/DESIGN-local-human-control-board-v1.md`.
Primary visual reference: private repo `Ancienttwo/repo-harness-page` at commit `ffe3ff1b14284e5712b0b0f82534e33c4fabfe6b`.

## Success Criteria

- `repo-harness operator serve` binds only to loopback, prints one local URL, serves packaged static assets, and shuts down cleanly on SIGINT/SIGTERM.
- `GET /healthz` reports process health without collecting Fleet state.
- `GET /api/v1/fleet/snapshot` calls the canonical `collectFleetBoard()` effect in-process and returns a versioned browser-safe projection that contains no `repo_root`, stderr, stack, or environment values.
- The React UI renders loading, stable, empty, repo-local degraded, changed-during-read, stale-after-refresh-failure, and fatal API failure states.
- The desktop view contains Fleet summary, Attention Inbox, five authoritative columns, task cards, and a detail drawer. Mobile uses one selected column at a time with the same data and no hidden recovery/error semantics.
- The UI reuses the exact reference palette, typography, spacing, radii, focus ring, and 120/180/280ms motion tokens while avoiding the reference landing-page hero/CTA/card-wall composition.
- Scenario IDs `UX-local-human-control-board-v1-P1`, `UX-local-human-control-board-v1-N1`, and `UX-local-human-control-board-v1-F1` appear unchanged in tests and review evidence.
- Typecheck, focused unit/API/UI tests, browser screenshot checks at desktop/mobile, package build, tarball install smoke, and all repository required checks pass.

## P1 Map

### System boundary

- Domain authority: `src/core/fleet/board.ts` defines protocol, cards, columns, attention, repository status and error semantics.
- Observation authority: `src/effects/fleet/board.ts` reads the registered-repo registry, sprint/Lease/publication/provider/feedback/inbox facts and isolates repo-local failures.
- Current human entrypoint: `src/cli/commands/fleet.ts#buildFleetCommand` exposes `fleet board --json` and `fleet watch --format jsonl`.
- CLI composition: `src/cli/index.ts` registers command builders.
- Existing HTTP precedent: `src/cli/mcp/transports/http.ts` owns MCP transport only; operator HTTP must be a sibling surface and must not alter MCP semantics.
- Packaging authority: `package.json#files`, `scripts`, and `prepack` determine what an installed npm package can serve.
- UX authority: `docs/design/DESIGN-local-human-control-board-v1.md`; the reference repo supplies design tokens but not dashboard layout or product semantics.
- Verification authority: focused tests plus root `AGENTS.md` required checks and package/tarball smoke.

The current relevant implementation is a single Bun/TypeScript package. The three Fleet authority files total 1,678 lines; the repository has 537 source/test files. The new browser boundary is independently meaningful, but it does not justify converting the repository into a monorepo or adding a general UI platform.

### Strong and weak dependencies

- Strong: operator API imports `collectFleetBoard()` and maps `FleetBoardSnapshotV1` deterministically.
- Strong: browser components consume only `OperatorFleetSnapshotV1` types and never import filesystem/effect code.
- Strong: packaging builds the Web app before npm packing and the server resolves only packaged assets.
- Weak: visual tokens are source-cited from `repo-harness-page`; the implementation owns a copied, narrowed operator token file so the private repo is never a runtime/build dependency.
- Out of scope: mutation/action routes, Agent spawning, plan approval, provider merge, Cloudflare, auth/RBAC, remote MCP changes, live push, background daemon, database/cache, offline support.

## P2 Concrete Trace

1. Operator runs `repo-harness operator serve --port 4318`.
2. `src/cli/commands/operator.ts` validates an integer port and fixed loopback host, then calls the operator server effect. Non-loopback values are rejected before listen.
3. Browser loads the bundled `index.html` and React entrypoint from the same origin.
4. Initial load or explicit Refresh calls `GET /api/v1/fleet/snapshot`.
5. The route calls `collectFleetBoard({ env, max_concurrency, timeout_ms })`; registry and Fleet semantics stay in the existing effect.
6. A pure projection removes `repo_root`, preserves protocol/sequence/observed_at/authorization revision/card facts, and returns `OperatorFleetSnapshotV1`.
7. React stores only the last server response and UI selection. Summary, columns, attention list and drawer are presentational projections of server fields; no domain status is inferred from labels, prose, branch names or colors.
8. A repo-local error remains a degraded repository row with its typed safe message. A whole-request failure returns non-2xx; the UI shows what failed, where, the diagnostic command, and Retry. If an earlier snapshot exists it remains visibly stale.
9. The visible side effect is browser rendering only. No repo, registry, Lease, plan, contract, publication, feedback or inbox file is written.

Async boundaries are HTTP request, Fleet collection, provider observations inside the existing bounded collector, and React request state. Manual refresh is single-flight: a second click is disabled while the current request is active. No polling loop is introduced.

## P3 Decision

The existing Fleet JSON contracts were deliberately created as a stable input for a dumb UI, so the smallest coherent slice is a thin same-origin server plus one browser-safe DTO and a React renderer. Calling the CLI as a subprocess would duplicate lifecycle/error handling and obscure typed failures; importing `collectFleetBoard()` preserves ownership. Returning raw `FleetBoardSnapshotV1` would leak local absolute paths into a boundary intended to become remotely accessible later, so a deterministic redaction projection is justified now.

React + Vite is selected because the board has coordinated selection, drawer, responsive column navigation and multiple observable states. Plain global CSS tokens plus component-scoped CSS is the single styling strategy. Astro is retained only as the visual reference implementation; it is not introduced into the product package.

At 10x repo/card scale, provider observation latency is the first likely limit. This slice preserves the existing concurrency/deadline controls, performs one request at a time per browser, and does not add polling. Caching, streaming and daemonization remain deferred until real observation data requires them.

Rejected alternatives:

- Raw `fleet board --json` subprocess from the server: rejects typed in-process ownership and creates process/error duplication.
- Embed the UI into MCP HTTP: mixes human and Agent transport/security surfaces.
- Static mock-only prototype: cannot validate the authoritative data and failure path.
- Full guarded actions in v1: expands authorization, fencing, audit and recovery beyond the UI/design boundary.
- Import `repo-harness-page` as a dependency: private external runtime authority and build fragility.

## Detailed Design

### Files and ownership

| Surface | Planned paths | Responsibility |
| --- | --- | --- |
| Design authority | `docs/design/DESIGN-local-human-control-board-v1.md` | Frozen UI behavior, exact tokens, BDD IDs and non-goals |
| Browser-safe core contract | `src/core/operator/**` | Versioned DTO and pure redaction/projection |
| Operator runtime | `src/effects/operator/**`, `src/cli/commands/operator.ts`, `src/cli/index.ts` | Loopback server, API/static routes, CLI lifecycle |
| Web application | `src/operator-web/**`, `vite.operator.config.ts` | React app, exact reference tokens, components and responsive layout |
| Package/build | `package.json`, `bun.lock`, `tsconfig.json`, package smoke scripts when required | React/Vite dependencies, bundle and npm inclusion |
| Tests/fixtures | `tests/core/operator/**`, `tests/effects/operator/**`, `tests/cli/operator-serve.test.ts`, `tests/operator-web/**`, `tests/fixtures/operator/**` | Pure contract, server integration, UI state and BDD coverage |
| Docs/workflow | `README*.md` only where CLI discovery requires it; active plan/contract/review/notes/current/workstream artifacts | User entrypoint and workflow evidence |

### UI direction

- Visual thesis: a calm warm-paper technical command center, with an ink navigation rail and carrot used only for focus/attention/action.
- Signature: mono authority labels and IDs over cream surfaces, one dark ink structural band, subtle 48px grid wash, small technical radii and warm shadows.
- Interaction thesis: select a task to open a persistent drawer in 180ms; hover lifts 2px; press moves 1px; refresh updates timestamp without layout movement; reduced-motion removes transitions.
- Desktop: 248px rail, fluid board, 360px drawer. The five columns remain in authoritative order.
- Mobile: collapsed rail, summary/attention retained, a 40px column selector shows one column at a time, drawer becomes a full-height sheet.
- Accessibility: semantic landmarks/headings/buttons, keyboard task selection and drawer close, visible carrot focus, 40px targets, AA contrast, non-color status labels, `aria-live` for load/error transitions.

### Transport contract

- `GET /healthz`: `{ ok: true, service: "repo-harness-operator", protocol: 1 }`.
- `GET /api/v1/fleet/snapshot`: `OperatorFleetSnapshotV1` on success.
- API failures: `{ error: { code, message, next_action } }` with non-2xx; no stack or raw cause.
- Static fallback serves `index.html` only for browser navigation and never shadows `/api/*` or `/healthz`.
- Response headers: `Cache-Control: no-store` for API and HTML; static hashed assets may be immutable; deny framing and sniffing; no CORS because same-origin only.

## Dispatch Plan

After plan projection creates the contract worktree, dispatch two workers with non-overlapping ownership and keep root-owned integration files serialized:

1. Backend worker owns `src/core/operator/**`, `src/effects/operator/**`, `src/cli/commands/operator.ts`, and their focused tests. It must not edit package/build/frontend/root CLI composition files.
2. Frontend worker owns `src/operator-web/**` and `tests/operator-web/**`. It must implement the confirmed design brief against typed fixtures and must not edit backend/domain/package files.
3. Root owns `src/cli/index.ts`, `package.json`, `bun.lock`, `tsconfig.json`, `vite.operator.config.ts`, packaging/docs/workflow artifacts, integration, and conflict resolution.
4. A read-only gatekeeper reviews the integrated diff, runs the real verification commands, and performs desktop/mobile browser acceptance against the BDD IDs before ship recommendation.

Every worker is told it is not alone in the worktree, must preserve concurrent edits, and must fail closed on absent requirements. The frontend may begin against a typed fixture while backend implements the DTO; root reconciles the exact interface before integration tests.

## Verification

- `bun run check:type`
- `bun test tests/core/operator tests/effects/operator tests/cli/operator-serve.test.ts tests/operator-web --timeout 60000`
- `bun run build:operator-web`
- targeted `bun test tests/effects/fleet-board.test.ts --timeout 60000` to preserve collector/concurrency behavior
- desktop browser at 1440x1000 and mobile browser at 390x844: loading, P1, N1, F1, keyboard/focus, overflow, drawer, reduced-motion; save screenshots as runtime evidence
- `bun test --timeout 60000`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`
- `bun run check:release` or the repository's package/tarball smoke path after the operator bundle is included
- `repo-harness run verify-contract --contract <generated-contract> --strict`

## Risk and Failure Handling

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Browser DTO drifts from Fleet authority | UI lies or silently omits new fields | pure typed projection, exact contract tests, protocol field, no client domain inference |
| Absolute paths or raw causes leak | local information crosses browser boundary | absence assertions on JSON serialization and fatal errors |
| Bundle works in source repo but not npm install | shipped command cannot serve assets | package files/prepack update plus tarball clean-install smoke |
| Fleet observation is slow | browser appears hung | existing bounded deadline, explicit loading, manual single-flight refresh, visible failure |
| Dashboard copies marketing layout | low information density | confirmed brief, source-token reuse only, screenshot review against operator hierarchy |
| Parallel workers conflict | lost edits or inconsistent DTO | disjoint ownership; root alone edits integration/build files and reconciles contract |

## Rollback

Before merge, delete the isolated contract worktree/branch. After merge but before release, revert the single Human Control Board merge unit, including dependencies and bundled assets. No data migration, persistent runtime state, remote deployment or compatibility window exists.

## Task Breakdown

- [x] Establish the versioned browser-safe operator snapshot contract and focused redaction/BDD tests.
- [x] Implement the loopback-only operator server, health/snapshot/static routes, CLI lifecycle, and server integration tests.
- [x] Implement the React/Vite operator UI from the confirmed reference tokens with all required states, responsive layouts, keyboard/focus behavior, and UI tests.
- [x] Integrate CLI registration, build/prepack/package surfaces, README discovery, and clean-install asset resolution.
- [x] Run focused, browser desktop/mobile, full repository, package, workflow and independent review gates; record evidence and close the work package.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
