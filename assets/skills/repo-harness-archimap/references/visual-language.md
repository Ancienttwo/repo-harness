# Visual language

`assets/template.html` defines every token and component below as CSS
classes. Copy the template and keep its stylesheet. Write only position and
size inline (`left`, `top`, `width`, `height`). A refresh then shows up as
a small diff, and two maps from the same skill look the same.

## Canvas and grid

- Board: 1680 px wide, height 1000–1640 px, background `--canvas`, outer
  margin 64 px. Boards stack vertically with a 48 px gap. Each board has a
  caption `h2` above it.
- Snap every coordinate and size to an 8 px grid. Node widths are
  multiples of 16.
- Header: kicker at (64, 64) and title at (64, 88). The legend is
  right-aligned at the top right, at most 552 px wide.
- Overview: left gutter for layer labels at x = 88. The main column runs
  from x = 296 to x = 1144. A deployed-side zone runs from x = 1224 to
  x = 1616. A layer band is about 200 px tall, with nodes 88–104 px tall.
- Sequence: lifeline headers 192 × 64 on a 240 px pitch, starting at
  x = 224.

## Overview node links

An overview node that the model covers is an `<a>` element with
`class="node"`, not a `<div>`. Its `href` is the first path of the
module's `docs` from `measure.ts`, relative to
`docs/architecture/archimap.html` (for example
`modules/runtime-harness/operator.md`). The node keeps its kind fill,
border and text color. Underline it on `:hover` and `:focus-visible`
only, and show a visible focus ring.

A module that covers more than one capability document links to the first
path and ends its mono id line with `+N`, the number of other documents.
The meta block keeps the full list in `modules[].docs`. A node with no
document stays a `<div>` and carries no link: an `undocumentedNodes`
capability gets a remark, and a node that the project does not provide is
not a capability.

## Type

IBM Plex Sans with Noto Sans SC for CJK text, and IBM Plex Mono for
kickers, IDs, counts and paths. System fonts are the fallback. Sizes: 36/600
title, 15 node name, 13 secondary line and legend, 12 mono detail, 11
footnote.

## Colors (fill / border / text)

| Token | Use |
|---|---|
| `k-app` grey `#EEF0F3 / #4B5563` | Host apps, top-layer consumers |
| `k-compose` blue `#E8EEFB / #1E40AF` | Composition and service layer |
| `k-kernel` purple `#EFEAFB / #5B21B6` | Coordination kernel, the authority layer |
| `k-contract` teal `#E3F3F0 / #0F766E` | Shared contracts, protocol, core types |
| `k-remote` orange `#FBEDE6 / #9A3412` | A separately deployed side (device, worker, browser) |
| `zone` dashed `#C2703F` on `#FFF8F4` | The container of that side |
| `k-external` dashed grey on white | Not provided by the project |
| `note` amber `#FFF4D6 / #B7791F` | Side effects, caveats, Medium severity |
| `sev-high` `#B42318` | High severity, violated rules |
| `dark` `#16181D`, chips `#262A31` | Life-cycle strip, file tree |

Map layers to these kinds by role, not by name. Use one kind per layer.
When a project has more layers than kinds, reuse `k-app` for the outer
layers and keep `k-kernel` for the single authority layer.

## Edges

All edges of a board are paths in one `<svg class="edges">` that covers
the board, in board coordinates. Use orthogonal paths (`M x y H x V y`)
and end each path 4 px before the target border.

| Class | Stroke | Meaning |
|---|---|---|
| `e-call` | 2 px `#6B7079` | Runtime call |
| `e-import` | 3 px `#2B2F36` + count badge | Package value import (count from `measure.ts`) |
| `e-remote` | 2 px `#9A3412` | Call from the remote side |
| `e-host` | 2 px `#5B21B6` | Call from the host or caller side (sequence) |
| `e-dash` modifier | `6 6` dash | Process or network boundary, return, delivery |
| `lifeline` | 1.5 px `#C4C6BF`, `4 6` dash | Sequence lifeline |

A count badge is a small mono label on white next to the edge midpoint. An
edge label is 13 px text above a horizontal edge, or to the right of a
vertical one.

## Matrix ramp

`h1 #E6F2EF` (1–5), `h2 #BFE0D9` (6–20), `h3 #7FC1B4` (21–50), `h4 #2F8F7E`
(51+, white text). Forbidden and satisfied: `forbid` tint `#FBEDEA` with
`#9A3412` text. Attention: `attn`, amber.

## Quality checks

- No two boxes overlap unless one contains the other.
- No text is clipped. Shorten the line, or widen the node on the grid.
- Edges do not pass through nodes. Labels do not sit on lines.
- The legend lists exactly the edge and node styles that the board uses.
- Each color means the same thing on every board.
