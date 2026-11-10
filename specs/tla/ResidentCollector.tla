-------------------------- MODULE ResidentCollector --------------------------
(*
Action            src/effects/operator/architecture-map-collector.ts (base c9af3b0)
Boot              the first cycle, lines 152-153
TimerFires        the setTimeout callback of line 147
StartCycle        cycle, lines 126-133: the registry read and the first child
ChildReturns      the loop body after `await collect`, lines 133-143
Finish            the finally handler, lines 144-149
Close             close, lines 162-168
Served            read, lines 156-160

One step of the model is one JavaScript task or microtask of `operator serve`.
The child runs in another process: its start and its return are two steps.

Scope: one collector and a registry that always lists two repositories, in
the order of `Order`. A registry read can fail. A child returns `ready` or `unavailable`;
the content of a map is out of scope. `next` holds the results of the cycle in
flight. `states` is the published map. `overlap`, `childAfterClose` and
`publishAfterClose` are history variables.

PublishEachChild is a design variant, not the code: FALSE is the code at the
base. Each other constant turns one guard of the code off.
*)
EXTENDS Naturals, Sequences

CONSTANTS ArmAfterSettle, LoopChecksClosed, ArmChecksClosed, PublishChecksClosed,
          PublishEachChild

Repos == {"r1", "r2"}
Order == <<"r1", "r2">>

VARIABLES boot, closed, timer, inflight, todo, running, next, states, started,
          registryFailed, overlap, childAfterClose, publishAfterClose

vars == <<boot, closed, timer, inflight, todo, running, next, states, started,
          registryFailed, overlap, childAfterClose, publishAfterClose>>

None == [r \in Repos |-> "none"]

\* read(): the answer of a GET for repository r.
Served(r) ==
  IF registryFailed THEN "registry_unavailable"
  ELSE IF ~started THEN (IF PublishEachChild /\ states[r] # "none" THEN states[r] ELSE "pending")
  ELSE IF states[r] = "none" THEN "repository_not_found" ELSE states[r]

Init ==
  /\ boot = TRUE /\ closed = FALSE /\ timer = FALSE /\ inflight = FALSE
  /\ todo = <<>> /\ running = "none" /\ next = None /\ states = None
  /\ started = FALSE /\ registryFailed = FALSE
  /\ overlap = FALSE /\ childAfterClose = FALSE /\ publishAfterClose = FALSE

\* After the registry read or a child return: the loop head (line 134) when a
\* repository is left, else the end of the loop (lines 140-143).
\* `shown` is the published map before this step.
Continue(rest, results, shown) ==
  IF rest # <<>>
  THEN IF LoopChecksClosed /\ closed
       THEN /\ todo' = <<>> /\ running' = "none" /\ next' = results /\ states' = shown
            /\ UNCHANGED <<started, registryFailed, childAfterClose>>
       ELSE /\ todo' = Tail(rest) /\ running' = Head(rest) /\ next' = results /\ states' = shown
            /\ childAfterClose' = (childAfterClose \/ closed)
            /\ UNCHANGED <<started, registryFailed>>
  ELSE IF PublishChecksClosed /\ closed
       THEN /\ todo' = <<>> /\ running' = "none" /\ next' = results /\ states' = shown
            /\ UNCHANGED <<started, registryFailed, childAfterClose>>
       ELSE /\ todo' = <<>> /\ running' = "none" /\ next' = results
            /\ states' = results /\ started' = TRUE /\ registryFailed' = FALSE
            /\ UNCHANGED childAfterClose

StartCycle ==
  /\ overlap' = (overlap \/ inflight)
  /\ inflight' = TRUE
  /\ \/ /\ registryFailed' = TRUE
        /\ UNCHANGED <<todo, running, next, states, started, childAfterClose>>
     \/ Continue(Order, None, states)
  /\ publishAfterClose' = (publishAfterClose \/ (closed /\ states' # states))

Boot ==
  /\ boot /\ boot' = FALSE
  /\ IF closed
     THEN UNCHANGED <<inflight, todo, running, next, states, started, registryFailed,
                      overlap, childAfterClose, publishAfterClose>>
     ELSE StartCycle
  /\ UNCHANGED <<closed, timer>>

TimerFires ==
  /\ timer
  /\ timer' = ~ArmAfterSettle
  /\ StartCycle
  /\ UNCHANGED <<boot, closed>>

ChildReturns ==
  /\ running # "none"
  /\ \E result \in {"ready", "unavailable"} :
       LET results == [next EXCEPT ![running] = result]
           early == PublishEachChild /\ ~(PublishChecksClosed /\ closed)
           shown == IF early THEN [states EXCEPT ![running] = result] ELSE states
       IN Continue(todo, results, shown)
  /\ publishAfterClose' = (publishAfterClose \/ (closed /\ states' # states))
  /\ UNCHANGED <<boot, closed, timer, inflight, overlap>>

Finish ==
  /\ inflight /\ running = "none"
  /\ inflight' = FALSE /\ next' = None
  /\ timer' = IF ArmChecksClosed /\ closed THEN timer ELSE TRUE
  /\ UNCHANGED <<boot, closed, todo, running, states, started, registryFailed,
                 overlap, childAfterClose, publishAfterClose>>

Close ==
  /\ ~closed /\ closed' = TRUE /\ timer' = FALSE
  /\ UNCHANGED <<boot, inflight, todo, running, next, states, started, registryFailed,
                 overlap, childAfterClose, publishAfterClose>>

Done == closed /\ ~inflight /\ ~boot /\ ~timer /\ UNCHANGED vars

Next == Boot \/ TimerFires \/ ChildReturns \/ Finish \/ Close \/ Done

Spec == Init /\ [][Next]_vars

\* "Cycles never overlap."
NoOverlap == ~overlap
\* A closed collector starts no child.
NoChildAfterClose == ~childAfterClose
\* A closed collector publishes nothing.
NoPublishAfterClose == ~publishAfterClose
\* A closed collector with no cycle in flight has no timer.
ClosedIsQuiet == (closed /\ ~inflight) => ~timer
\* The result that a child returned is the answer of the next GET for its repository.
CollectedResultIsServed ==
  \A r \in Repos : (next[r] # "none" /\ ~registryFailed /\ ~closed) => Served(r) = next[r]
=============================================================================
