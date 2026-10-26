# repo-harness

English repo copy of the repo-harness design system. The live, browsable version is the Claude design-system artifact; keep both in step.

The design system for every repo-harness surface: the website repo-harness.com, the operator console, and the docs pages. The brand comes from the tokens in the website repo `repo-harness-page@ffe3ff1` (paper background, ink-blue neutrals, carrot orange, Space Grotesk · IBM Plex Sans · JetBrains Mono). This pass reorganizes them under Kumo 2.14.0 semantic token names and fixes several places where contrast was too low. The console's component layer uses Kumo (`@cloudflare/kumo`). The layout follows conversational desktop apps: sidebar + centered reading column + composer pinned to the bottom.

## Principles

- **Paper and ink.** The light theme is a warm paper background with ink-blue text. The dark theme is an ink-blue background with paper text. Large areas use only these two neutral families, layered by lightness.
- **Carrot orange is the only brand color.** The darker step (`color-kumo-brand`, carrot-700) is for primary buttons. The standard step (`rh-accent`, carrot-500 / 400) marks only 「等你处理」 ("waiting on you"): counts, unread dots, rows that need you, selected borders, focus rings. On any screen, orange appears only where a person is needed or something needs to be pressed.
- **Agents have their own identity colors.** Codex blue (`rh-agent-codex`) and Claude terracotta (`rh-agent-claude`) mark identity only. They do not express status and are never mixed with status colors.
- **Semantic tokens only.** Components use `bg-kumo-base`, `text-kumo-subtle`, `border-kumo-line`. Palette tokens (`paper-*`, `ink-*`, `carrot-*`) only supply values to semantic tokens. No `dark:` prefix.
- **Monospace is the voice of the brand.** Commands, paths, event names, counts and uppercase eyebrows use JetBrains Mono.
- **A copyable command beats a button.** For actions the console cannot perform, give a command to copy (`CommandCopy`).
- **The interface explains itself.** At most one line of explanation per page. No extra subtitles.

## What this pass unified

| Item | Website before | Now | Why |
| --- | --- | --- | --- |
| Primary button | carrot-500 background + white text | carrot-700 background + white text (`color-kumo-brand`) | Was 2.9:1, now 6.1:1 |
| Orange text | carrot-600 | carrot-700 (`text-color-kumo-brand`) | Was 3.9:1 on paper |
| Amber status text | amber-600 #B86E05 | #8F5503 (`text-color-kumo-warning`) | Was 3.9:1 on paper |
| Text on orange | White | Ink (`rh-on-accent`) | White text does not reach 4.5:1 |
| Dark theme | Only the terminal and dark blocks | Full ink theme, two values for every semantic token | The console needs light/dark switching |
| Naming | Mix of `--surface-*`, `--text-*`, `--accent`, etc. | Kumo semantic names + a few `rh-*` extensions | The console overrides Kumo variables directly |
| Neutral scale | Paper was missing middle steps | Added paper-75, ink-925 (the old terminal color), carrot-800 | Hover, dark page background, primary button hover |
| Chinese font fallback | system-ui only | PingFang, Hiragino Sans GB, Microsoft YaHei | Chinese interface |

## Writing UI copy

- UI copy is in Simplified Chinese. Short sentences, one idea per sentence. Keep protocol words as they are: PR, worktree, ledger, profile, skill, hook.
- Status describes the outcome: 「等你批准合并」 ("waiting for you to approve the merge"), 「与 main 冲突」 ("conflicts with main"), 「GitHub 超时」 ("GitHub timed out"). For failures, say where it failed and how to recover.
- The home page and empty states may use one `display` greeting with a number: 「下午好，有 3 件事等你处理」 ("Good afternoon, 3 things are waiting on you").
- Uppercase monospace eyebrows (`eyebrow`) are only for English or protocol words (`HOOKS · 7 ROUTES`). Chinese group names use `caption`.
- Facts that are not inferred are written as 「未知」 ("unknown"): an agent without a verified identity is 「agent 未知」 ("agent unknown").

## Visual foundations

**Layout**: Sidebar on the left (`color-kumo-elevated`) + main area (`color-kumo-canvas`). Content is at most `container-page` (1152px) wide. Conversations and document body are centered in a `container-prose` (672px) reading column. The composer is the same width as the reading column and pinned to the bottom. A right-hand panel appears when needed (`color-kumo-base`, `radius-lg`).

**Sidebar**: Logo, repo switcher (below the logo, a full-width bordered button), search, 「新会话」 ("New session"), section nav, 「最近」 ("Recent") document sessions (single line, truncated, unread dot `rh-accent`), settings and operator status. Items are 34 to 36px tall. The selected item uses `color-kumo-tint`.

**Surfaces and lines**: Cards are `color-kumo-base` + 1px `color-kumo-line`. Between rows: `color-kumo-hairline`. Recessed areas and table headers: `color-kumo-recessed`. Cards on the page have no shadow. Overlays use `shadow-lg`. Buttons use `shadow-xs` / `shadow-sm`.

**Terminal blocks**: Commands and output use the dark `rh-terminal` background, dark in both themes. Text #D8E0EA, prompt carrot-400.

**Typography**: Headings and buttons use Space Grotesk (600, letter-spacing -0.01 to -0.02em). Body and interface text use IBM Plex Sans. Monospace uses JetBrains Mono. Interface body is 14px, reading text 16px / 1.65, metadata 12px. Chinese falls back to PingFang and Microsoft YaHei.

**Radius**: 3 / 5 / 8 / 12 / 18px and pill. Restrained, leaning technical. Buttons and inputs 8px, cards 12px, composer and viewports 18px.

**Focus**: Every focusable element gets a 3px focus ring in `color-kumo-focus` (carrot-600 / 400).

**Motion**: 120ms fast, 180ms normal, 280ms slow, `cubic-bezier(0.22, 0.61, 0.36, 1)`. No bounce in the interface. Pressed elements sink 1px. Clickable cards lift 2px on hover. Near zero under `prefers-reduced-motion`.

## Color usage

| Use | Token |
| --- | --- |
| Primary button (send, start session, commit and open Draft PR) | `color-kumo-brand` + white text |
| Waiting on you: counts, unread dots, leading row dots, selected borders | `rh-accent` |
| Orange text, eyebrows | `text-color-kumo-brand` |
| Quoted passages, messages you sent | `rh-accent-tint` |
| Running | `color-kumo-info` + `color-kumo-info-tint` |
| Passed, available | `color-kumo-success` |
| Changes requested, partially available, drift | `color-kumo-warning` + `color-kumo-warning-tint` |
| Conflict, unavailable, violating edge | `color-kumo-danger` + `color-kumo-danger-tint` |
| Agent identity | `rh-agent-codex`, `rh-agent-claude` and their tints |
| Unknown, not connected | Hollow dot, `text-color-kumo-subtle` outline |

Statuses also differ in lightness: orange (needs you) is used alongside blue (running). Nothing relies on telling red from green.

## Logo and icons

The SVG files named below live in `assets/logos/` and `assets/mascots/` next to this README.

- The logo is a pixel carrot. Inside the interface (sidebar, page header) use the transparent `repo-harness-carrot-mark-transparent.svg`, 9 × 12 grid, 32 to 36px tall. For the favicon and places where it must stand alone as a block, use `repo-harness-carrot-mark.svg` with the ink square background. The wordmark is `repo-harness` in Space Grotesk 700, lowercase, 18px.
- Icons use Phosphor (`@phosphor-icons/react`, already a repo dependency), outline style, 16px, color follows the text. No emoji, no third-party brand logos. Agents and tools use initial squares; agent squares use the identity colors.

## Pixel characters

The three characters from the website mascot are drawn as pixel art (the Mascots group) to add a little warmth to the interface. Characters are only decoration: at most one per screen, carrying no information beyond status, always with text beside them.

| Character | File | Used for |
| --- | --- | --- |
| Carrot buddy | `buddy.svg` | General empty states |
| Carrot buddy · happy | `buddy-happy.svg` | Before the home greeting, done states |
| Carrot buddy · sleeping | `buddy-sleep.svg` | Idle, old data that can be cleaned up |
| Carrot buddy · alert | `buddy-alert.svg` | Partial availability, drift banners |
| Donkey | `donkey.svg` | Agents (the donkey that carries the host) |
| Donkey · happy | `donkey-happy.svg` | Settings · Agent setup, tool banners |
| Hook | `hook.svg`, `hook-cap.svg` | Hooks page |
| Terminal | `terminal.svg` | CLI setup |
| Carrot buddy · reading | `buddy-reading.svg` | Docs pages, document sessions |
| Carrot buddy · party | `buddy-party.svg` | Shipped today, all passed |
| Carrot buddy · searching | `buddy-search.svg` | Search with no results |
| Carrot buddy · wrench | `buddy-wrench.svg` | Drift notices that come with a fix command |
| Donkey · bags | `donkey-bags.svg` | Agents, tool banners: the blue bag is Codex, the orange bag is Claude |
| Carrot on a line | `hook-carrot.svg` | Tool banners, onboarding pages |
| Bug | `bug.svg` | Test failures |
| Disconnected cloud | `cloud-off.svg` | Data source unavailable (GitHub timeout, etc.) |

- Scale by whole multiples (3×, 4×) with `image-rendering: pixelated`. No anti-aliased scaling.
- Characters are decorative images: `alt=""`.
- Both themes use the same pixels. No color inversion.

## Integration

Console: `src/operator-web/app.css` is already wired the way Kumo requires (`@source` → `@import "@cloudflare/kumo/styles/tailwind"` → `@import "tailwindcss"`). After that, add a `@theme` block that writes this system's semantic tokens with `light-dark()` (names match Kumo's CSS variables, e.g. `--color-kumo-canvas`), then add the `rh-*` extensions. Light and dark are switched by `<html data-mode>` (`theme.ts` already exists). Fonts come from `@fontsource/space-grotesk`, `@fontsource/ibm-plex-sans`, `@fontsource/jetbrains-mono` (already used by the website).

Website: Change the semantic aliases in `src/styles/tokens/colors.css` to this system's names and values. Switch the primary button to `color-kumo-brand` and text on orange to `rh-on-accent`.
