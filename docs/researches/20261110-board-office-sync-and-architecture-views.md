# Board office sync and architecture views: state machines, causes and abstraction options

Date: 2026-11-10. Base: main `c9af3b0`.
Fixtures: the recorded board of #1474 (`tests/fixtures/board`) and the recorded architecture map of this repository at `58a89e0`, archctx 0.11.2 (`src/operator-web/fixtures/architecture-map.json`).
Host: Linux container, Bun 1.4.4, Node 22.23.4, gh 2.89.0, headless Chromium through Playwright.
The container has no `hc`, and its GitHub proxy refuses GraphQL. No board read ran end to end here.

Evidence grades: **measured** (a count or a time from a run in this container), **observed** (a render of the fixture console), **read** (the code at the cited line), **derived** (a product of measured values).

## Verdict

| Question | Finding | Grade |
|---|---|---|
| Why does the Office sync slowly? | Each board GET starts a new CLI process, and that process reads every source again, one child process after the other. The recorded #1474 board (3 open pull requests, 4 seat terminals) costs 50 `gh`, 6 `hc` and 4 `git` processes. One `gh` round trip took 0.48 s to 0.56 s here, so `gh` alone is about 25 s. | measured counts, derived time |
| | The browser asks every 30 s, and every 60 s or 120 s after a refusal. The room shows no desk before the board read ends. The overview shows the desk states and counts of the last board GET of each room, and no process refreshes them. | read |
| Is the pixel scene the cause? | No. The room uses 4.3% of the main thread and causes no long task. | measured |
| Why is the architecture view quality low? | Five canvases, five layout modules, three SVG exporters and one hand-placed HTML map draw the same model. Only the Layers view routes its edges from layout data. Two views open at a fixed 85% zoom, and the topology view anchors it on one box in model order. The tests run in happy-dom, which draws no edge and has no geometry. | read, observed |
| Is there one abstraction for both problems? | Yes: the observation loop. The operator has 11 resident collectors that repeat one state machine, and 20 browser reads that repeat a second one with two different failure rules. The board routes are the only reads with no resident state. | read |

## 1. Board office: where the time goes

### 1.1 The read path

| Step | Code | Effect |
|---|---|---|
| Browser timer | `src/operator-web/useObservationRefresh.ts:3,31,44` | 30 s; 60 s after one failed read; 120 s after two |
| Room: the parents read, then the board read of the active parent | `src/operator-web/BoardPage.tsx:448-450`, gate at `:460` | The room stays on the loading state until both reads end. Every desk comes from the parents read (`board-office.ts:157-160`). |
| Overview: for each repository, the parents read, then the summaries read, one at a time | `src/operator-web/board-office.ts:252-268` | 2 CLI runs for each repository with an active parent |
| Overview on a hidden tab | `board-office.ts:273-277` | The page drops every card. The return starts from the loading state. |
| Route: one CLI child for each GET; one cap of 4 for the board, parents, summaries and advisor routes | `src/effects/operator/server.ts:1048-1092`, `src/core/review/operator-console-port.ts:3` | No cache, no ETag, no shared read. A fifth read gets `board_busy` or `parents_busy`. |
| Summaries route | `server.ts:1646-1649`, `src/effects/operator/board-summary.ts:47-51` | Runs the complete parents read a second time to get the parent numbers, then reads the stored files. |
| Stored summary | `server.ts:1610`, `board-summary.ts:33-45` | Written only when a board GET of that parent completes. |
| CLI: `collectBoard` | `src/effects/board/collect.ts:247-279` | Every source, in sequence, with `spawnSync` (`collect.ts:79-83`). |

`collectBoard` has five callers, and each one is a separate process with a complete read: the operator route, `board attention`, the resident watcher (one read each 15 or 60 minutes, `src/core/board/attention-delivery.ts:13-15`), `board merge` and `board review` (`src/cli/commands/board.ts:112,126,299`, `src/effects/board/merge.ts:30`, `src/effects/board/review.ts:162`). No caller uses the result of another caller.

### 1.2 Cost of one read (measured)

Method: the `gh_runner`, `readiness` and host seams of `collectBoard`, `collectBoardParents` and `collectPullRequestMergeReadiness` with counting test doubles, on the recorded #1474 reads. Each count is one `spawnSync` in production.

| Read | Source | Processes | Code |
|---|---|---|---|
| Board | Repository name | 1 `gh` | `collect.ts:229` |
| | Parent issue, sub-issues and comments | 1 `gh` for each page of sub-issues | `collect.ts:233-242` |
| | Linked pull requests | 1 `gh` | `collect.ts:252` |
| | Merge readiness of each open pull request | 11 `gh`; 15 `gh` when the base commit has `.github/workflows/ci-report.yml`, as this repository has | `collect.ts:254-260`, `src/effects/publication/merge-readiness.ts:1152-1170` |
| | Path owners | 1 `archctx resolve` batch | `collect.ts:193-209` |
| | Merge-only sync proof, for each pull request with an earlier reviewed head | `git`; one `git fetch` when a commit is missing | `src/effects/board/merge-only-sync.ts:107-118` |
| | `publication.acceptance_merge` | 1 `gh` | `collect.ts:136-149` |
| | Seat terminals | 1 `hc ls`, 1 `hc get` for each terminal, 1 `git symbolic-ref` for each seat | `src/effects/terminal/herdr-core.ts:505-518`, `collect.ts:160-170` |
| | Daily run | 1 `gh` | `collect.ts:110-129` |
| | hc version | 1 `hc` | `collect.ts:151-155` |
| Parents | Open issues | 1 `gh` for each 100 open issues | `src/effects/board/parents.ts:44-47` |
| | Seat terminals | 1 `hc ls`, 1 `hc get` for each terminal, 1 `git` for each seat | `parents.ts:56-58` |

Totals for #1474: 5 + 3 × 15 = **50 `gh`**, 6 `hc`, 4 `git`. The parents read: 1 `gh`, 5 `hc`, 3 `git`. The comment at `server.ts:1595` says "about ten GitHub reads".

The 15 calls of one readiness read, in order: `repo view`, `pr view`, `api repos/<r>`, `pr checks --required`, `api actions/runs/<id>`, `contents/.ai/harness/policy.json?ref=<base>`, `contents/.github/workflows/ci-report.yml?ref=<base>`, `commits/<base>/pulls`, `git/commits/<base>`, `pulls/<parent PR>`, `commits/<parent>/pulls`, `api graphql` (reviews), `repo view`, `pr view`, `api repos/<r>`.
Four of them read the repository identity. Six read facts of the base commit only. Five read the pull request. Pull requests of one batch usually share one base commit, so 10 of the 15 calls return the same answer for each of them. The 10 calls hold 8 different answers, because the repository identity is read two times. The board makes 15 N calls where 5 N + 8 different answers exist.

Timing in this container: one `gh api` round trip 0.48 s to 0.56 s (5 runs; `gh --version` alone 0.04 s); one CLI start (`bun src/cli/index.ts board parents`, stopped at the option check) 0.12 s to 0.29 s.

### 1.3 Latency budget (derived)

`T(board) ≈ 0.5 s × (5 + 15 × open pull requests)` plus the `hc`, `git` and `archctx` processes. The read is ended at 90 s (`src/effects/operator/board-read.ts:18`).

| Path | Latency |
|---|---|
| Room, first desk on screen | `T(parents) + T(board)`: about 25 s for 3 open pull requests, about 48 s for 6 |
| Seat status word changes, desk follows | 0 to 30 s wait, then `T(parents)`; the wait is 60 s or 120 s after a refusal |
| CI or acceptance changes, desk follows | 0 to 30 s wait, then `T(board)` |
| Overview, 8 repositories, 4 with an active parent | 12 parents reads in sequence for each cycle |
| Overview desk states, queue, CI and "needs you" counts | The age of the last board GET of that room: no upper limit |

Prediction for the owner host: `time repo-harness board --parent <n> --json` is near `(5 + 15 × open pull requests)` times the time of one `gh api` call on that host.

### 1.4 What does not cause it: the scene

| Measure | Value | Grade |
|---|---|---|
| `composeRoom`, 6 to 16 desks | 3.8 ms to 5.1 ms for each frame, 29 colour paths, 148 KB to 235 KB of path data | measured, Bun |
| `composeMiniRoom`, one card | 0.64 ms, 19 KB | measured, Bun |
| Paths that differ between two frames | 22 of 29 | measured |
| Room, production React build, fixture data, 10 s | 4.3% of the main thread (script 3.0%), 60 animation frames per second, 0 long tasks | measured, Chromium |
| Overview with 8 cards | 1.9% | measured |
| List layout of the same board | 0.6% | measured |

The scene is an immediate-mode framebuffer: each 250 ms the room draws every pixel again and writes one SVG path for each palette colour (`src/operator-web/office-scene.ts:20-114,736-830`, `BoardOffice.tsx:233,544`). It costs seven times the list layout and does not delay data.

## 2. Board office state machines (as built)

| Machine | States and inputs | Code | Finding |
|---|---|---|---|
| Request lifetime (browser) | Timer, active, queued, hidden. `failures` 0, 1, 2 set the interval to 30, 60, 120 s. A hidden tab aborts the request. | `useObservationRefresh.ts:16-62` | The caller decides what a failure is. Two rules exist (section 5.1). |
| Read view (browser) | `loading`, `ready`, `ready` with `refreshFailed`, `failed(reason)` | `board-view.ts:58-85,114-132`, `board-office.ts:229-279` | Three policies for one board page: the board keeps the last value for six reasons, the parents list never keeps it, the overview drops all on a hidden tab. |
| Board routes (server) | No state. Admit under the cap, start the child, then answer, refuse, or end at 90 s. A client that leaves aborts the child. | `server.ts:1048-1092`, `board-read.ts:132-207` | Each observation starts from zero. |
| Desk state | A priority list, not a transition system: `blocked`, `error`, `unknown`, `ci_failed`, `ci_pending`, `acceptance_queue`, `no_claim_status`, `coding`, `done`, `idle`. Inputs: the hc status word (7 classes), the issue and pr labels, the required check (4 values), the acceptance, the claim status. | `src/core/board/desk.ts:18-70` | One authority in core; the room and the stored summary share it. The inputs change at different rates: the status word in seconds, the pull request facts in minutes. |
| Item stage (list layout) | `building`, `verifying`, `ready`, `closed` | `board-view.ts:134-148` | A second vocabulary over the same pull request facts. |
| Advisor turn and boss command | Turn: `over`, `running`, `unknown` from the status word. Command: idle, confirm, sending, then accepted (15 s effect, 30 or 60 minute cooldown) or refused (notice). The server owns the cooldown and the turn lock. | `src/core/board/advisor-seat.ts:66-109`, `src/operator-web/office-boss.ts:35-63` | The server checks the turn and the cooldown on each send. The button lock in the browser reads the status word of the last parents read, so it is as old as that read. |
| Scene | A pure function of the room, the frame number and the time since a boss command. The boss walks a path with cuts at 0, 2.5, 7.5 or 11.5, 12.5 and 15 s. | `office-scene.ts:439-445,551-574` | Stateless. A desk state change has no transition: the sprite changes in one frame. |

## 3. Architecture views: observed defects

Renders of the recorded map (200 nodes, 328 relations, 31 flows, 151 capability import edges with 1,923 imports, 143 different capability pairs with a declared relation) at 1600 × 1000 and 1920 × 1200.

| View | Observation | Cause |
|---|---|---|
| Topology | Opens on Namespaces: one box on an empty canvas. Mount layers has no box. The model has 1 namespace, 0 mounts and 14 processes. | The first segment is a constant (`src/operator-web/ArchitectureMap.tsx:290`), not the segment that has boxes. |
| Topology, Processes | The first row of boxes is cut at the top, the right part is off the canvas, and more than half of the canvas is empty. 113 relations are not drawn, because one end runs in no declared process. | The first viewport is 85% zoom at the first top-level box in model order (`ArchitectureTopology.tsx:186-189`, `architecture-map-parts.tsx:20-30`). dagre does not put that box at the top-left. |
| Sequence | The sixth participant is cut at the right edge. Message labels end in "…". | The same fixed first viewport (`ArchitectureSequence.tsx:186,256`); each participant column is 220 px (`architecture-sequence-layout.ts:12`). |
| Modules | 12 edges for 143 capability pairs. The edges have no arrow head, and each one sums both directions. External systems are 11 pills with no edge. | One edge for each domain pair (`architecture-modules-layout.ts:28,107-124`); no `markerEnd` (`ArchitectureModules.tsx:312-317`). |
| Modules, one card selected | Each relation is a curve from the bottom centre of the selected card to the top centre of the other card. The curves cross the card titles and loop above their targets. They show no direction and no kind. | The edge is always `selected → neighbour` between the fixed bottom and top handles, with the default curve (`ArchitectureModules.tsx:122-123,325-328`). |
| Modules | At 1600 × 1000 the legend covers the last domain group. | `fitView` with `minZoom: 0.6` (`ArchitectureModules.tsx:351-353`). |
| Modules | Each card has five numbers with no label. An 11 px legend line gives their order. | Five fixed slots (`ArchitectureModules.tsx:56,129-132,153`). |
| Layers | Eight rows, each one line of names cut with "…", no edge until a row is selected. | By design of the layout (`architecture-layers-layout.ts:1-7`). |
| Export SVG | The file is not the picture on screen: the topology export draws a straight line between box centres, with fixed light colours. | A second renderer for each view (`architecture-topology-layout.ts:265-303`, `architecture-layers-layout.ts:136-173`, `architecture-sequence-svg.ts`). |
| `docs/architecture/archimap.html` | On the runtime topology board, edge labels sit on arrows ("stdio", "spawns") and long edges pass behind boxes. | An agent places each box and line by hand at pixel coordinates. The check is "look at each board" (`assets/skills/repo-harness-archimap/SKILL.md`, step 7). `scripts/measure.ts` checks coverage, not geometry. |

Earlier owner reports of the same kind were fixed in one layout module each (#1662: grey map, one row of capabilities, lines that cross boxes).

## 4. Architecture views: pipeline and state machines (as built)

| Part | Shape | Code |
|---|---|---|
| Collector | Per repository: `architecture_map_pending`, then `ready(map)` or `unavailable(reason)`. One cycle each 5 minutes, one repository at a time, one child process each. A failed child keeps no older map. GET reads the cache and starts no work. | `src/effects/operator/architecture-map-collector.ts:1-13,38,96-170` |
| Map contract | One document with about 12 parts, each `ok` or `unavailable(reason)`: sizes, dependencies, layer order, changes, five violation parts, pull requests, tests, decisions | `src/core/operator/architecture-map.ts` |
| Browser read | `null`, `ok`, `unavailable`. The browser keeps the last map of the repository through a failed refresh; the server does not. A `pending` answer counts as a failure, so the next read is 60 s later. | `ArchitectureMap.tsx:51-65,292-295` |
| View state | view (6) × lens (5) × pull request × flow × topology segment (3) × legacy (2) × selection. Only the module id is in the URL. The selection lives in each canvas and is lost on a tab change. | `ArchitectureWorkspace.tsx:294`, `ArchitectureMap.tsx:286-291` |
| Draw | Model → one layout module → React Flow nodes and edges → DOM. The export goes model → the same layout → a separate SVG string. | below |

The data side is sound: one collector, typed gaps, counts that come only from archctx and git. The draw side repeats itself:

| Repeated part | Copies | Files |
|---|---|---|
| Graph canvas | 5 on React Flow, and a sixth graph in plain SVG | History, Layers, Modules, Sequence, Topology; `ModuleGraph.tsx` |
| Layout | 5 modules: two call dagre, three place boxes by hand; `ModuleGraph.tsx` has its own three-column layout | `architecture-{map,topology}-layout.ts`; `architecture-{modules,layers,sequence}-layout.ts` |
| Selection reducer (`onNodesChange`) | 4 | Layers, Modules, Sequence, Topology |
| Legend component | 4 | the same |
| First viewport rule | 2: `fitView` with three option sets; `firstViewport` | Modules, Layers, History; Sequence, Topology |
| SVG exporter with its own `STYLE`, `escape` and arrow marker | 3 | layers, sequence, topology |
| `download` helper | 3 | Layers, Sequence, Topology |
| "What a lens marks" | 2 | `modulesLayerView`, `mapLayerView` in `architecture-map-layers.ts` |

The page is 17 TypeScript files and 4,397 lines.

Three structural causes follow from this table.

1. **The layout owns boxes, React Flow owns edges.** Each layout module "computes positions only". The edge path comes from React Flow at paint time, between fixed handles. dagre computes edge points; both call sites read only the node centres (`architecture-map-layout.ts:176-182`, `architecture-topology-layout.ts:161-165`). The Layers view is the exception: its layout gives the lane points, and a custom edge draws them (`ArchitectureLayers.tsx:60-66`).
2. **No check can see the result.** `tests/operator-web/operator-architecture.test.tsx` runs in happy-dom: "In happy-dom React Flow draws no edge" (`:1376`). The layout tests check only that boxes do not overlap. No test loads a page in a browser.
3. **The first state is the artboard's state.** The lens opens on today's changes (`ArchitectureMap.tsx:286`) and the topology on the namespace segment (`:290`), whatever the model holds.

## 5. Abstraction options

### 5.1 One observation loop

The same job, "read an authority, keep the value with its observation time, serve reads", has three implementations.

| Where | Copies | State machine | Divergence |
|---|---|---|---|
| Resident collectors in `operator serve` | 11: dev activity, architecture map, bot access, docs, execution, notify, Slack review, tests, worktree, setup, CLI inventory | `closed`, `timer`, `inflight`, `started`; `cycle()` schedules the next cycle after the previous one settles; `read`, `settled`, `close` | Each file decides alone whether a failed cycle keeps the older value. |
| Browser reads on `useObservationRefresh` | 20 call sites in 15 files | `loading`, `ready`, `failed`, with or without a kept value | Six reads treat a typed refusal as an answer (`repository-reads.ts:102,208,244,313`, `bots.ts:59`, `settings.ts:215`). The board, parents, overview and architecture map reads treat it as a failure (`board-view.ts:78,127`, `board-office.ts:269`, `ArchitectureMap.tsx:61`). |
| Board routes | 1 | none | A complete read for each GET. |

Effect of the divergence: one registered repository whose parents read gives a typed refusal in each cycle (for example a repository with no GitHub remote) moves the complete overview to a 120 s cycle.

Option: one server component (`pending`, `observed(value, observed_at)`, `unavailable(reason)`; cycle, abort and close; the keep rule as a parameter) and one browser hook with one failure rule: only a request with no typed answer backs the loop off. The reuse is observed, not expected: 11 and 20 copies, one defect from the divergence. `BoardExecutionV1`, `BoardDailyRunV1`, `BoardPathOwnersV1`, `BoardToolingV1` and `BoardPlanV1` already have this `observed` or `unavailable` shape (`src/core/board/board.ts:47-51,216-241`).

The shared loop is the one part with concurrent ends (cycle, abort, close, a hidden tab), so it is a candidate for a behavior spec. The model already carries one (`extensions.behaviorSpecs` on `component.contract-assets.contract-worktree-lifecycle`, `specs/tla/ShipCloseoutClaim.tla`), and the archimap draws it as a statechart board.

### 5.2 A board that is a join of observed sources

`projectBoard` is already a pure join of ten separate inputs (`BoardInputV1`, `board.ts:266-278`). Only `collectBoard` binds them into one synchronous pass with one `observed_at`. The cheapest and fastest source, the seat status, can therefore refresh only at the cost of the slowest one.

| Source | Authority | Changes | Key that makes a new read necessary |
|---|---|---|---|
| Seat terminals | hc | seconds | The hc event stream. `hcEvents` exists (`herdr-core.ts:464-486`), and `operator serve` already holds one subscription for task sessions with reconnect and a snapshot read (`src/effects/operator/herdr-runtime-transport.ts:26-111`). |
| Parent, sub-issues, comments | GitHub | minutes | Time, 30 to 60 s |
| Pull requests and check rollup | GitHub | minutes | Time, 30 to 60 s |
| Merge readiness | GitHub, 11 to 15 calls each | When the head, the base, the checks or the reviews change | A digest of the pull request read: head, base, check rollup, review decision |
| Repository identity | GitHub | never | Once for each registry entry |
| Facts of the base commit: policy file, rollback boundary | GitHub | When the default branch moves | The base SHA |
| Merge-only sync proof | git | never for one (head, base, reviewed head) | Content address; the answer does not change |
| Path owners | archctx | When the changed files or the model change | A cache with this key exists for hooks (`src/effects/architecture/archcontext-resolve-cache.ts`) |
| Daily run | GitHub | once a day | Time, 10 minutes |
| hc version | hc | never in one process | Once |

With these keys, a refresh of a board with no change is 2 GraphQL calls, and a seat change needs no GitHub call. The stored summary becomes a projection of the resident board, so the overview shows the same observation as the room.

Constraints:

- ADR-0002 allows a display copy that holds its observation time (rule 2). A join of sources has one observation time for each source, not one for the board. That is a new board protocol.
- An act (`board merge`, `publication merge`, `board review`) must keep its own complete read. The display copy never feeds an act.
- The reason that `board-read.ts:11-15` gives for the child process is out of date. `herdr-core.ts` is the core-tier node `component.execution-primitives.hc-client` since #1626, it is not a target of `constraint.surface.plugin-internals`, and the operator already imports it (`execution-collector.ts:21`, `herdr-runtime-transport.ts:7`). The reason that still holds is the synchronous collector: it would stop the server event loop. The other collectors solve that with a supervised child for each cycle.
- The readiness read is half written as request generators with one synchronous driver (`merge-readiness.ts:727-741`, `:569`, `:686`, `:779`, `:879`, `:1062`). The same reader can serve N pull requests at the same time when the top level becomes a generator too; a second reader is not necessary.

### 5.3 One diagram pipeline

| Stage | Today | Option |
|---|---|---|
| Projection | Inside each layout module | A pure function for each view: map → scene (nodes, groups, directed edges with kind and weight) |
| Layout | Boxes only | Boxes, edge points and label boxes in one placed scene. dagre already gives edge points; a compound graph gives the domain and process groups. |
| Canvas | 5 components | One shell: selection, viewport, legend, zoom, export, keyboard. One edge type that draws the placed points, as Layers does now. |
| Viewport | 2 rules | One rule: fit the content; when the fit is below the reading zoom, open at the reading zoom on the top-left of the content box, not on one node. |
| Export | A second renderer | The same placed scene as an SVG string, so the file is the picture. |
| Check | Box overlap only | A pure check of the placed scene in Bun: no box overlap, no edge through a box that is not its end, each label inside the canvas and clear of boxes, the first viewport holds the first rank. One browser smoke test that loads each view on the recorded map. |
| View state | `useState` in two components and in each canvas | One reducer; view, lens, segment and selection in the URL fragment |
| First state | Constants | From the data: the first lens that marks a node, the topology segment with the most boxes |

The sequence view is not a graph layout. It keeps `layoutSequence` and takes the shell, the viewport rule, the export and the check.

`archimap.html` is a fourth renderer of the same model. The small step is a geometry check script beside `measure.ts` (box overlap, text overflow, a line end that touches no box, a label on a line). The large step is to make its boards from the placed scene.

### 5.4 Order and predicted effect

| # | Change | Size | Predicted effect |
|---|---|---|---|
| 1 | The room draws the seats of the parents read at once; the board facts follow | small | First desk after `T(parents)`, not after `T(parents) + T(board)` |
| 2 | The parents answer carries the stored summaries; remove the summaries route | small | One CLI run less for each active repository in each overview cycle |
| 3 | One failure rule for the browser loop | small | No 60 s or 120 s cycle from a typed refusal; the first architecture map shows at most 30 s after it is ready |
| 4 | The overview keeps its cards on a hidden tab and shows their age | small | No reload from zero on return |
| 5 | One viewport rule; data-driven first lens and first segment | small | No cut or empty first view |
| 6 | Directed edges from layout points in Modules and Topology; one edge type | medium | Readable relations; edge geometry exists outside a browser |
| 7 | Placed-scene check in Bun and one browser smoke test | medium | Defects of section 3 fail a check |
| 8 | Read the 8 shared answers of the readiness reads once for each board read | medium | 5 N + 8 calls, not 15 N: 23, not 45, for 3 pull requests |
| 9 | Resident board observer in `operator serve` with keyed sources, hc events and ETag answers | large | A board with no change costs 2 calls; a seat change reaches the desk at the poll interval of a cached route |
| 10 | Shared collector and browser hook (5.1); one canvas shell and scene pipeline (5.3) | large, mostly mechanical | One place for each rule |

Steps 1 to 5 change no boundary. Steps 8 to 10 change the board protocol or a module boundary and need an issue with the design first.

## 6. Other defects found

| Defect | Evidence |
|---|---|
| `bun run dev:operator` cannot render a page since #2105 (`7261466`). The browser stops at "Module crypto has been externalized". | `src/core/board/board.ts:6` imports `modelFamily` from `../review/acceptance-receipt`, and that file imports `createHash` from `crypto` at line 4. The production build removes the unused import, so only the dev server fails. The fixture mode is the only fast visual loop for both pages. |
| A board GET can run `git fetch`. | `merge-only-sync.ts:112`. `GIT_NO_LAZY_FETCH` (`server.ts:551`) does not stop an explicit fetch. |
| Seat read is 1 + N `hc` processes and N `git` processes. | `herdr-core.ts:508-509`, `collect.ts:168-170` |
| `board seats --json` reads the seats without the open issue list, and no route uses it. | `src/effects/board/seats.ts:23-40`, `src/cli/commands/board.ts:208-220` |

## 7. Limits

- No read ran against GitHub GraphQL or hc here. The call counts are exact; the times are products of a `gh` round trip measured through this container's proxy.
- The counts are for a required check that passed, with no coverage policy, no generated-artifact policy and no stacked pull request. A failed required check adds reads of its jobs, workflow file and annotations (`merge-readiness.ts:569-683`). An active generated-artifact policy runs the declared command on the merge tree in each readiness read (`merge-readiness.ts:858-876`).
- The CPU numbers are from headless Chromium, which has no compositor on a display.
- The architecture renders use one model. A model with no layer order or no process nodes takes other layout paths.
- History and the module detail graph were not rendered: they read routes that the fixture does not serve.

## Reproduce

- Call counts: call `collectBoard` and `collectPullRequestMergeReadiness` with a `gh_runner` that records its arguments (`tests/board.test.ts:107-150`, `tests/unit/merge-readiness-v1-effect.test.ts:54-124` have the doubles).
- Renders: `bun run dev:operator`, then `/?fixture=office#board/office` and `/?fixture=busy#architecture` with the `repo-harness` repository selected. The dev server needs a browser stand-in for `crypto` until the first defect of section 6 is fixed.
- Scene cost: time `composeRoom` and `composeMiniRoom` in Bun; in Chromium read `Performance.getMetrics` over 10 s on a production build that keeps the fixtures.
