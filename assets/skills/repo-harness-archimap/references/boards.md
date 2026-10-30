# Boards

A board is one fixed-size canvas, 1680 px wide and 1000 to 1640 px tall. It
answers one question. Use the boards in this order. Each board has a
kicker (`<PROJECT> · <TOPIC> · <short base sha>`), a title, and a legend at
the top right that explains only the marks that the board uses.

| # | Board | Question | Include when |
|---|---|---|---|
| 1 | Layered overview | What are the modules, on which layer, and who calls whom? | Always |
| 2 | Dependency direction (measured) | Which way do imports go, and do they follow the rules? | 3 or more modules with measured edges |
| 3 | Runtime topology | Which processes, services or devices run, and how do they connect and stop? | More than one process, service, device or deployment unit |
| 4 | Key sequence | How does the main request travel to its final state? | The model has flows, or the product has one main request path |
| 5 | Interfaces and mounts | What does each module expose, and what does the outside world see? | A public API, CLI, routes, events, storage layout or identity keys exist |
| 6 | Remarks | What did the author observe that a reader must know? | Always (it can say "no remarks") |

## 1. Layered overview

- Layers are horizontal bands, with the outermost actor (user, host app) at
  the top and shared contracts at the bottom. Use the model's layers. Label
  each band in a left gutter: a bold layer code (`L0`, `L1` ...) and a name.
- One node for each map module: name, `data-module` ID, LOC in mono, and a
  one-line responsibility from the model summary. Size the node width by
  importance, not by LOC.
- A separately deployed side (a device, a browser, a worker) is a zone: a
  dashed container in its own color, at the right of the main column.
- Something that the project does not provide (the user's CLI, a cloud
  database, a host app) is a dashed node.
- Edges: thin for runtime calls, thick for value imports with the measured
  count in a badge, dashed for a process or network boundary. Draw only
  the edges that explain the structure. A footnote says which edges are
  left out and what the size unit is (for example "non-test LOC").

## 2. Dependency direction (measured)

- A matrix. Rows are importing modules, columns are imported modules. A
  cell shows the value-import count from `measure.ts`. Use the four-step
  ramp for 1–5, 6–20, 21–50 and 51+. Show `—` for no edge and `·` for the
  diagonal.
- When the model declares direction rules (for example
  `.archcontext/model/constraints/`), mark each forbidden cell. A cell
  that holds 0 shows "forbidden · 0" in the forbidden tint. A cell with a
  count is a violation. Show it in the High color and give it a remark.
- Highlight in amber a cell that is allowed but worth attention, and give
  it a remark ID.
- A right-hand column lists import cycles and reverse imports (from the
  edges), each with a remark ID and severity. Under them is a card "Who
  guards these directions" with rows "checked by <check>" and "not
  checked".
- The caption states the counting basis: value imports only, tests
  excluded, tracked files only.

## 3. Runtime topology

- One panel for each side (host, device, cloud). Solid boxes are
  long-lived or per-task processes. Dashed boxes are process groups or
  sandboxes.
- Label every channel with its transport (HTTP loopback, HTTPS long-poll,
  Unix socket, stdio).
- When the project supervises child processes, add a dark strip at the
  bottom with numbered stages of the life cycle (for example reconcile →
  spawn → dispose → SIGTERM → grace → SIGKILL). Add platform notes below
  it.

## 4. Key sequence

- Pick one flow from the model's flows: the main path that a user's
  request takes. Add a second board for a second flow only when it is
  different in kind (for example an approval path).
- At most 6 lifelines on a fixed pitch. Messages are horizontal arrows
  with a label above. Colors follow the direction legend (caller side,
  remote side, return or delivery dashed).
- Group the messages into numbered phase bands (①, ②, ...). Put side
  effects (journal write, fsync, admission decision) in amber notes on
  the lifeline that does them.
- Use the model's step labels. Each step must exist in the model flow or in
  the code at a cited location.

## 5. Interfaces and mounts

Pick the parts that the project has:

- **Public surface by module:** CLI commands, HTTP routes, exported
  packages, hook events or MCP tools, grouped by the module that owns
  them. This is the board that an API change updates.
- **Identity keyspace:** a chain of ID nodes, from widest to narrowest
  scope.
- **Storage layout:** a dark file-tree card with the default paths and a
  short note for each.
- **Mounts:** a table or chip grid. What each runtime or deployment shape
  sees, and which routes exist under which capability. Show routes that
  are never mounted in one shape with a dashed chip.

## 6. Remarks

- At most 9 cards in a 3×3 grid. The kicker says "observations only; not
  scheduled work".
- Each card: ID (`R-<letter><n>`), severity (High: correctness or security
  boundary; Medium: structural burden; Low: naming and cleanup), category,
  a one-line finding, a body that ends with "Direction: …", and a
  `file:line` reference in mono.
- Tag a card that needs the owner's decision. When an issue exists for it,
  link the issue number.
- Keep remark IDs stable across refreshes. Remove a remark when its cause
  is gone, and do not reuse its ID.
