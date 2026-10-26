# FolderCard

A group card with a folder tab. The tab sits on the card's top-left corner and joins the card as one shape. Use it to hold "one directory" or "one group of similar things", for example the tests page grouped by `tests/` subdirectory. Modeled on the matrix groups in the GitHub Actions run graph.

- Structure: outer `.folder` (`color-kumo-base` background, 1px `color-kumo-line`, radius `0 radius-lg radius-lg radius-lg`). The tab `.tab` is absolutely positioned above it: `bottom: calc(100% - 1px)`, same background and border, no bottom border, pushed down 1px to cover the card's top border along that segment.
- Inverted small corner on the right of the tab: `.tab::after` draws an 8 × 8 block with only left and bottom borders, `border-bottom-left-radius: 8px`, then fills the rest with a `box-shadow` in the card color.
- Tab text: monospace 12px, 500, with a 13px folder icon before it. Truncate when too long. The tab is at most the card width minus 24px.
- Leave room for the tab between cards: grid row gap at least 40px, 28px above the first row.
- On hover, the borders of the card, tab and small corner all change to `color-kumo-interact` together.
- The consumer decides what goes in the card: one large result line (「54 / 55 通过」 ("54 / 55 passed")), a ratio bar, monospace metadata, an expandable file list.

```css
.folder{position:relative;background:var(--color-kumo-base);border:1px solid var(--color-kumo-line);border-radius:0 12px 12px 12px}
.folder>.tab{position:absolute;left:-1px;bottom:calc(100% - 1px);height:28px;padding:0 14px 1px;display:flex;align-items:center;gap:6px;background:var(--color-kumo-base);border:1px solid var(--color-kumo-line);border-bottom:0;border-radius:8px 8px 0 0}
.folder>.tab::after{content:"";position:absolute;right:-9px;bottom:0;width:8px;height:8px;border-left:1px solid var(--color-kumo-line);border-bottom:1px solid var(--color-kumo-line);border-bottom-left-radius:8px;box-shadow:-4px 4px 0 4px var(--color-kumo-base)}
```
