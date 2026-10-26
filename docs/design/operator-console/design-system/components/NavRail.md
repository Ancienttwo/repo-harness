# NavRail

The console's left sidebar: logo, repo switcher, search, new session, section nav, recent sessions, settings. Uses Kumo `Sidebar` (variant `sidebar`).

- Logo: transparent pixel carrot (36px tall) + 18px wordmark.
- Repo switcher: a full-width button directly below the logo. `color-kumo-base` background, 1px `color-kumo-interact` border, `shadow-xs`, about 52px tall. Left: a 32px square (`rh-accent-tint` background, the repo initial or a repo count such as 「10」). Middle, three lines: an uppercase monospace label (「当前仓库」 ("Current repo") or 「范围」 ("Scope")), the repo name (Space Grotesk 14px 600), and `owner · branch · short SHA`. Right: an up/down double arrow. When open, the border changes to `rh-accent` with a 3px `rh-accent-tint` glow, and a 300px-wide menu opens below: search box, 「全部仓库」 ("All repos"), the 5 most recently used repos (status dot + monospace repo name + one-line status), and 「其余 N 个 · 管理仓库 ›」 ("N more · Manage repos ›").
- Cross-repo pages (home, board, repos, system, the setup pages, tools, settings) show 「全部仓库」. Single-repo pages (task drawer, docs, architecture, tests) show the current repo. The page header has no second repo switcher.
- Section nav: Work (board, repos, docs), Setup (Agents, Skills, Hooks, CLI), Observe (architecture, tests, system, tools). Items are 36px tall with 16px icons. The selected item has a `color-kumo-tint` background and `aria-current="page"`. The board shows a count of items waiting on you (solid `rh-accent` pill).
- Recent: document sessions sorted by last activity. Titles are one line, truncated. A session with new messages shows an `rh-accent` unread dot on the right. Coding sessions do not go in the sidebar; follow-up goes from the task drawer back to your harness.
- Bottom: settings, operator address and status dot.
- Group names use `caption` + `text-color-kumo-subtle`. Groups are separated by spacing, not lines.
- Below 760px the sidebar collapses into a drawer that slides in from the left.
