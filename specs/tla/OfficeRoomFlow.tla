--------------------------- MODULE OfficeRoomFlow ---------------------------
(*
The flow "watch one room of the Office": two reads and the screen.

Part                   code (base c9af3b0)
the parents view       src/operator-web/board-view.ts useBoardParents, lines 114-132
the board view         board-view.ts useBoard, lines 58-85, and STALE_BOARD_KEPT, 53-55
screen                 src/operator-web/BoardPage.tsx OfficeRepository, lines 449-468

Scope: one repository with an active parent, a visible tab, no boss command.
The wait between two reads is in ObservationLoop.tla, not here.
`stored` is the board that the page holds. `seatsSeen` is a history variable.

RoomBeforeBoard and KeepSeats select a design. The code at the base is FALSE
and FALSE. RoomBeforeBoard is the screen rule of issue #2149.
*)
CONSTANTS RoomBeforeBoard, KeepSeats

VARIABLES parents, pRead, stored, bRead, screen, seatsSeen

vars == <<parents, pRead, stored, bRead, screen, seatsSeen>>

HasSeats(p) == p \in {"ready", "stale"}
BoardView(p, s) == IF HasSeats(p) THEN (IF s = "none" THEN "loading" ELSE s) ELSE "off"

ScreenOf(p, s) ==
  IF p = "failed" THEN "checklist"
  ELSE IF p = "loading" THEN "loading"
  ELSE IF BoardView(p, s) = "loading" THEN (IF RoomBeforeBoard THEN "room" ELSE "loading")
  ELSE IF BoardView(p, s) = "failed" THEN (IF KeepSeats THEN "room" ELSE "board-failure")
  ELSE "room"

Init ==
  /\ parents = "loading" /\ pRead = TRUE /\ stored = "none" /\ bRead = FALSE
  /\ screen = "loading" /\ seatsSeen = FALSE

\* The board loop runs only while the page has a parents list.
AfterParents(p) ==
  /\ parents' = p /\ pRead' = FALSE
  /\ bRead' = IF HasSeats(p) /\ ~HasSeats(parents) THEN TRUE ELSE IF ~HasSeats(p) THEN FALSE ELSE bRead
  /\ screen' = ScreenOf(p, stored)
  /\ seatsSeen' = (seatsSeen \/ ScreenOf(p, stored) = "room")
  /\ UNCHANGED stored

ParentsReadOk == pRead /\ AfterParents("ready")
ParentsReadFails == pRead /\ AfterParents(IF KeepSeats /\ HasSeats(parents) THEN "stale" ELSE "failed")
ParentsTimer == ~pRead /\ pRead' = TRUE /\ UNCHANGED <<parents, stored, bRead, screen, seatsSeen>>

AfterBoard(s) ==
  /\ stored' = s /\ bRead' = FALSE
  /\ screen' = ScreenOf(parents, s)
  /\ seatsSeen' = (seatsSeen \/ ScreenOf(parents, s) = "room")
  /\ UNCHANGED <<parents, pRead>>

BoardReadOk == bRead /\ AfterBoard("ready")
\* A reason of STALE_BOARD_KEPT keeps a board that the page holds.
BoardReadFailsKept == bRead /\ AfterBoard(IF stored \in {"ready", "stale"} THEN "stale" ELSE "failed")
BoardReadFailsDropped == bRead /\ AfterBoard("failed")
BoardTimer == HasSeats(parents) /\ ~bRead /\ bRead' = TRUE /\ UNCHANGED <<parents, pRead, stored, screen, seatsSeen>>

Next == ParentsReadOk \/ ParentsReadFails \/ ParentsTimer
        \/ BoardReadOk \/ BoardReadFailsKept \/ BoardReadFailsDropped \/ BoardTimer

Spec == Init /\ [][Next]_vars

\* When the page has the parents list, the seats are on screen.
SeatsShowWithParentsList == HasSeats(parents) => screen = "room"
\* After the seats were on screen, a failed read does not remove them.
SeatsStayOnScreen == seatsSeen => screen = "room"
=============================================================================
