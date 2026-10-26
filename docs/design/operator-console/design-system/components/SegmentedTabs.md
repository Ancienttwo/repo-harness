# SegmentedTabs

Switch views or filters on the same data. Uses the segmented style of Kumo `Tabs`.

- Used for: board stage filters (全部 / 等我处理 / 构建中… ("All / Waiting on me / Building…")), architecture views (模块 / 分层 / 时序 / 拓扑 ("Modules / Layered / Sequence / Topology")), diff vs. reading, host switching, profile selection.
- Each segment can carry a monospace count. The selected segment has a `color-kumo-tint` background and `text-color-kumo-strong` text. Others use `text-color-kumo-subtle`.
- Segments are 32px tall. The container is `color-kumo-base` + `color-kumo-line` border, 3px padding.
- When the switch changes page (a different URL), use `<a aria-current>`. When it only changes the display, use `<button aria-pressed>` or a radiogroup.
- Do not use it for choices that change data (for example, profile install). In that case the choice only changes the command shown next to it.
