# Operator Console Design Material

Design material for the operator console redesign. The design brief is
[`../DESIGN-operator-console-uiux.md`](../DESIGN-operator-console-uiux.md) and
the PRD is
[`plans/prds/20261026-2100-operator-console-uiux.prd.md`](../../../plans/prds/20261026-2100-operator-console-uiux.prd.md).

| Material | Where |
| --- | --- |
| Design canvas (17 artboards, light/dark) | Claude design artifact: https://claude.ai/artifact/JVJiUztNTXwx1wvmFwdcyw (private until shared) |
| Design system (live) | Claude design-system artifact: https://claude.ai/artifact/JyoYEw29VBRwmBRnnKf3TT (private until shared) |
| Design system (repo copy) | [`design-system/`](design-system/README.md): README, `tokens.json`, component guidelines, logos and mascots |

## Page inventory

UI copy in the designs is Simplified Chinese; the Chinese page names are the
sidebar labels.

| Group | Page (sidebar label) | Artboard | Writes |
| --- | --- | --- | --- |
| — | Home (首页) | `Home` | none |
| Work | Board (看板) | `Main` | none |
| Work | Task drawer | `Task` | none (follow-up is copyable commands; inbox is read-only) |
| Work | Repositories (仓库) | `Repositories` | none |
| Work | Docs (文档) | `Docs` | starts a docs session |
| Work | Docs session | `DocsSession` | `docs/` files, branch, Draft PR |
| Setup | Agents | `Agents` | none (commands only) |
| Setup | Skills | `Skills` | none |
| Setup | Hooks | `Hooks` | none |
| Setup | CLI | `CLI` | none (read-only status probes) |
| Observe | Architecture: layers, sequence, topology (架构) | `ArchLayers`, `ArchSequence`, `ArchTopology` | none |
| Observe | Tests (测试) | `Tests` | none |
| Observe | System (系统) | `System` | none |
| Observe | Tools (工具) | `Tools` | none |
| — | Settings · Agent setup (设置) | `Settings` | `~/.repo-harness/config.json` |

The "Task · agent session" artboard was dropped: the console does not message
or stop coding sessions.

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
