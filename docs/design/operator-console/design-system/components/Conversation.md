# Conversation

The message stream and composer of an agent session. Task sessions and document sessions share it. Kumo has no matching component. repo-harness builds it and uses only this system's tokens.

- The column is centered, max width `container-prose` (672px). 24px between messages.
- Messages you send are right-aligned, `rh-accent-tint` background, `radius-lg`, sans-serif. Messages dispatched by the Bot use `color-kumo-tint` background, with the source in `caption` above (「Bot · 派工」 ("Bot · dispatch")).
- Agent replies are left-aligned with no background and use `reading` (IBM Plex Sans 16px / 1.65). The agent name comes before the first reply, with a small `rh-agent-codex` or `rh-agent-claude` square before the name to mark identity.
- Tool events collapse into one expandable `color-kumo-recessed` box: status dot + verb (读 / 改 / 运行 / 搜 ("read / edit / run / search")) + target (`code`) + result (`+18 −9`, passed, `3f9c2e1`). By default only the count shows. Expand to see the details.
- Turns are separated by a very light divider row: 「18:20 · 第 4 轮 · 进行中」 ("18:20 · turn 4 · in progress").
- Citations appear as numbered pills at the top of a message (①②). The numbers match the numbers on the quoted passages in the body.
- Composer: `color-kumo-control` background, 1px `color-kumo-line`, `radius-xl`, floating and pinned to the bottom. The top half is a multi-line input. The bottom half is one tool row: ＋ citation, delivery mode (after this turn ends / insert into the current turn), agent name, and a send button in the primary action color (`color-kumo-brand`) on the right. While running, 「停止」 ("Stop") appears next to the send button.
- Display scope is not decided (PRD gap G3). Until it is final, do not show raw command output or raw tool arguments.
