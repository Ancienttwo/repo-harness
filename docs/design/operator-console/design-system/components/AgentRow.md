# AgentRow

One row on the settings page 「Agent 接入」 ("Agent setup"): the install status, purposes and enable switch of one OAR runtime. The switch uses Kumo `Switch`.

- Left: initial square + name + runtime id (`code`) + optional 「默认」 ("Default") pill (solid `rh-accent`). On the next line: status dot + detection result (「可用 · 可执行文件 codex」 ("available · executable codex"), 「可用 · 随 OAR 内置」 ("available · bundled with OAR"), 「没有找到可执行文件」 ("no executable found")).
- Right: purpose toggles (「文档会话」 ("Document session"), 「评审」 ("Review"); selected uses `rh-accent-tint` background + `text-color-kumo-brand` text) + switch. An unsupported purpose has a dashed border, is disabled, and says 「暂不支持」 ("not supported yet").
- An agent that is not installed gets no switch. It gets 「安装说明 ↗」 ("Install guide ↗").
- Only this page shows the OAR name and version. Other pages show only the agent name.
- The switch writes to `~/.repo-harness/config.json`. Each agent manages its own credentials; this row does not store them.
