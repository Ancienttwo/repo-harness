# ListGroup

A row list of objects of the same kind. It is the console's main layout. The container uses Kumo `LayerCard`. Collapsing uses Kumo `Collapsible`.

- Container: `color-kumo-base`, 1px `color-kumo-line`, `radius-xl`. 1px `color-kumo-hairline` between rows. Row padding 14px × 20px.
- A row has three parts. Left: status dot + title (`body`, `text-color-kumo-strong`) + metadata (`caption`, `text-color-kumo-subtle`, separated by ·). Right: fixed-width columns (stage, agent, checks, time). Far right: one action (external link or 「打开会话」 ("Open session")).
- Column widths are fixed so values in the same group line up vertically. On narrow screens the whole right part wraps to the next line.
- Beyond 4 to 6 rows, show only the most recent ones, with a bottom row button 「显示其余 N 个 ⌄」 ("Show the other N ⌄") (`aria-expanded`).
- Secondary groups use a heading-style collapse: 「今天已发布（5）⌄」 ("Shipped today (5) ⌄").
- The group title sits outside the container: `small`, `text-color-kumo-subtle`, followed by a monospace count.
