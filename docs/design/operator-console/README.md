# Operator Console Design Material

Design material for the operator console redesign. The design brief is
[`../DESIGN-operator-console-uiux.md`](../DESIGN-operator-console-uiux.md) and
the PRD is
[`plans/prds/20261026-2100-operator-console-uiux.prd.md`](../../../plans/prds/20261026-2100-operator-console-uiux.prd.md).

| Material | Where |
| --- | --- |
| Design canvas (21 artboards, light/dark) | Claude design artifact: https://claude.ai/artifact/JVJiUztNTXwx1wvmFwdcyw (private until shared) |
| Design system (live) | Claude design-system artifact: https://claude.ai/artifact/JyoYEw29VBRwmBRnnKf3TT (private until shared) |
| Design system (repo copy) | [`design-system/`](design-system/README.md): README, `tokens.json`, component guidelines, logos and mascots |

## Page inventory

UI copy in the designs is Simplified Chinese; the Chinese page names are the
sidebar labels.

| Group | Page (sidebar label) | Artboard | Writes |
| --- | --- | --- | --- |
| — | Home (首页) | `Home` | none (includes the today summary) |
| Work | Board (看板) | `Main` | none |
| Work | Task drawer | `Task` | none (follow-up is copyable commands; inbox is read-only) |
| Work | Repositories (仓库) | `Repositories` | none |
| Work | Worktrees (Worktree) | `Worktrees` | cleans green (reclaimable) worktrees after a server-side recheck |
| Work | Worktree cleanup session | `WorktreeCleanup` | none by the agent; the user ticks items and the server deletes them |
| Work | Docs (文档) | `Docs` | starts a docs session |
| Work | Docs session | `DocsSession` | `docs/` files, branch, Draft PR |
| Setup | Agents | `Agents` | none (commands only) |
| Setup | Skills | `Skills` | none |
| Setup | Hooks | `Hooks` | none |
| Setup | CLI | `CLI` | none (machine-wide inventory; uninstall is a copyable command) |
| Setup | Bots | `Bots` | none (MCP, Slack and herdr status; access changes are commands) |
| Observe | Architecture: modules (default), layers, sequence, topology (架构) | `ArchModules`, `ArchLayers`, `ArchSequence`, `ArchTopology` | none |
| Observe | Tests (测试) | `Tests` | none |
| Observe | System (系统) | `System` | none |
| Observe | Tools (工具) | `Tools` | none |
| — | Settings · Agent setup (设置) | `Settings` | `~/.repo-harness/config.json` |

The "Task · agent session" artboard was dropped: the console does not message
or stop coding sessions.

## Worktree page

A disk chart splits every worktree on the machine into three classes:
reclaimable (merged, clean, not in use; green), needs your decision (yellow)
and keep (open PR, running process, unpushed or uncommitted source; red). Age
is never a reason to delete. Each row states the reason and what a delete
loses. Only green rows can be ticked for one-click cleanup. "Let the agent
clean up" opens a `worktree_cleanup` session: the agent investigates the
yellow rows read-only and returns a plan with evidence; the user ticks items;
the server rechecks each item under the topology lock, deletes it and writes
an audit entry. Leftover directories that git no longer registers are listed
by directory name only. PRD gaps G23–G26.

## Home today summary

The home page has a "Today" (今天) list below "Waiting for you". It has five
rows: PRs merged since 00:00, the three items that waited longest, failed
checks, open `[CI repair]` issues, and the reclaimable worktree space. Each row
links to the page that owns the data.

## Architecture module map

The sidebar "Architecture" entry opens the module map. It shows the 28
capabilities in their groups, with external systems around them. Edge width is
the import count; a red dashed edge is an undeclared dependency. Five layers
switch on top of the base map: today's changes, violations and drift, the
impact of one PR, test coverage, and decisions. The decision layer stays
disabled until archctx exports ADR `appliesTo` (#407). A side panel shows the
selected module and a copyable fix command. PRD gaps G11, G22 and G27.

## Collapsible sidebar

A toggle next to the logo collapses the sidebar to a 64px icon rail. The rail
keeps the nav icons with their names as tooltips, the repository tile and the
search icon. It hides group labels, counts and the recent docs sessions. The
architecture pages open collapsed to give the canvas the width; all other
pages open expanded.

## Repository switcher

Every page has the switcher directly under the logo: a bordered block with a
32px tile, a small label ("current repository" or "scope"), the repository
name and `owner · branch · short SHA`, and an up/down chevron. Pages that span
repositories show "all repositories"; single-repository pages (task drawer,
docs, architecture, tests) show the current one. Page headers have no second
switcher. Full spec: [`design-system/components/NavRail.md`](design-system/components/NavRail.md).

## Pixel mascots

17 SVGs in [`design-system/assets/mascots/`](design-system/assets/mascots/),
scaled by whole multiples with `image-rendering: pixelated`, `alt=""`, at most
one per screen.

| Mascot | File | Used on |
| --- | --- | --- |
| Carrot buddy | `buddy.svg` | general empty state |
| Carrot buddy, happy | `buddy-happy.svg` | home greeting |
| Carrot buddy, asleep | `buddy-sleep.svg` | stale registry entries, test maintenance notes |
| Carrot buddy, alert | `buddy-alert.svg` | Hooks drift banner |
| Carrot buddy, reading | `buddy-reading.svg` | Docs "new session" |
| Carrot buddy, party | `buddy-party.svg` | home stats line |
| Carrot buddy, searching | `buddy-search.svg` | no search results (not used yet) |
| Carrot buddy, wrench | `buddy-wrench.svg` | Agents drift banner |
| Donkey | `donkey.svg` | reserve |
| Donkey, happy | `donkey-happy.svg` | reserve |
| Donkey with saddlebags | `donkey-bags.svg` | Agents header, Tools banner, Settings (blue bag Codex, orange bag Claude) |
| Hook | `hook.svg` | reserve |
| Hook with cap | `hook-cap.svg` | Hooks header |
| Carrot on a line | `hook-carrot.svg` | Tools banner |
| Terminal | `terminal.svg` | CLI header |
| Bug | `bug.svg` | Tests failure stat |
| Cloud off | `cloud-off.svg` | System "partially available" banner |
