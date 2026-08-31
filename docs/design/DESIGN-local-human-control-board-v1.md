# Design Brief: Local Human Control Board v1

> **Status**: Confirmed
> **Slug**: local-human-control-board-v1
> **Owner**: repo-harness maintainers
> **Date**: 2026-08-24

> **Superseded in part by v2** (`plans/plan-20260828-2326-operator-board-redesign.md`):
> the board is no longer read-only. v2 exposes the existing `fleet message` effect
> as a task-addressed message channel, so the v1 read-only invariant is replaced by
> an **exactly one write** invariant — observe-only plus that single bounded write.
> Everything below records the v1 design as confirmed on 2026-08-24 and is left
> unchanged; read `read-only` and `不存在 mutation controls` below as v1 history,
> not as the current contract.

> **Current presentation amendment (2026-08-31)**: the browser consumes only
> protocol 3. The worklist opens the first non-empty group and collapses all
> others by default. R1 `delivery_state`, `runtime_reachability`, `effect_sha256`,
> and `failure_class` are secondary task evidence: exceptional delivery/runtime
> states may add a compact badge, but never move a task between Fleet columns.
> The composer names its actual target (current owner or next claimant). At
> `<=900px` the task drawer is an opaque modal, locks background scrolling, and
> exposes 44px minimum interactive targets. Protocol 2 remains rejected rather
> than translated.

## Purpose & Audience (頁面目的與受眾)

- Page/surface: localhost-only `repo-harness operator serve` read-only Fleet control board.
- Primary audience: 在同一台开发主机上管理多个 adopted repositories 的 repo-harness maintainer / human operator.
- Job to be done: 不切换多个终端即可看清 Fleet 当前列、attention owner、阻塞原因与 task 证据，并从 degraded 状态得到明确恢复入口。

## UX Feature Guard (行為前圍欄)

- Requested outcome (使用者可見結果): 浏览器显示一个可刷新、可下钻、可在桌面与移动端阅读的 Fleet snapshot；视觉语言参考 `Ancienttwo/repo-harness-page@ffe3ff1b14284e5712b0b0f82534e33c4fabfe6b`。
- Frozen behavior / rules that must not change (不可改變的玩法與語義): `FleetBoardSnapshotV1` 与既有 core/effects 继续拥有 column、attention、Lease、publication、feedback、inbox 与 consistency 语义；UI 不重算或持久化这些状态。
- Requested action (指令): 启动 loopback operator server，读取一次权威 Fleet snapshot，按五列与 attention 投影展示，并允许用户显式刷新和打开 task drawer。
- Exact payload acted on (資料內容; if none, write `N/A`): `collectFleetBoard()` 返回的单个 `FleetBoardSnapshotV1`，经 transport-safe view projection 去除本机绝对路径后作为 `OperatorFleetSnapshotV1` 返回。
- Forbidden extras / non-goals (禁止新增): mutation、自动派工、Agent 进程启动、plan approval、provider merge、Cloudflare Tunnel/Access、OAuth、SSE/WebSocket、离线缓存或重放、第二套 task/column/owner authority、从 prose 推断状态。

### Role-aware User-visible Concept Boundary (角色可見概念邊界)

- Audience / role for this surface (可見角色): local human operator，v1 不区分角色。
- Allowed visible concepts (允許可見的概念範圍): repository display id、access mode、repo health、snapshot consistency、task id/revision、五列、attention owner、execution readiness、Lease state、claim/generation、publication/head、merge blockers、feedback/inbox counts、observed time/sequence/protocol。
- Required outcome/recovery concepts that must stay visible (必須保留的結果與復原概念): loading、empty Fleet、empty column、repository unreadable、snapshot changed during read、whole-request failure、last successful observation time，以及可复制的 task/publication/head identifiers。
- Backstage-only concepts that must never appear as user-visible (僅限後台，不得對使用者可見): `repo_root` absolute path、environment variables、provider stderr、stack trace、server filesystem layout、registry implementation details。
- Role-gated exceptions, or `none` (角色限定例外，無則填 `none`): none.
- Authority for each exception, or `N/A` (每個例外的核准依據，無則填 `N/A`): N/A.

`UX-local-human-control-board-v1-N1` 断言本机绝对路径与 mutation affordance 均不得出现在浏览器 payload 或 UI。

### Authority & Reuse Map (權威與復用)

| Responsibility / datum | Existing authority or reuse target | Decision (reuse / extend / new) | New-surface justification |
|------------------------|------------------------------------|---------------------------------|---------------------------|
| Fleet semantics and protocol | `src/core/fleet/board.ts` | reuse | UI 只投影，不复制 column/attention/consistency 规则 |
| Snapshot collection and failure isolation | `src/effects/fleet/board.ts#collectFleetBoard` | reuse | server 直接 import effect，不调用 CLI 子进程 |
| CLI option validation style | `src/cli/commands/fleet.ts` | reuse | `operator serve` 沿用 Commander、typed stderr 与 exit code 约定 |
| HTTP server lifecycle | `src/cli/mcp/transports/http.ts` | reuse pattern | Human surface 需要独立静态资源和 read-only API，不能把 Web UI 塞进 MCP transport |
| Browser-safe response | new `OperatorFleetSnapshotV1` projection | new | `FleetBoardSnapshotV1.repositories[].repo_root` 是本机路径，不应跨 server/browser boundary |
| Visual tokens | `repo-harness-page@ffe3ff1.../src/styles/tokens/*.css` | reuse | 同一产品家族需要 exact palette/type/motion；dashboard layout 另行设计 |
| Browser UI | new React + Vite application under operator-owned source | new | 当前仓库没有 Web entrypoint、component library 或 browser build |

### Observable & Copy Contract (可觀測狀態與文案)

- Happy/loading/empty states that can actually occur: 初次 loading；稳定 snapshot；无 adopted repo；repo 存在但无 active sprint/card；单列为空；单 repo degraded；changed-during-read；manual refresh in flight。
- Invalid/unavailable state: 顶部 error band 必须说明 “Fleet snapshot unavailable”、失败发生在 operator API 还是 repository row，并给出 “Run `repo-harness fleet board --json` for diagnostics” 或 retry；保留上一次成功 snapshot 时必须明确标成 stale，不得伪装为 fresh。
- Machine-readable output contract, if any: `GET /api/v1/fleet/snapshot` 成功返回 versioned `OperatorFleetSnapshotV1`；失败返回稳定 error envelope 与 non-2xx。payload 必须不含 `repo_root`、stderr、stack、environment。
- Canonical copy source / sync sites: browser 文案集中在 operator Web app；CLI help 位于 `src/cli/commands/operator.ts`；协议字段只由 `src/core/operator/*.ts` 定义。
- Fail-loud rule: registry/Fleet authority 整体失败时 API non-2xx 且 UI 显示原始 typed failure 的安全文案；不得用空 board 代替失败。repo-local failure 只使用 `FleetBoardErrorV1` 已批准的脱敏 message。

### BDD Acceptance Scenarios

- `UX-local-human-control-board-v1-P1`: Given adopted repos 可被 `collectFleetBoard()` 读取，When operator 启动 server 并在浏览器加载或刷新，Then UI 按权威 snapshot 显示 summary、五列、attention 与 task drawer，And protocol/sequence/observed time 与 API payload 一致。
- `UX-local-human-control-board-v1-N1`: Given Fleet snapshot 内含 `repo_root` 且 v1 是 read-only，When server 投影并渲染 browser payload，Then payload/UI 不出现绝对路径或 mutation controls，And 不存在并行 task/column/owner 计算与持久化。
- `UX-local-human-control-board-v1-F1`: Given registry/Fleet authority 整体不可用或 API 返回 non-2xx，When 用户加载或刷新，Then UI 明确显示失败位置、可执行诊断命令和 retry，And 不合成 empty/success snapshot。

## Reference Sources (參考來源:學什麼/避什麼)

| Source | Learn (學什麼) | Avoid (避什麼) |
|--------|----------------|-----------------|
| `Ancienttwo/repo-harness-page@ffe3ff1...` | exact warm-paper tokens、Space Grotesk/IBM Plex Sans/JetBrains Mono、carrot focus/accent、ink inverse band、48px grid wash、Lucide、120/180ms motion | 不复制 landing hero、marketing section rhythm、功能卡片墙 |
| `docs/researches/20260823-human-control-board-agentic-factory.md` | five-column information architecture、Attention Inbox、Task Drawer、thin renderer boundary | 不提前加入 mutations、Tunnel、Planner 或 Worker Host |
| `src/core/fleet/board.ts` | exact public statuses、null/consistency/error semantics | 不从标签或 prose 重新推断状态 |

## Color (色彩)

- Palette: ink `#0E1822/#14202E/#1B2D40/#294056/#3B5470/#51647B/#74879B/#9DACBC`; paper `#FFFFFF/#FBF7EF/#F4EEE1/#EAE1CF/#DBCFB6`; carrot `#FDF0E4/#FAD9BE/#F08A3C/#E8742C/#CC5F1C/#A54B15`; semantic green/red/amber/codex-blue/purple 逐字复用 reference tokens。
- Usage rules: paper 是工作面，ink rail/headers 建层级，carrot 只用于 primary/focus/attention，semantic hues 只表达状态；正文/背景达到 WCAG AA，focus ring 为 `0 0 0 3px rgba(232,116,44,.32)`。

## Typography (字型排印)

- Typeface(s): Space Grotesk display、IBM Plex Sans body、JetBrains Mono ids/labels/code，复用 reference 自托管 font packages。
- Scale / weights: dashboard 主体以 12/14/16/18/22/28px 为主，400/500/600/700；数字、revision、SHA 使用 tabular mono。
- Language-specific notes: v1 UI copy 使用 concise English technical labels；CJK/系统 fallback 保留，line-height 不低于 1.45。

## Layout (佈局)

- Grid / breakpoints: desktop 为 248px ink navigation rail + fluid workspace + 360px task drawer；主 workspace 最多 1440px。小于 1100px drawer overlay；小于 760px rail 折叠、五列改为可选 column tabs 和单列流。
- Spacing scale: 4/8/12/16/24/32/40/48px，dense control 可用 4px sub-step；interactive target 最小 40px。
- Key components and hierarchy: app shell -> Fleet summary strip -> Attention inbox -> five column board -> task cards -> task drawer；error/degraded band 高于 board；不使用均匀 card-grid dashboard。

## Motion (動效)

- Trigger -> effect pairs: task select -> drawer 以 opacity/translate 进入；card hover -> `translateY(-2px)`；button press -> `translateY(1px)`；refresh -> 局部 progress 与 snapshot timestamp cross-fade。
- Duration / easing: 120ms fast、180ms base、280ms slow，`cubic-bezier(0.22,0.61,0.36,1)`；无 bounce。
- What must stay static: column order、summary geometry、status color meaning、copyable identifiers；`prefers-reduced-motion` 下近零时长。

## Anti-patterns (明確禁止清單)

- 禁止把 marketing hero、mascot、CTA 或 section landing layout 搬进 operator workspace。
- 禁止满屏同权重 rounded cards、gradient/glow、巨大标题、emoji、彩色装饰 icon。
- 禁止客户端重算 column/attention/merge readiness 或保存 canonical workflow state。
- 禁止 optimistic mutation、隐藏 API/authority failure、用 empty state 伪装错误。
- 禁止在 browser payload 暴露 `repo_root`、stderr、stack trace 或 environment。
- 禁止首刀加入 auto-refresh loop、SSE/WebSocket、Cloudflare、auth、mutation 或 Agent lifecycle。

## Confirmation Checklist (確認標準)

- [x] Value proposition is clear (價值主張清晰)
- [x] Primary reference is decided (主參考已定)
- [x] Color is accurate to the reference (色彩準確)
- [x] Anti-pattern / don't list is explicit (明確的 don't 清單)
- [x] Motion spec is explicit (動效規格明確)
- [x] Product rules/non-goals are frozen; instruction and payload are separate (玩法不變，指令與內容分離)
- [x] Existing component/domain authorities have exact reuse paths; every new surface is justified (優先復用現有權威)
- [x] Positive, negative, and authority-failure Given/When/Then scenarios are explicit and fail loudly (BDD 場景完整且錯誤可見)
- [x] Role-aware visible/backstage-only concept boundary is explicit; `UX-local-human-control-board-v1-N1` matches a backstage-only or non-goal concept (角色可見/僅限後台概念邊界明確，N1 對應非目標或僅限後台概念)

## Preview Attachment (可選)

- Preview path/link: primary implementation reference is source code at `Ancienttwo/repo-harness-page@ffe3ff1b14284e5712b0b0f82534e33c4fabfe6b`; browser acceptance screenshots are produced by this work package.
