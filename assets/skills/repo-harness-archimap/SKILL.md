---
name: repo-harness-archimap
description: Draw or refresh the project's human-facing architecture map, one self-contained HTML file at docs/architecture/archimap.html, from the architecture model and measured code facts. Use when the user asks for an architecture map, diagram or overview page, or when an [Archimap] notice reports that the module or API model changed. Exclude architecture model and Mermaid edits.
when_to_use: "repo-harness-archimap"
---

# repo-harness-archimap

Worker entrypoint. The archimap is the project's architecture map for people and for the
orchestrator agent. It is one static HTML file,
`docs/architecture/archimap.html`, made of fixed-size boards: the layered
overview, the measured dependency directions, the runtime topology, the
key sequences and the remarks. The orchestrator of
`repo-harness-issue-flow` splits work by its modules. Workers cite its
module IDs. A stale map therefore sends issues to the wrong boundaries.

## What the map is a projection of

| Content | Authority | The map does |
|---|---|---|
| Modules, layers, responsibilities, relations, flows | Architecture model: `.archcontext/model/` (nodes, relations, flows). A repository without an adopted model is adopted first (`repo-harness-architecture`, "Adopt ArchContext in a repository") | Groups model nodes into map modules and draws them |
| Size and import direction | Code, measured by `scripts/measure.ts` | Shows LOC and value-import counts |
| Observations and risks | The author's review, with file:line evidence | Lists them on the Remarks board |

The map never adds a module, relation or flow that the model does not
have. It does not group by package or directory layout: that layout is not
a model. If the model is wrong, fix the model first: use
`repo-harness-architecture` for an archctx model. Then refresh the map.
Mermaid diagrams that archctx generates stay as they are. They serve the
model's own docs. The archimap is the one hand-composed HTML view.

## Modes

- **Draw.** No map exists, or the user asks for a redraw. Do every step.
- **Refresh.** A map exists. An `[Archimap]` notice fired, or the model,
  the module layout or a public API changed. Change only the affected
  boards. Keep unchanged nodes at the same coordinates, so that a reviewer
  can compare the two versions by eye. When a new node needs room, move
  the fewest nodes, and name each moved node in the report.

## Steps

1. **Read the model.** List the model's nodes (id, kind, layer, summary,
   `source.include`, entrypoints), its relations and its flows. For
   archctx, read the YAML under `.archcontext/model/` directly. In a
   refresh, read the meta block of the current map and run
   `git diff <meta.base>..HEAD --stat -- .archcontext/model` to find what
   moved.
2. **Group into map modules.** The overview holds at most 20 modules. A
   small model gets one module per node. A larger model is grouped by
   domain or layer. Each map module lists the
   model node IDs it covers (`nodes`) and the path globs it owns
   (`include`, `exclude`). The grouping is part of the map. It is stored
   in the meta block, so that a refresh reuses it. Change it only on
   purpose.
3. **Measure.** From the repository root, run:

   ```bash
   bun <this-skill>/scripts/measure.ts --map docs/architecture/archimap.html --model .archcontext/model/nodes
   ```

   For a first draw, write the grouping to a scratch `modules.json` and
   pass `--modules <file>` instead of `--map`. `--model` is required, and
   `measure.ts` exits 2 when it is missing or when
   `docs/architecture/.projection-manifest.json` is missing. Each module in
   the output carries `docs`: the capability documents it covers, resolved
   from `modules[].nodes` through that manifest. Fix every `uncoveredNodes`,
   `unknownNodes`, `duplicateNodes` and `overlaps` entry in the grouping
   before you draw. `undocumentedNodes` lists capability nodes that no
   projected document covers: name them in a remark, and do not link them.
   Look at `unassigned.largest`: a large unassigned file is usually a
   missing module. `unparsed` and `unresolved` list files and
   imports that the counts miss. Name them in the matrix caption when they
   are not zero. The counts are value imports: a model relation that the
   code satisfies with type-only imports shows no count. Draw it as a
   thin edge and say so in the caption, rather than drop it. The script reads TS and JS imports. For
   other languages, count module edges with the code graph tool (for
   example `codegraph_explore`) and record the method in the legend.
   Bun is required. Without Bun, report that the measurement could not
   run. Do not hand-count.
4. **Choose the boards.** Read `references/boards.md`. The overview and
   the remarks are always present. Include each other board when its
   condition holds.
5. **Compose.** Copy `assets/template.html`, and follow
   `references/visual-language.md` for the grid, colors, node kinds and
   edges. Write the real content. Every overview node carries its map
   module ID in `data-module` and links to its capability document: an
   `<a>` element whose `href` is the first path of the module's `docs`.
   Every number on the map comes from the measurement or from the model.
6. **Write the meta block.** Update `schema`, `base` (the commit that you
   measured), `generated` (date), `sources`, `modules` and `boards`. Put
   the short base SHA into each board kicker.
7. **Check.** Open the file in a browser (the built-in browser pane or a
   headless browser) and look at each board. Check for overlapping boxes,
   clipped text, arrows that end in empty space, and a legend that matches
   the edge styles used. Run `measure.ts` once more against the written
   map and confirm that the coverage lists are empty.
8. **Ship with the change.** In a refresh triggered by a branch change,
   commit the map in the same PR as the model change. Say in the PR body
   which boards changed.

## Boundaries

- One file, self-contained: inline CSS, inline SVG, no JavaScript
  framework, no external scripts. A Google Fonts stylesheet link is
  allowed, with a system-font fallback.
- Light, static and print-friendly. No interactivity is required, and none
  may hide content.
- Text follows the repository's documentation language
  (`.ai/harness/policy.json#documentation.language`). Keep code
  identifiers, paths and IDs as written.
- Remarks are observations, not tasks. A remark that needs work becomes a
  GitHub issue through `repo-harness-issue-flow`, and the remark links it.
- Do not edit `.archcontext/model/`, generated architecture docs or Mermaid
  files from this skill.
