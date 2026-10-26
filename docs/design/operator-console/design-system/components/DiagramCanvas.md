# DiagramCanvas

The canvas viewport on the architecture page. Layered, sequence and topology diagrams share it. Kumo has no matching component. Nodes and edges are drawn with this system's tokens. `@dagrejs/dagre` computes the layout and `@xyflow/react` renders it (PRD gap G11, dependencies approved 2026-10-27). elkjs is excluded for its license (EPL-2.0 or GPL-3.0). The first repo copy named ELK; this copy follows the approved decision.

- Viewport: `rh-diagram-bg` background (pure white in the light theme) + 20px dot grid (`rh-diagram-dot`), `radius-xl`, scrollable and zoomable. Nodes, legend and zoom group inside the canvas use `rh-diagram-line` borders.
- Legend at bottom left, zoom group at bottom right (− / 100% / + / fit). The inspector panel on the right is fixed at 300 to 360px and shows details of the selected element.
- Nodes: `radius-lg`. External actors have dashed borders. Layers or groups use low-saturation fills; the colors also differ in lightness. A selected node has a 2px `rh-accent` border.
- Edges: solid = import, dashed = subprocess or I/O. Violating edges use `color-kumo-danger`. Edges with no rule constraint use `color-kumo-warning`. Numbers on edges are edge counts, in monospace.
- Sequence diagrams: one light box per OS process. `alt / else` branches use the tint of the matching status. The selected message is bold and uses `rh-accent`.
- Diagram data comes only from the model and generated statistics. Do not hand-write numbers in the frontend.
