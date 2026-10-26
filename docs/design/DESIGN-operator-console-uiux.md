# Design Brief: Operator Console UI/UX Redesign

> **Status**: Draft
> **Slug**: operator-console-uiux
> **Owner**: Ancienttwo
> **Date**: 2026-10-26
>
> PRD: [`plans/prds/20261026-2100-operator-console-uiux.prd.md`](../../plans/prds/20261026-2100-operator-console-uiux.prd.md).
> Design system (English repo copy): [`docs/design/operator-console/design-system/`](operator-console/design-system/README.md).
> Page inventory and canvas link: [`docs/design/operator-console/README.md`](operator-console/README.md).
>
> This brief is a draft. Nothing here is confirmed until the Confirmation
> Checklist below is checked by a human. It does not supersede
> `DESIGN-local-human-control-board-v1.md` until then.

## Purpose & Audience

- Page/surface: the localhost `repo-harness operator serve` console, extended from a read-only board into a local management console with 21 designed pages (home, board, task drawer, repositories, worktrees, worktree cleanup session, docs, docs session, Agents, Skills, Hooks, CLI, Bots, architecture modules/layers/sequence/topology, tests, system, tools, settings).
- Primary audience: one maintainer who runs several adopted repositories and several coding agents (Claude Code, Codex, others through OAR) on one machine.
- Job to be done: see in one window what is waiting for them, what each task is doing and which agent owns it; keep the development environment (hooks, skills, CLIs, agents) healthy; read, quote and update `docs/` through an agent, getting the change back as a Draft PR.

## UX Feature Guard

- Requested outcome: the console does exactly three things — manage the development environment, manage development and architecture documents, track progress. Coding stays in the user's own harness.
- Frozen behavior / rules that must not change: Fleet, Dev Activity, ledger and GitHub keep owning column, attention, merge readiness, checks and reviews; the UI never recomputes them. Agent identity comes only from the ledger or a verified runtime binding (no inference from branch names or PR authors). Agent status is observation only. A green check is not merge approval.
- Requested action: two bounded writes only — (1) a docs session edits files inside `docs/` in a new linked worktree, commits and opens a Draft PR; (2) enable/disable agents and their uses in `~/.repo-harness/config.json`. Everything else is a read-only view, an external link, or a copyable command the user runs in a terminal.
- Exact payload acted on: for (1) the quoted citations (doc paragraph ranges, read-only source files) plus the user's instruction text; for (2) the `{runtime, enabled, uses}` changes and `default_docs_runtime`. Exact request bodies are in the PRD "Write API" section.
- Forbidden extras / non-goals: writing code from the console; sending messages to, steering or stopping a coding session; host projection (install, update, profile switch) or registry cleanup from the browser; mobile layout; drag-and-drop dispatch; storing credentials; showing internal implementation names other than OAR (and OAR only on Settings).

### Role-aware User-visible Concept Boundary

- Audience / role for this surface: local human operator; no role split.
- Allowed visible concepts: repository id and health, task title/stage/owner agent, PR number and checks, branch and short SHA, hook routes and profiles, skill names, CLI name/version/login account name, OAR runtime names (Settings only), doc paths and paragraph ranges, docs-session transcript and diff, test files/lanes/results, architecture nodes and edges.
- Required outcome/recovery concepts that must stay visible: source unavailable (which source, which repo, how old the data is), drift with its repair command, "needs login" / "not installed" with the command, Draft PR result or the `gh pr create --draft` fallback command, delivery receipts in the task inbox.
- Backstage-only concepts that must never appear as user-visible: absolute local paths, stderr, environment variables, tokens or emails returned by CLIs, raw tool arguments and terminal output of coding sessions (PRD gap G3), registry internals.
- Role-gated exceptions, or `none`: none.
- Authority for each exception, or `N/A`: N/A.

`UX-operator-console-uiux-N1` derives from the non-goals above: no control that writes to a coding session may appear anywhere.

### Authority & Reuse Map

| Responsibility / datum | Existing authority or reuse target | Decision (reuse / extend / new) | New-surface justification |
|------------------------|------------------------------------|---------------------------------|---------------------------|
| Board columns, attention, stages | `src/core/dev-activity/projection.ts`, `src/effects/dev-activity/collector.ts` | reuse | — |
| Task drawer, evidence, diff | `src/operator-web/Drawer.tsx`, `ItemDrawer.tsx`, `TaskEvidence.tsx`, `TaskDiff.tsx` | extend | add the read-only "Follow up" block and "Tests changed" list |
| Repositories, system, tools pages | `src/operator-web/RepositoriesPage.tsx`, `SystemPage.tsx`, `ToolsPage.tsx` | extend | — |
| Agents / Skills / Hooks | `src/operator-web/SetupPages.tsx`, `src/cli/hook/route-registry.ts` (`ROUTES`) | extend | hook stats need a collector source (PRD gap G16) |
| Architecture views | `src/operator-web/ArchitectureWorkspace.tsx`, `ModuleGraph.tsx`, `.archcontext/model/` | extend | module map with five layers, plus layered/sequence/topology canvases (PRD gaps G11, G22, G27) |
| HTTP routes and write gate | `src/effects/operator/server.ts` | extend | today every non-GET returns 405; the two bounded writes need the POST channel in the PRD |
| Task message to owner | `repo-harness fleet message send` (`src/cli/commands/fleet.ts`) | reuse via Bot | the console shows the inbox read-only; it never sends |
| Docs sessions | none | new | no existing surface edits `docs/` through an agent in an isolated worktree |
| CLI inventory (every CLI on the machine) | none | new | PRD gap G18; read-only probes; uninstall and logout are copyable commands |
| Bots (MCP clients, Slack channels, herdr panes) | `repo-harness mcp doctor --json`, herdr notify plugin, herdr socket | new view | PRD gaps G29–G32; read-only; access changes are commands |
| Tests page | `scripts/select-ci-coverage.ts`, `scripts/test-file-durations.json`, `.ai/harness/runs/` | new view over existing data | PRD "Testing and TDD" section |
| Visual tokens | design system in `docs/design/operator-console/design-system/tokens.json` | new, derived from `repo-harness-page@ffe3ff1` | Kumo semantic names plus contrast fixes |

### Observable & Copy Contract

- Happy/loading/empty states that can actually occur: board with groups; empty column; no docs sessions yet; all tests passing; CLI logged in.
- Invalid/unavailable state: a source banner names the source, repository and age ("GitHub timed out for Ancienttwo/repo-harness-page; PR state is 6 minutes old") and links to System. Unknown agent state shows a hollow dot and the word "unknown".
- Machine-readable output contract: write errors use `{error:{code,message,next_action}}` (PRD "Write API").
- Canonical copy source / sync sites: UI copy is Simplified Chinese; the design-system README "Content" rules are the source.
- Fail-loud rule: stale data is labeled stale, never replaced by an empty list; a failed write shows its reason and never pretends to succeed.

### BDD Acceptance Scenarios

- `UX-operator-console-uiux-P1`: Given a doc paragraph is quoted and Codex is enabled for docs sessions, When the user starts a session with an instruction, Then a new worktree and branch are created, only files under `docs/` change, and the session card offers "Commit and open Draft PR".
- `UX-operator-console-uiux-N1`: Given a task whose owner is a running Claude Code session, When the user opens the task drawer, Then the drawer shows the owner, a read-only task inbox and copyable follow-up commands, and offers no input that sends a message to, steers or stops that session.
- `UX-operator-console-uiux-F1`: Given the GitHub source times out for one repository, When the board loads, Then a source banner names that repository and the data age, affected cards are marked stale, and no card shows a computed "mergeable" state from local data.

## Reference Sources

| Source | Learn | Avoid |
|--------|-------|-------|
| magpie desktop app shell (open source) | grouped sidebar, hairline row lists with "show N more", marketplace card grid | its chat-first home |
| Claude desktop app | greeting home page, centered reading column, docked input | a chat log as the main surface |
| `repo-harness-page@ffe3ff1` (repo-harness.com) | paper/ink/carrot palette, three typefaces, pixel carrot mark, mascots | its contrast failures (listed in the design-system README) |
| GitHub Actions run graph | folder-tab cards for grouped jobs (used for test folders) | — |
| Kumo 2.14.0 (`@cloudflare/kumo`) | component layer and semantic token names | `dark:` prefixes |

## Color

- Palette: paper (light) and ink (dark) neutrals, carrot orange as the only brand color; full token list in `tokens.json`.
- Usage rules: `color-kumo-brand` (carrot-700, white text 6.1:1) for primary buttons; `rh-accent` only for "waiting for you"; Codex blue and Claude terracotta mark identity, never state; architecture canvases use a pure white `rh-diagram-bg` in light theme. Text meets 4.5:1 in both themes.

## Typography

- Typeface(s): Space Grotesk (display, buttons), IBM Plex Sans (body), JetBrains Mono (commands, paths, counts, eyebrows).
- Scale / weights: display 28px/600, title 18px/600, heading 15px/600, reading 16px/1.65, body 14px, small 13px, caption 12px, code 12.5px.
- Language-specific notes: CJK fallback PingFang SC, Hiragino Sans GB, Microsoft YaHei; uppercase mono eyebrows only for English or protocol words.

## Layout

- Grid / breakpoints: sidebar (248–272px, collapsible to a 64px icon rail; architecture pages open collapsed) plus main area up to 1152px; reading column 672px; right inspector 300–360px. Desktop only (no mobile layout).
- Spacing scale: 4, 8, 12, 16, 24, 32, 40, 48px.
- Key components and hierarchy: NavRail with a prominent repository switcher under the logo; ListGroup rows; SegmentedTabs; StatusBadge; SourceBanner; CommandCopy; MarketCard; FolderCard; DiagramCanvas; Conversation; AgentRow; HookRouteTable. Each has a guideline file in `design-system/components/`.

## Motion

- Trigger -> effect pairs: press -> 1px down; clickable card hover -> 2px up; switcher open -> orange border and 3px tint ring; sidebar toggle -> rail and full width swap without animation; copy -> "copied" in place for about 2s.
- Duration / easing: 120 / 180 / 280ms, `cubic-bezier(0.22, 0.61, 0.36, 1)`, no bounce.
- What must stay static: status dots, counts and data rows (no animated numbers); near-zero motion under `prefers-reduced-motion`.

## Anti-patterns

- A button that looks like it runs a command the console cannot run; use CommandCopy.
- Gray solid dots standing in for unknown state.
- An empty list shown instead of a failed source.
- Any input that writes to a coding session.
- Third-party brand logos for tools or CLIs; use initial tiles.
- More than one pixel mascot per screen, or a mascot that carries information not also in text.
- A second repository switcher in page headers.

## Confirmation Checklist

- [ ] Value proposition is clear
- [ ] Primary reference is decided
- [ ] Color is accurate to the reference
- [ ] Anti-pattern / don't list is explicit
- [ ] Motion spec is explicit
- [ ] Product rules/non-goals are frozen; instruction and payload are separate
- [ ] Existing component/domain authorities have exact reuse paths; every new surface is justified
- [ ] Positive, negative, and authority-failure Given/When/Then scenarios are explicit and fail loudly
- [ ] Role-aware visible/backstage-only concept boundary is explicit; `UX-operator-console-uiux-N1` matches a backstage-only or non-goal concept

## Preview Attachment

- Preview path/link: the design canvas in Claude (21 artboards, light and dark themes), listed with every page in [`operator-console/README.md`](operator-console/README.md). The link is private until shared from the canvas.
