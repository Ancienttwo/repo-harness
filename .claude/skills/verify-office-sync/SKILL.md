---
name: verify-office-sync
description: "TLA+ model checks of the console read loop and the Office room screen. Use before you change src/operator-web/useObservationRefresh.ts, a reader that calls it (board-view.ts, board-office.ts, ArchitectureMap.tsx, repository-reads.ts), or the room gate of OfficeRepository in src/operator-web/BoardPage.tsx."
---

# Verify the Office sync

Two models describe the code at the sync commit. `ObservationLoop.tla` is the request lifetime of one `useObservationRefresh` instance: 20 console reads use it. `OfficeRoomFlow.tla` is the screen of one room as a function of its two reads.

Sync commit: `c9af3b06c3361b4e46b5254d1629e0537acccac0` (main). Move it forward only after each row of the coverage record is true for the new code.

## What is checked

| Rule | Sentence | Harm when it breaks | State |
|---|---|---|---|
| `OneUnsettledRead` | One loop has at most one read that has not ended. | A second board CLI run starts while the first holds a slot of the cap of 4. | holds |
| `LoopAlive` | A visible page with no read in flight has a timer for the next read. | The page stops its refresh until a reload. | holds |
| `NoLostRefresh` | A refresh that arrives during a read runs when that read ends. | The Refresh button waits for the next timer, up to 120 s. | holds |
| `HiddenIsQuiet` | A hidden tab has no read whose answer it uses, and no timer. | Each hidden console tab starts a board CLI run each 30 s. | holds |
| `DisposedIsQuiet` | After the cleanup the instance starts nothing. | A page that the person left reads on. | holds |
| `RefusalKeepsCadence` | After a refusal that the server typed, the next read comes after 30 s. | One typed refusal moves the room, or the complete overview, to a 60 s or 120 s cycle. | finding: #2149, #2151 |
| `SeatsShowWithParentsList` | When the page has the parents list, the seats are on screen. | The room shows a loading screen for the time of the board read (36 `gh` processes for the recorded #1474 board). | finding: #2149 |
| `SeatsStayOnScreen` | After the seats were on screen, a failed read does not remove them. | One failed parents refresh replaces the room with the setup checklist until the next read, 60 s later. | finding: candidate rule, the owner decides |

`OfficeRoomFlow.issue-2149.cfg` is the screen rule of #2149: `SeatsStayOnScreen` still breaks there. `OfficeRoomFlow.keep-seats.cfg` is a design in which both screen rules hold.

## Coverage record

| Model part | Code |
|---|---|
| `Request`, `Schedule`, the settle handler, `Hide`, `Show`, `Unmount` | `src/operator-web/useObservationRefresh.ts:16-62` |
| `GuardActive` | line 36, `\|\| active` |
| `RequeueOnSettle`, `ScheduleOnSettle` | lines 45-46 |
| `HideAborts` | line 51, `latest?.abort()` |
| `RefusalIsFailure = TRUE` | `src/operator-web/board-view.ts:78,127`, `src/operator-web/board-office.ts:269`, `src/operator-web/ArchitectureMap.tsx:61` |
| `RefusalIsFailure = FALSE` | `src/operator-web/repository-reads.ts:102,208,244,313`, `src/operator-web/bots.ts:59`, `src/operator-web/settings.ts:215` |
| the parents view, the board view | `src/operator-web/board-view.ts:53-85,114-132` |
| `ScreenOf` | `src/operator-web/BoardPage.tsx:449-468` |

A change touches the verified code when `git diff c9af3b06c3361b4e46b5254d1629e0537acccac0 -- src/operator-web/useObservationRefresh.ts src/operator-web/board-view.ts src/operator-web/BoardPage.tsx` is not empty, or when a new reader calls `useObservationRefresh`.

## Run

```sh
TLA2TOOLS_JAR=<tla2tools.jar of TLA+ v1.7.4> bash specs/tla/check.sh ObservationLoop OfficeRoomFlow
```

The run takes about 5 s and needs Java 11 or later. The script takes the version and the SHA-256 of the jar from `scripts/contract-closeout-tla.sh`. `specs/tla/checks.tsv` holds the expectation of each config: `holds`, `breaks` (one guard is off, and TLC must report the named rule) or `finding` (the code breaks these rules now).

Read each result with the pstack `/statechart` skill. It tells the shortest path to each broken rule in the words of the view module beside the spec (`ObservationLoop.view.mjs`, `OfficeRoomFlow.view.mjs`), and it draws the chart.

## Change the code

1. Find the changed lines in the coverage record and in the header of the spec.
2. Change the model first, from the code: the action, or the constant of the guard. Do not shape it by the result.
3. Run the check.
   - A `holds` config fails: replay the counterexample against the code, one step for each action. When each step can occur, the change has a bug. When a step cannot occur, the model is wrong: correct the model and say what was wrong.
   - A `breaks` config passes: the model lost the ability to fail. Find the guard in the new code and model it.
   - A `finding` config holds: the change repaired the finding. Set its row in `checks.tsv` to `holds` and name the PR.
4. Set the sync commit to the commit that you checked.

`/maintain-formal-verification-skill` brings the models back in line after changes that did not use this skill.

## Evidence at the sync commit

The unit tests catch each of the four guard removals (`tests/operator-web/operator-interactions.test.tsx`, `bounded observation lifecycle`: 2, 2, 4 and 1 of 5 cases fail). The model adds each order of the steps, and the rule of the reader.

## Not covered

- The server side of a read: the cap of 4, the child process and its 90 s limit (`src/effects/operator/server.ts:1048-1092`, `src/effects/operator/board-read.ts:132-207`).
- The overview loop (`useOfficeOverview`) and its hidden-tab rule.
- Time: the model has the order of the waits, not their length.
- A room with no active parent, and the list layout.
