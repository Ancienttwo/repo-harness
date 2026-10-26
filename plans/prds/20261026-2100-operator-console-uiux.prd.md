# PRD: Operator Console UI/UX Redesign

> **Status**: Draft
> **Slug**: operator-console-uiux
> **Owner**: Ancienttwo
> **Date**: 2026-10-26
> **Source of truth while in review**: the shared PRD document in Claude (Chinese). This file is the English repo copy; `docs/design/DESIGN-operator-console-uiux.md` holds the design brief.

## Background and Goals

This proposal grows the operator console from a read-only board into a local management console. It does only three things: manage the dev environment, manage development and architecture docs, and track progress. Writing code still happens in the user's own harness. The only work the console hands to an agent is writing docs, and changes come back as a Draft PR. Agents connect through OAR. The design is on the [design canvas](https://claude.ai/code/artifact/8d9f19a4-d9a0-4d19-88bc-af5eb110d812).

- **Current state**: `src/operator-web` is about 4.1k lines of React + Kumo, with 8 pages. `operator serve` listens only on the loopback address. Any method other than GET/HEAD returns 405, so the console has no writes today. Sending a message to an owner has only a CLI entry point, `fleet message send`, which the Bot calls.
- **Reference**: the desktop app shell of the open-source project magpie. We borrow three things: a sidebar grouped by function, hairline-separated row lists with a "show the other N" collapse, and a marketplace-style card grid.
- **Goal 1 · Dev environment**: see the hook, skill, MCP, and profile status of each host (Claude Code, Codex) in one place. When there is drift, give a fix command for the user to run in the terminal.
- **Goal 2 · Docs**: read development and architecture docs under docs/ in the APP, cite passages, and hand them to an agent to edit. Changes come back as a Draft PR. Re-home each kind of doc and state into two levels: global and repo.
- **Goal 3 · Architecture**: render three kinds of architecture diagrams (layers, sequence, topology) on a canvas. Selecting an element shows its code size, dependency edges, and Remarks.
- **Goal 4 · Tests**: group the test scripts under tests/ by module, and show run commands, recent results, and TDD red/green status.
- **Goal 5 · Progress**: one person, in one window, sees which work is waiting on them, what stage each task is in, and which agent is working on it. Follow-up goes back to the user's own harness, or to the Bot.
- **Non-goals**: no writing code in the console, and no sending messages to or stopping coding sessions; no mobile version; no drag-and-drop dispatch; no recomputing column, attention, or merge readiness in the UI; no showing internal implementation names other than OAR.

## Design Principle: AI Writes, Humans Read Diagrams

The console is designed for one person or a small team. Agents write code and docs. Humans step in at only three gates, and judge mainly by reading diagrams. We skip the traditional SOP pieces: review meetings, long design docs, and hand-drawn architecture diagrams. Rules that can be checked automatically go to CI; humans look only at exceptions.

| Principle | What the console does | Basis |
| --- | --- | --- |
| Humans read intent, not every line | The board and drawer show goals, non-goals, acceptance criteria, and change impact first; the diff is collapsed by default | Anthropic merges 30,000+ changes a day; humans read the intent of a change, not every line ([Redesigning source control](https://anthropic.com/engineering/redesigning-source-control), 2026-10-13) |
| Agents verify their own work and hand over evidence | Every task needs a check that can run: tests, build, screenshot comparison; pages show evidence, not claims of "done" | [Claude Code best practices](https://code.claude.com/docs/en/best-practices): give Claude a check it can run, and have it show evidence instead of claiming success |
| Automated checks allocate human attention | Violations, failures, and high-risk changes are marked red and pinned to the top; low-risk changes are only counted | [2026 Agentic Coding Trends Report](https://claude.com/resources/guides/2026-agentic-coding-trends-report/priorities-for-the-year-ahead): use automated review to direct human attention to what matters most; the repo's Review by risk tiers |
| Diagrams first, text second | Architecture, tests, and progress all lead with a diagram: one base map plus switchable layers; text goes into hovers and drawers | Humans read diagrams faster and more accurately than text; repo UI rule: let the layout explain |
| Second opinions use fresh context | The agent that wrote the work does not review it; review uses a fresh-context subagent that reports only gaps affecting correctness | Claude Code best practices: adversarial review; the planner, generator, and evaluator roles in [Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) (2026-03-24) |
| Process scales with risk | Changes you can describe in one sentence get no plan; medium risk gets one fresh-context review; high risk adds cross-model review | Claude Code best practices: skip the plan for a diff you can describe in one sentence; Review by risk in the repo's `agentic-development-flow.md` |
| Docs are a by-product | The agent drafts architecture model updates and decision records in the same PR; humans confirm intent and do not write them by hand | Repo rule: branches that change responsibilities update the model per `repo-harness-architecture` |

There are only three human gates:

1. **Set intent**: goals, non-goals, acceptance criteria.
2. **Review exceptions**: violations, failures, and high-risk changes flagged by automated checks.
3. **Guard hard boundaries**: publishing to main, deletion, credentials and permissions, release and production (the four hard boundaries in `CLAUDE.md`).

Traditional steps we do not do: architecture review meetings, a long design doc per feature, hand-drawn architecture diagrams, line-by-line code review, production-readiness reviews for local tools.

## Current State of the Project

At v0.24.3 (e551f3e, 2026-10-26) the console is a purely read-only board: 8 pages, 17 GET routes, zero writes. The session binding, doc reading, and writable agent host that this proposal depends on were all deleted in the last month and must be rebuilt. The architecture model, setup check, Dev Activity, and the OAR dependency can be reused as is. The table below lists facts from reading source code, plan docs, and commit history. Nothing was run.

| Area | Current state | Impact on the proposal |
| --- | --- | --- |
| Write boundary | #482 on 2026-10-04 removed the only write (sending a message to the owner); other methods return 405; `operator-write-boundary.test.ts` asserts zero write routes | The two writes first need changes to I1, I2, I9 and this set of tests; see "Write API" |
| Server | `node:http`, bound to 127.0.0.1:4318; Host is matched exactly, Origin is checked only if present, `/api/` checks `Sec-Fetch-Site`; no token, CSRF, or rate limiting | The POST channel needs a token, Content-Type, and a body size limit |
| Collection | Dev Activity runs git and `gh pr list --author @me` every 60 s; setup check every 10 minutes; the Fleet snapshot spawns a subprocess per request; Notify calls herdr per request | All new data goes through a background collector (N1); GET only reads the cache |
| Refresh | The browser polls every 30 s, backs off to 60 s and 120 s on failure, and pauses when the tab is hidden; there is no SSE anywhere in the repo; revamp plan §11 #12 (10-06) decided "no SSE for now" | Doc sessions start with cursor polling |
| Frontend | 23 `.tsx` files (4,092 lines), 8 nav pages; only Badge, Banner, Button, Empty, Loader from Kumo are used; Chinese and English, with zh type-checked against en keys | New pages follow the Kumo and i18n constraints |
| Tasks and agents | `owner_bot` and the ledger were deleted in #785 (10-16); board cards have no agent field; runtime observations are not bound to tasks, and every pane is unclaimed | "Who is working on it" needs a rebuilt verified binding (G2) |
| Messages | `fleet message send` writes a file inbox: `<git-common-dir>/repo-harness/task-inbox/v2/…`; the repository detail page shows task activity read-only | Sending messages goes to the Bot; the console is read-only |
| OAR | Pinned at 0.62.1, latest is 0.71.0, session and event interfaces unchanged; in `src/` only the review host uses OAR; the coding host was deleted in #932 (10-24) | The doc session host must be built new, modeled on the deleted coding host |
| Isolation | The review host uses macOS `sandbox-exec` and opens only the output directory; every OAR runtime skips confirmations by default and has no sandbox | Doc sessions support only macOS in the first version |
| Architecture | The model has 84 nodes (28 capabilities, 56 components), 277 relationships, 38 flows; archctx generates Mermaid, LikeC4, Structurizr, and 38 sequence diagrams; the console already has a module list and a one-hop dependency graph | Base maps are generated straight from the model; code size and dependency counts must be computed separately |
| Docs | `docs/` has 228 files, including 2.4 MB of markdown; #925 (10-24) removed the old doc reader | The docs page is rebuilt, overturning the revamp plan's "show paths only" convention |
| Tests | 302 test files, about 3,700 test cases; CI does not output per-case results | See "Test and TDD Management" |
| MCP | Guarded writes with sha256 preconditions, managed worktrees, and a read-only reader can be reused; but the generic `write_file` can write to `.git/` (reproduced), and `paths.ts` checks scope only by logical path | Reuse must re-check scope by realpath; the security issue gets its own issue |

## Information Architecture

_Diagram: sidebar groups — Home plus 4 groups, 15 pages; see the design brief._

The sidebar matches the design canvas: three groups (Work, Integrations, Observe), Settings at the bottom, and Home at the top. The 4 pages marked with the accent color start bounded writes: Home and Docs start doc sessions, the Doc Session page commits changes, and Settings changes local config. For scope, see "Write and Permission Boundaries". The task drawer is read-only. For follow-up it gives commands to go back to the harness or hand off to the Bot.

## Page Requirements

Each page only projects existing authorities. Pages whose write column says "None" write nothing. All 8 pages of the current console and the task drawer are kept and reworked, and 6 new pages are added.

| Page | Design file | Current state | Core content | Data source | Writes |
| --- | --- | --- | --- | --- | --- |
| Home | Home | New | Waiting on you, Continue (task status and doc sessions), stage counts, start a doc session | Dev Activity, doc session records | Start a doc session |
| Board | Main | Exists, `Board.tsx` | Waiting on you / In progress / Shipped today; stage filter; a banner when some sources are unavailable | Dev Activity snapshot: git and `gh pr list`, one round every 60 s | None |
| Task drawer | Task | Exists, `ItemDrawer.tsx`, to be extended | Stage, copyable id, checks and reviews, merge command, execution status (read-only), follow-up commands | Dev Activity, task session records, runtime observations | None |
| Repositories | Repositories | Exists, `RepositoriesPage.tsx` and `RepositoryWorkspace.tsx` | Repository list, stale registrations and the `fleet prune` command; the detail page has three tabs: Planning, Organization, Delivery | registry, Fleet snapshot, repository snapshot | None |
| Docs | Docs | New; the old reader was deleted in #925 | docs/ tree, rendered body, cite passages, pick an agent, start a session | Repository files, read-only (G7) | Start a doc session |
| Doc session | DocsSession | New | Toggle diff and reading view, session transcript, change cards, commit and open Draft PR, discard | Doc session records and worktree | Writes within the session; see "Write API" |
| Agents | Agents | Exists, `SetupPages.tsx` | Per-host hook and skill projection status and drift, and the command for each profile | `setup check`, one round every 10 minutes | None, commands only |
| Skills | Skills | Exists, `SetupPages.tsx` | Installed and recommended skills, switchable by host | `setup check`, `assets/skill-commands/manifest.json` | None |
| Hooks | Hooks | Exists, `SetupPages.tsx` | Per-host hook routes, call counts, and recent denials (G16) | `setup check`, hook event log | None |
| CLI | CLI | New | Versions and signed-in accounts of the CLIs used for development (G18) | Background read-only probes | None |
| Architecture | ArchLayers, ArchSequence, ArchTopology | Module page exists, `ArchitectureWorkspace.tsx`; the three base maps are new | One base map plus layers: today's changes, violations and drift, PR impact, test coverage, decisions | `.archcontext/model`, 3 architecture GET routes, collector | None |
| Tests | Tests | New | See "Test and TDD Management" | collector: scan tests/, CI results, verification records | None |
| System | System | Exists, `SystemPage.tsx`, 4 cards | Collector status and freshness, Notify plugin, boundary notes, runtime summary | Collector health: three source types (git, github, runtime) | None |
| Tools | Tools | Exists, `ToolsPage.tsx` | Marketplace cards: local tools and recommended resources, links only | `assets/tool-catalog.v1.json` | None |
| Settings · Agent integration | Settings | New | OAR runtime list, install probe, enable, uses, default agent | OAR registry, background install probe | `~/.repo-harness/config.json` |

## Write and Permission Boundaries

The console has no writes today: the server returns 405 for any method other than GET/HEAD. This proposal adds only two bounded writes, which requires revising the design brief and the I1–I9 invariants. Each write has a fixed target, a fixed scope, and a visible failure state.

| Write | Target | Scope | Not allowed |
| --- | --- | --- | --- |
| Doc session edits files, commits, opens a Draft PR | A newly created linked worktree and branch | Only `docs/` is writable, source is read-only; can send follow-up instructions to this session's agent and stop the current turn | Writing to main, merging, editing files outside the writable scope |
| Enable / disable an agent | `~/.repo-harness/config.json` | Local config | Storing credentials; editing the host's `~/.claude` or `~/.codex` |

- Sending a message to a task owner goes to the Bot. The existing entry point is the CLI `repo-harness fleet message send`, which requires admission and claim context. The console shows task inbox messages and delivery receipts read-only.
- Coding sessions are not connected to the console: no sending messages to, stopping, or injecting content into sessions in the user's harness.
- Host projection (install, update, profile switching) and registry cleanup still only get commands, which the user runs in the terminal.
- Every write request must pass the Origin / Sec-Fetch-Site check and a CSRF token. Failures show the specific reason in the UI and never pretend to succeed.
- Browser payloads still contain no absolute paths, stderr, or environment variables. Doc session conversation text is new visible content and conflicts with the existing N4 (no terminal text, prompts, or tool arguments shown); see gap G3.

## Write API

Both writes share one POST channel. Each request first passes the same-origin and token checks, then schema, idempotency, lock, and precondition checks, and is finally executed by the effect shared with the CLI. If the audit cannot be written, the write is refused.

| Endpoint | Request body | Success | Failure codes |
| --- | --- | --- | --- |
| `POST /api/v1/settings/agents` | `request_id`, `expected_revision`, `changes[{runtime, enabled, uses}]`, `default_docs_runtime` | 200, the new `config_revision` and the keys actually changed | 409 `revision_conflict`; 422 `use_not_supported` (review accepts only claude, codex); 503 `busy` |
| `POST /api/v1/repositories/{id}/docs-sessions` | `request_id`, `runtime`, `citations[]`, `instruction` | 201, `session_id`, branch name, worktree directory name | 409 `citation_stale`; 422 `runtime_not_enabled`; 501 `platform_unsupported`; 503 `busy` |
| `POST /api/v1/docs-sessions/{sid}/messages` | `request_id`, `text`, `when: after_turn \| now` | 202, `landed: prompted \| queued \| steered` | 409 `steer_unsupported`, not silently changed to queued; 409 `session_closed` |
| `POST /api/v1/docs-sessions/{sid}/stop` | `request_id` | 202, the current turn ends as `aborted`, the session is kept | 409 `no_active_turn` |
| `POST /api/v1/docs-sessions/{sid}/commit` | `request_id`, `expected_head`, `expected_diff_sha256`, `message` | 200, commit and Draft PR link, or the `gh pr create --draft` command | 409 `diff_changed`; 422 `path_outside_scope` |
| `POST /api/v1/docs-sessions/{sid}/discard` | `request_id`, `expected_head` | 200, worktree and local branch deleted | 409 `branch_pushed`; a pushed branch only gets a command |

Check order. If any step fails, nothing further runs:

1. The route must be in `OPERATOR_ROUTES` and marked `write:true`. The dispatcher allows POST only for these routes; other methods still return 405.
2. Host matches exactly (existing, 421).
3. Origin must be present and equal to this service (POST only; GET keeps "check only if present").
4. `Sec-Fetch-Site` must be `same-origin`.
5. `Content-Type` must be `application/json`, the body is at most 64 KiB, and it is read against a deadline.
6. `X-Operator-Write-Token` is compared in constant time with the token issued by `GET /api/v1/write-token`. The token is regenerated on every serve start, and cross-site pages cannot read it.
7. The body is parsed with a closed decoder; unknown fields are rejected outright (`operator.md` §3.1: one schema, one decoder).
8. `request_id` is a UUID. Results are stored by it, and duplicate requests return the stored result. Requests with an unknown result are not replayed (`references/bot-control.md`).
9. Lock per target: one lock for the config file, one per doc session, one per repository for session creation. Reuse `exclusive-directory-lock.ts`.
10. Check preconditions: config revision, worktree HEAD, and the diff hash the user saw. A mismatch returns 409.
11. Write the intent audit first, then execute, then write the result audit. Config writes are recorded in `~/.repo-harness/operator/audit.jsonl`. Doc sessions are recorded in the repository's evidence ledger through `appendEvidenceEvent`, which brings its own redaction and idempotency key.
12. All errors use `{error:{code,message,next_action}}`, no longer a bare `{code}`.

- **CLI parity**: every write gets a CLI command first; HTTP is only a thin wrapper, sharing the same effect and builder (I7). The Bot uses the CLI, the console uses HTTP, and the results are the same.
- **Constraints to change**: revamp plan I1, I2, I9; the Kumo plan non-goal "no writes"; `operator.md` §3.1 items 1 and 6; the read-only note in the README.
- **Tests to change**: the write route list in `operator-write-boundary.test.ts` changes from an empty array to the 6 above, and the method scan adds POST. The 405 cases in `operator-serve.test.ts` and the "no forms" assertions in the UI tests are rewritten one by one, with the reason for each explained in the PR.
- **Design brief gate**: `ux-feature-guard` requires a confirmed `docs/design/DESIGN-<slug>.md` before frontend work starts.

## Technology Choice

Conclusion: keep React. The pressure points this time are data sources and the write boundary, not rendering performance. Switching frameworks would mean rewriting the existing 4.1k lines along with the Kumo component library.

| Dimension | React (current) | Solid 2.0 |
| --- | --- | --- |
| Release status | Stable | Still RC: latest is 2.0.0-rc.9, 2026-09-18, no stable release ([releases](https://github.com/solidjs/solid/releases)) |
| Existing code | `src/operator-web` has 23 .tsx files, already wired to Vite, Tailwind v4, and tests | Full rewrite |
| Component library | `@cloudflare/kumo` is a React component library; the Kumo plan is approved | No Kumo; build our own or switch libraries |
| OAR integration | `@botiverse/oar/browser` and `/observe` have only pure reducers and types, no network client; the server sends records to the browser and the frontend folds them, which works for both | Same as left |
| Streaming conversation updates | Relies on bucketed rendering, virtual lists, `useSyncExternalStore` | Fine-grained reactivity fits naturally; this is its only clear advantage |
| Canvas (architecture diagrams) | `@xyflow/react` 12.12 + `@dagrejs/dagre` 3.1 (both MIT) are usable but need separate approval under the dependency rules; elkjs is EPL-2.0 or GPL-3.0 and is excluded | Few library options |

- Trigger for re-evaluation: the doc session page shows measurable rendering lag on real data, and neither bucketing nor virtual lists fixes it.
- This follows the repo rule: prefer installed dependencies, and do not add layers for pressure we have not observed.

## Gap List

The design depends on 22 backend or data capabilities. Without the 4 P0 items, the matching pages cannot ship. The "Current state" column lists facts from reading source and docs, not run results.

| # | Priority | Gap | Current state | What to add | Pages affected |
| --- | --- | --- | --- | --- | --- |
| G1 | P0 | Write API | Zero write routes since #482 (10-04); other methods return 405 | Per the "Write API" section: POST allowlist, Origin and token, idempotency, per-target locks, audit before execute | Home, Docs, Doc session, Settings |
| G2 | P1 | Task execution status | `owner_bot` and the ledger were deleted in #785; runtime observations are not bound to tasks, and every pane is unclaimed | A background collector verifies the binding hash, `native-session.json`, process identity, and `closed.json`; the agent is shown only if all pass; no conversation shown | Home, Board, Task drawer |
| G3 | P0 | Visible scope of doc session conversation | The Kumo plan's N4 and the runtime observation plan both forbid showing prompts, tool arguments, and terminal text; OAR redacts only credentials | Revise N4 for doc sessions: show message bodies, tool category, and target path; commands are shown as one line only after passing `SECRET_TOKEN_PATTERNS`; raw tool output is not stored | Doc session |
| G4 | P0 | Pushing doc session events to the browser | Revamp plan §11 #12: no SSE for now; the browser polls every 30 s | The host writes `events.jsonl`; the browser polls by `epoch.seq` cursor, 1 s while active, 30 s when idle | Doc session |
| G5 | P0 | Agent host for doc sessions | The coding host was deleted in #932; the review host uses macOS `sandbox-exec` and opens only the output directory; every OAR runtime skips confirmations by default and has no sandbox | A new docs host: `sandbox-exec` opens only `<worktree>/docs/**`; commit, push, and Draft PR are done by the server; macOS only in the first version | Doc session |
| G6 | P1 | Capability differences across runtimes | kimi, antigravity, and opencode v2 have no steer; codex cannot withdraw queued messages; all runtimes can stop the current turn | Pass each runtime's capabilities to the UI; unsupported buttons are greyed out with the reason | Doc session, Settings |
| G7 | P1 | docs/ read API | #925 removed the old doc reader; the revamp plan says show paths only | See "Doc Reading": resolve realpath, then check allow and deny lists; return commit and sha256 | Docs, Home |
| G8 | P1 | Citation protocol | None; MCP's diff matches original text by line offset and records a fragment hash, which can be borrowed | Citation = file + line range + content sha256; validate before starting a session, and require re-citing if content changed | Docs |
| G9 | P1 | Agent install detection and config | The OAR install probe spawns subprocesses; `config.json` has only four keys: architecture, brainRoot, protectedHelperRuntime, security | Merge probes into the setup collector's 10-minute cycle; add `agents.enabled / uses / default_docs` to config; Pi Durable, Cursor, Mister Morph need an extra registry built | Settings, Docs |
| G10 | P2 | Runtimes for review | `reviewRuntime` allows only claude, codex | For each runtime added, first get evidence of its read-only isolation | Settings |
| G11 | P1 | Structured data for architecture diagrams | The model has 84 nodes, 277 relationships, 38 flows; archctx already generates Mermaid, LikeC4, Structurizr; hand-written layer and topology views are archived, and their code sizes and dependency counts are hand-written numbers | Generate base maps from the model, with code size and dependency counts computed by the collector; full-graph auto layout needs separate approval for `@xyflow/react` + `@dagrejs/dagre` (both MIT); elkjs is excluded for licensing | Architecture |
| G12 | P2 | Skill catalog | Waza, herdr skill, and hai-stack are `local_tool` in `tool-catalog.v1.json` | Add a skill category to the catalog, or a separate recommended-skill catalog; the per-host skill projection list comes from `setup check` | Skills, Tools |
| G13 | P2 | Dark theme tokens | Resolved: the repo-harness design system defines two sets of Kumo semantic tokens, Paper (light) and Ink (dark), and every design on the canvas can switch between them | Reference the design system's tokens.json directly in the implementation; the pixel mascots (Carrot buddy, Donkey, Hook) ship together as brand assets | All |
| G14 | P2 | Display fields for tool cards | The catalog has no author, tags, or whether it installs with a profile | Add these three fields to the catalog, validated by the catalog test | Tools, Skills |
| G15 | P1 | Jump from a task to its agent | Task bindings have a Herdr endpoint and pane, and the hook payload has session\_id; hosts have no public session deep link, and the docs state that host resume capability is unverified | Put it under "Follow up" in the task drawer, giving only copyable locations and commands: Herdr pane location, claude --resume / codex resume commands, and fleet message send to hand off to the Bot. The console does not write to coding sessions; desktop deep links are added after the hosts confirm them | Task drawer |
| G16 | P2 | Hook call stats and denial records | The 24-hour counts and recent denials on the Hooks page are sample data; the collector does not read hook events | The collector aggregates runs/hook-events.jsonl and failures/latest.jsonl, counts by route, and redacts paths before they leave the server | Hooks |
| G17 | P2 | Profile route counts differ between docs and code | install-profiles.md says both hosts are minimal 4 / full 5; route-registry.ts actually has Claude 5 / 6, Codex 4 / 5 | Fix the docs to match the registry, or generate this table from the registry; the console only reads the registry | Agents, Hooks |
| G18 | P2 | CLI integration detection | Only gh is a repo-harness dependency (collector, merge gate, external-source refresh); there is no unified CLI version and sign-in probe; cf (Cloudflare's new CLI, replacing wrangler), asc, supabase, and pscale are not detected at all | 5 built-in read-only probes (gh auth status, cf auth whoami, asc auth status --validate, pscale auth check --format json; supabase has no status command, so check by hand as needed), using repo marker files to decide where each is used; output is parsed only on the server and only the account name is returned; other CLIs are registered in config.json | CLI |
| G19 | P1 | Kinds of "waiting on you" | attention has only one kind, ready\_to\_merge; the planned column is declared but no code sets it | Add three kinds to the dev-activity projection: changes\_requested, merge\_conflict, checks\_failed, sorted by wait time | Home, Board |
| G20 | P1 | Per-case test results | CI has only logs and artifacts; local test runs leave no record | Turn on bun's JUnit reporter in ci-run-tests.sh and upload the artifact in CI; the collector reads the latest one | Tests |
| G21 | P1 | Mapping tests to capabilities | Only 26 model nodes have verification commands, and the file referenced by 1 of them no longer exists | Generate a projection from the model and the reverse import graph, with a drift check, without creating a new authority | Tests, Architecture |
| G22 | P1 | Architecture layer data | The console has only a module list and a one-hop dependency graph; no change, violation, test, or decision layers | See the "Architecture" section; open upstream issues for the parts that need archctx support | Architecture |

## Dev Environment Management

The environment pages answer only three questions: what each host has installed, where it differs from what is expected, and how to fix it. Data comes from the existing setup check and new background probes. Fixes are always just commands, which the user runs in the terminal.

| Page | Shows | Data source | Gap |
| --- | --- | --- | --- |
| Agents | Adapter projections for Claude Code and Codex: whether hook routes are consistent or drifted, missing entries; whether the 7 fleet roles are installed; Codex CLI version | `SetupSnapshotV1.hosts[]`, `fleet[]` | Install profile (minimal, full) has no structured field and is only written in the check description |
| Skills | 23 skill packs (12 ship their own SKILL.md); one column per host: installed, missing, drifted | `SetupSnapshotV1.skills[]`, `assets/skill-commands/manifest.json` | "Recommended" is not a schema field; herdr, mermaid, obsidian are outside the check scope (G12) |
| Hooks | Routes and hosts for 5 events (SessionStart, PreToolUse, UserPromptSubmit, SubagentStart, Stop); call counts and recent denials | `SetupSnapshotV1.hooks[]`, hook event log | G16, G17 |
| CLI | Versions and signed-in accounts of the CLIs used for development | Background read-only probes | G18 |
| Tools | 7 catalog entries: 4 local tools, 3 recommended resources | `assets/tool-catalog.v1.json` | Status is only unknown and na; Tools plan P1 not done (G14) |
| System | Collector freshness, status of the three source types (git / github / runtime), Notify plugin | Collector health | No duration field |
| Agent integration | OAR runtimes, install probe results, enable, uses, default agent | OAR registry, `runtime.installation()` | G9 |

- **Runtime list**: the default registry in OAR 0.62.1 has 7: claude, codex, grok, kimi, opencode, antigravity, pi. Pi Durable, Cursor, and Mister Morph are not in the default registry; the host must build its own registry and install optional dependencies. The page puts them under "Needs extra install".
- **Install probe**: `installation()` first looks on PATH, then spawns subprocesses to run `--version` and a readiness check (such as `codex app-server --help`). So it is merged into the setup collector's 10-minute cycle, and GET only reads the cache. The `OAR_<X>_BIN` environment variable can pin the executable.
- **Capability differences**: OAR decides whether a session can be inserted into the current turn by whether the session object has a `steer` member, which is known only after the session opens. kimi, antigravity, and opencode v2 have no steer; codex cannot withdraw queued messages; all runtimes can stop the current turn. The Settings page shows a static capability table; the session page greys out buttons based on the actual session.
- **Config**: `~/.repo-harness/config.json` currently has only four keys, `architecture`, `brainRoot`, `protectedHelperRuntime`, `security`. It is located by `HOME`, not `REPO_HARNESS_HOME`. Add an `agents` section: `{enabled: [id], uses: {docs: [id], review: [id]}, default_docs: id}`. `review` accepts only claude, codex.
- **Fix commands**: `repo-harness setup check`, `repo-harness install --target codex|claude|both --profile minimal|full`, `repo-harness update`. The page gives the one that matches the drift type.
- **OAR upgrade**: recommend upgrading to 0.71.x in phase 3. Session, event, and startup conventions are unchanged. It adds a browser-usable config form `./forms`, and per-runtime entry points (about 1–2.5 MB heap, versus about 50 MB for the root entry), which suit the Settings page and the probe collector exactly.

## Docs and Architecture Management

The Docs page lets people read docs, cite passages, and hand them to an agent to edit, with changes coming back as a Draft PR. The Architecture page draws the model as a base map and overlays change, violation, test, and decision layers. The agent only writes docs; source is read-only in the session.

### Doc Reading (G7)

- `GET /api/v1/repositories/{id}/docs/tree` returns `path`, `size`, and `sha256` for readable files. `GET …/docs/file?path=` returns the body, HEAD commit, file sha256, and whether there are uncommitted changes.
- Read working-tree files in the primary checkout without spawning subprocesses. Open with O\_NOFOLLOW and compare dev:ino before and after reading, the same way as MCP's `general-repo-access/authority.ts`. Single-file limit is 512 KiB.
- Scope: the allowlist is `docs/**` plus cited source files. Resolve the realpath first, then check both the allowlist and the denylist on the physical path. MCP's `paths.ts` checks only the logical path, so symlinks can escape scope; it cannot be reused as is.
- An existing convention must change: the revamp plan requires "docs show paths only, the server returns plain text only" (:251, :530). The new proposal renders markdown in the browser; the server still returns only the raw text.

### Citation Protocol (G8)

- Citation = `{path, start_line, end_line, range_sha256, file_sha256, commit}`. The browser maps the rendered selection back to source file line numbers; `range_sha256` is the hash of those lines' raw bytes.
- When a session starts, the server re-reads the file. If the hash of the content at those line numbers matches, it passes. If the file changed but the original text appears exactly once elsewhere, it switches to the new line numbers and marks this in the UI. If neither holds, it returns 409 `citation_stale` and asks the user to cite again. MCP matching `oldBlock` by line offset and recording a fragment hash is the same idea.
- Source citations are read-only context only, limited to files inside the repo that are not ignored and not on the denylist.

### Doc Session (G5)

1. **worktree**: create a linked worktree from the latest commit on the default branch, with branch name `docs/<slug>`, at a location still to be decided (the storage-layout section of the shared PRD is not written yet).
2. **Host**: a new docs host, based on the coding host deleted in #932 plus the review host's isolation. macOS `sandbox-exec` opens only `<worktree>/docs/**`, the agent's own state directory, and the temp directory. `.git`, AGENTS.md, CLAUDE.md, settings and credential files, and the hooks and skills directories are all write-protected. The host first proves that a subprocess cannot write to the forbidden areas, then opens the session.
3. **Agent startup**: OAR always starts in no-confirmation mode (Claude with the bypass flag, Codex as danger-full-access), and can only run within the OS boundary above. Per `CLAUDE.md`, this kind of confirmation bypass needs the user's item-by-item approval (open question 3).
4. **Events**: the host appends records that have passed the allowlist and redaction to `events.jsonl` (0600) in the session directory: message bodies from both sides, tool category and target path, turn boundaries, and failure category. Commands are shown as one line only after passing `SECRET_TOKEN_PATTERNS`. Raw tool output and reasoning are not stored.
5. **Push**: the browser polls `GET …/docs-sessions/{sid}/events?after=<epoch>.<seq>` by cursor, once per 1 s while active and once per 30 s when idle. The epoch increments on every host restart, because after OAR resumes a session `seq` restarts from 0.
6. **Commit**: done by the server's effect, not the agent. List every change against the baseline (including untracked files), confirm all are within the writable scope, check `expected_diff_sha256`, commit with the message the user confirmed, push the branch, then open the Draft PR, or, per open question 5, give only the `gh pr create --draft` command.
7. **Cleanup**: after merge, when the working tree is clean, the worktree and local branch are deleted automatically. "Discard" first lists the files to be discarded and deletes only after the user confirms. A pushed branch only gets a command. This matches the deletion rules in `CLAUDE.md`.
8. **Platform**: Linux and Windows return 501 `platform_unsupported` until they have a matching OS boundary.

_Diagram: doc session states — 6 states, 2 human confirmations; see the design brief._

The host loops between "Running" and "Waiting for your review". There are only two ways out of this loop, commit and discard, and both need a human's approval.

## Test and TDD Management

The Tests page is read-only. It lists the tests in tests/ with their directory and architecture-capability ownership, run lane, and duration; shows the latest CI and local verification results; and gives copyable run commands. Writing and running tests still happen in the user's own harness. The console does not run tests and sets no red-light gate.

| Item | Current state | Source |
| --- | --- | --- |
| Size | 302 test files (293 `.test.ts`, 9 `.test.tsx`), about 3,700 test cases; `tests/` has 511 files in total, 8.0 MB | `bunfig.toml`, `scripts/select-test-suite.ts` |
| Ownership | archctx assigns all of `tests/**` only to `component.evals-checks.test-suite`; 26 of 84 model nodes have `extensions.verification` commands, pointing to 100 test files, 1 of which no longer exists | `.archcontext/model/nodes/` |
| Lanes | core, integration (3 files), full; PRs run only affected tests selected by the reverse import graph; the full suite runs daily at 19:00 UTC | `scripts/select-ci-coverage.ts`, `.github/workflows/ci.yml` |
| Duration | 259 records (2026-10-03 baseline), about 28.6 minutes total when run serially; 53 existing files have no record, and 10 records point to deleted files | `scripts/test-file-durations.json` |
| Results | CI has only logs and artifacts, no per-case JUnit or JSON; local `bun run test*` leaves no record; the only things written to disk are verification plan run records and evidence events | `scripts/lib/ci-run-tests.sh`, `src/effects/evidence/verification-execution.ts` |
| Failure handling | When the daily full run fails, a `[CI repair] job:<name> @ <sha12>` issue is opened; no retries and no quarantine list | `scripts/report-ci.ts` |
| TDD | Bug fixes first get a focused failing test; ordinary tasks do not require a RED artifact, and receipts are not faked. The red-light gate was removed in #483 (2026-10-03); the code has no RED/GREEN concept | The Testing section of `CLAUDE.md` |
| Console | Shows only a summary of PR checks (success, failure, in progress) and merge blocker codes; reads no test run records | `src/core/dev-activity/projection.ts` |

Page content:

- **Inventory**: two groupings, by directory and by architecture capability. Each group shows file count, test case count, lane, platform gates (`darwinTest`, expensive lanes), and recorded duration.
- **Results**: status and failed files of the latest daily full run, open `[CI repair]` issues, required checks for the current PR, and local verification plan run results (passed, failed, reused).
- **TDD**: the task drawer lists the test files changed by this task's diff, and its verification plan check results. When the same check fails on base and passes on head, it is marked "red→green". This only states evidence; it is not a gate.
- **Commands**: for affected tests, `bun run test:files <files> --timeout 60000 --max-concurrency 1` and `bash scripts/check-ci.sh affected`; for adopted repositories, `repo-harness run verify-sprint --test <file>`.
- **Maintenance hints**: files with no duration record, duration and verification references pointing to deleted files, and about 10 test files still named by issue number.

All data sources go through a background collector; GET only reads the cache:

1. Scan `tests/**` for files and test case counts; read `extensions.verification` from the archctx model; reuse the reverse import graph from `select-ci-coverage.ts` to compute "test → source module → capability". The result is a projection with a drift check, not a new authority.
2. Use `gh run list` and `gh issue list` to read the latest daily run and `[CI repair]` issues, with the same cadence and timeouts as Dev Activity's gh calls.
3. Read `.ai/harness/runs/verification-vx-*.json` for local verification results.
4. Per-case results have no source yet: turn on bun's JUnit reporter in `ci-run-tests.sh` and upload the file as an artifact.

## Progress Management

The progress pages answer four questions: what is waiting on me, what step each task is at, who is working on it, and where it is stuck. There are two data lines today: Dev Activity feeds the board, and Fleet feeds the repository detail page. Their stage vocabularies differ. The proposal shows the two lines' stages side by side, without merging them into one set and without recomputing them in the UI.

| Data line | Stages | "Waiting on you" | Refresh | Scope |
| --- | --- | --- | --- | --- |
| Dev Activity (Board, Home) | building, verifying, ready\_to\_merge, shipped; `planned` is declared but no code sets it | Only ready\_to\_merge, sorted by PR creation time | Background, every 60 s | Only PRs you opened with your own gh account |
| Fleet (repository detail) | available, working, in\_review, ready\_to\_merge, done, plus 3 special columns | Merge readiness uses 13 blocker codes | Spawns a subprocess per request | Registered tasks; with session, context, diff, and activity |

- **Three kinds to add to "waiting on you"**: the design's "Review requested changes", "Conflicts with main", and "Checks failed". PR data already has `review`, `merge_state`, and `ci` fields, so only new attention kinds are needed in `src/core/dev-activity/projection.ts`, with no new data source (G19).
- **Who is working on it (G2)**: a background collector checks the task session records item by item: the `binding.json` hash matches the selector, `native-session.json` points to the same binding, the provider process's pid and start time match the record, and there is no `closed.json`. The agent and status are shown only if all pass; otherwise it shows "No verified session". It reads no conversation and no terminal text.
- **Follow up (G15)**: the task drawer gives only commands: `claude --resume <id>` or `codex resume <id>`, the Herdr pane location, and `fleet message send` to hand off to the Bot.
- **Today's summary**: besides the stage counts at the bottom of Home, a daily summary of PRs merged today, the 3 items waiting longest, failed checks, and open `[CI repair]` issues. When one person merges dozens to hundreds of changes a day, reading the summary is faster than scanning the board.
- **Not doing**: drag-and-drop column changes, automatic dispatch, recomputing column or merge readiness in the UI.

## Open Questions and Milestones

Settle the first three constraint questions first, then deliver in five phases, from lowest to highest write risk.

- [ ] Approve the two bounded writes and revoke the read-only constraints in place since #482 (I1, I2, I9)? (G1)
- [ ] How much should the doc session page show: message bodies, tool category, tool arguments, command output? (G3)
- [ ] Should doc sessions accept OAR's no-confirmation startup (the default for every runtime; Claude's bypass flag cannot be turned off), relying only on the OS boundary to restrict writes? (G5)
- [ ] Writable scope for doc sessions: docs/ only, or also plans/ and .archcontext/model/? (G5)
- [ ] Should the console open doc session PRs directly, or only give the `gh pr create --draft` command?
- [ ] Is it OK for the first version of doc sessions to support only macOS? (G5)
- [ ] Approve adding `@xyflow/react` and `@dagrejs/dagre` (both MIT) for auto layout of the full architecture graph? (G11)
- [ ] Should tests be management only (inventory, results, commands), or also allow agents to write tests in sessions that open only tests/? Recommendation: management only. (G20, G21)
- [x] Does the dark theme replace the warm paper color, or do both coexist? Decided: both coexist, with light Paper as the default (G13)

1. **Phase 0 · Set constraints**: write and confirm `docs/design/DESIGN-<slug>.md` (UX Feature Guard plus Given/When/Then scenarios); revise I1, I2, I9, N4, and `operator.md` §3.1. Docs changes only.
2. **Phase 1 · Read-only shell and dev environment**: Home, new sidebar, Board and task drawer (execution status read-only), Repositories, System, Agents, Skills, Hooks, CLI, Tools, doc reading, Tests page (G2, G7, G12, G14, G16–G21). No new writes.
3. **Phase 2 · Architecture canvas**: generate base maps from the model and overlay layers (G11, G22). Gate: the layout dependency is approved and the needed upstream archctx capabilities are released. No new writes.
4. **Phase 3 · Write channel and agent integration**: write API, Settings page, install probe and capability table, OAR upgraded to 0.71.x (G1, G6, G9). The first new write changes only local config. Gate: G1 approved.
5. **Phase 4 · Doc sessions**: citation protocol, docs host, event push, worktree and Draft PR (G3, G4, G5, G8). Gate: G3 approved; the OS boundary for G5 is proven by a zero-model write-denial test.

### Milestone Breakdown

Each slice is a PR that can merge on its own, with its own checks. By Review by risk tiers, only slices in phases 3 and 4 count as high risk.

| Slice | Main changes | Acceptance |
| --- | --- | --- |
| 0.1 Design brief | `docs/design/DESIGN-<slug>.md` | Every row of the UX Feature Guard has evidence or a decision; user confirms |
| 0.2 Revise constraints | Revamp plan §2, Kumo plan §2, `operator.md` §3.1, README | The four places agree in wording; no code changes |
| 1.1 Shell and Home | `App.tsx`, `workspace-location.ts`, `theme.ts`, wired to design system tokens | UI tests for the 15 page routes; read-only assertions unchanged |
| 1.2 Waiting on you (G19) | `src/core/dev-activity/projection.ts` | Projection tests cover the three new kinds and sorting |
| 1.3 Execution status (G2) | New collector reading task session records | Shows "No verified session" for a forged binding, a dead process, or a present `closed.json` |
| 1.4 Environment pages (G12, G14, G16–G18) | Setup snapshot, hook event aggregation, CLI probes | Paths redacted; probes run only in the background |
| 1.5 Doc reading (G7) | New GET routes and reader | Reads via symlink escape, `.env`, and `.git/` are all refused, with tests |
| 1.6 Tests page (G20, G21) | JUnit output, projection collector, Tests page | Projection drift check is in CI |
| 2.1 Base map (G11) | Layout dependency (pending approval), base map component | The full graph of 84 nodes is readable and matches the model |
| 2.2 Layers (G22) | Four layers: changes, violations, tests, decisions | Every layer's data has a source; no hand-written numbers |
| 3.1 Write channel (G1) | POST allowlist, token, audit, idempotency, locks; update write-boundary tests | Cross-site, missing token, wrong Content-Type, and replay are all refused, with tests |
| 3.2 Agent integration (G6, G9) | Config `agents` section, install probe, Settings page; OAR upgraded to 0.71.x | Revision conflict returns 409; review host tests still pass |
| 4.1 docs host (G5) | Restore isolation code from #932, narrowed to `docs/` | Zero-model write-denial test on macOS: `.git`, source, and credentials cannot be written |
| 4.2 Citations and sessions (G8) | Citation validation, session creation, worktree | Stale citations return 409; worktrees only under the agreed root directory |
| 4.3 Events and visible scope (G3, G4) | `events.jsonl`, cursor polling, redaction | Secret samples never appear in any response |
| 4.4 Commit and cleanup | commit, push, Draft PR, discard | Out-of-scope changes are refused at commit; only merged, clean worktrees are auto-deleted |
