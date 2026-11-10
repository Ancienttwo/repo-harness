----------------------- MODULE ArchitectureFirstMapFlow -----------------------
(*
The flow "open the architecture page and get the map of one repository".

Part                     code (base c9af3b0)
the collector cycle      src/effects/operator/architecture-map-collector.ts, lines 126-153
the answer of a GET      architecture-map-collector.ts read, lines 156-160
the page read            src/operator-web/ArchitectureMap.tsx useArchitectureMap, lines 51-65
the kept map             ArchitectureMap.tsx, lines 292-295 and 312-313
the wait of a read       src/operator-web/useObservationRefresh.ts, lines 31 and 44

Scope: one repository of a registry with more repositories, a visible tab.
`result` is the result of this repository in the cycle in flight. `served` is
the answer of a GET. `answer` is the last answer that the page got. `kept` is
TRUE when the page holds a map. `wait` is the exponent of the next wait: 0 is
30 s, 1 is 60 s, 2 is 120 s. ResidentCollector.tla holds the collector guards.

PublishEachChild and PendingIsFailure select a design. The code at the base
is FALSE and TRUE. PendingIsFailure = FALSE is the read rule of issue #2151.
ChildCanFail = FALSE leaves the failed child out, for a chart of the main path.
*)
EXTENDS Naturals

CONSTANTS PublishEachChild, PendingIsFailure, ChildCanFail

VARIABLES cycle, result, served, answer, kept, wait

vars == <<cycle, result, served, answer, kept, wait>>

Init ==
  /\ cycle = "waiting" /\ result = "none" /\ served = "pending"
  /\ answer = "none" /\ kept = FALSE /\ wait = 0

PullRequestListIsReady ==
  /\ cycle = "waiting" /\ cycle' = "this"
  /\ UNCHANGED <<result, served, answer, kept, wait>>

MapOfThisRepositoryIsBuilt ==
  /\ cycle = "this" /\ cycle' = "others" /\ result' = "ready"
  /\ served' = IF PublishEachChild THEN "ready" ELSE served
  /\ UNCHANGED <<answer, kept, wait>>
MapOfThisRepositoryFails ==
  /\ ChildCanFail /\ cycle = "this" /\ cycle' = "others" /\ result' = "unavailable"
  /\ served' = IF PublishEachChild THEN "unavailable" ELSE served
  /\ UNCHANGED <<answer, kept, wait>>

CycleEnds ==
  /\ cycle = "others" /\ cycle' = "idle" /\ served' = result
  /\ UNCHANGED <<result, answer, kept, wait>>
NextCycleStarts ==
  /\ cycle = "idle" /\ cycle' = "this" /\ result' = "none"
  /\ UNCHANGED <<served, answer, kept, wait>>

PageReads ==
  /\ answer' = served /\ kept' = (kept \/ served = "ready")
  /\ wait' = IF served = "ready" \/ (served = "pending" /\ ~PendingIsFailure) THEN 0
             ELSE IF wait < 2 THEN wait + 1 ELSE 2
  /\ UNCHANGED <<cycle, result, served>>

Next == PullRequestListIsReady \/ MapOfThisRepositoryIsBuilt \/ MapOfThisRepositoryFails
        \/ CycleEnds \/ NextCycleStarts \/ PageReads

Spec == Init /\ [][Next]_vars

\* The result that the collector has for this repository is the answer of a GET.
BuiltMapIsServed == result # "none" => served = result
\* After the answer "not collected yet", the next read comes after 30 s.
PendingKeepsCadence == answer = "pending" => wait = 0
=============================================================================
