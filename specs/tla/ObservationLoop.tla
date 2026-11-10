--------------------------- MODULE ObservationLoop ---------------------------
(*
Action                 src/operator-web/useObservationRefresh.ts (base c9af3b0)
Init                   the effect body, lines 16-55: request() or schedule()
Request                request, lines 33-48 (up to the start of the read)
Schedule               schedule, lines 28-32
ReadOk, ReadRefused,
ReadUnreachable        the settle handler of an un-aborted read, lines 41-47
AbortedReadSettles     the same handler for a read whose controller is aborted
TimerFires             the setTimeout callback of line 31
Refresh                the returned callback, line 63
Hide, Show             visibilityChanged, lines 49-52
Unmount                the effect cleanup, lines 56-61

One step of the model is one JavaScript task or microtask. The browser runs
each to its end, so no other step interleaves inside it.

Scope: one effect instance, from its start to its cleanup. A change of `read`,
`identity`, `enabled` or `immediate` is a cleanup and a new instance.
`live` counts the unsettled read whose controller is not aborted (0 or 1: each
new read aborts the one before it, line 38). `dead` counts unsettled reads
whose controller is aborted. `last` is a history variable: the outcome of the
last settled read that was not aborted.

RefusalIsFailure is the rule of the reader, not of the hook: TRUE when the
reader returns false for a typed refusal of the server.
*)
EXTENDS Naturals

CONSTANTS GuardActive, RequeueOnSettle, ScheduleOnSettle, HideAborts, RefusalIsFailure

VARIABLES visible, disposed, active, live, dead, timer, interval, queued, failures, last

vars == <<visible, disposed, active, live, dead, timer, interval, queued, failures, last>>

Cur == [visible |-> visible, disposed |-> disposed, active |-> active, live |-> live,
        dead |-> dead, timer |-> timer, interval |-> interval, queued |-> queued,
        failures |-> failures, last |-> last]

Is(s) ==
  /\ visible = s.visible /\ disposed = s.disposed /\ active = s.active
  /\ live = s.live /\ dead = s.dead /\ timer = s.timer /\ interval = s.interval
  /\ queued = s.queued /\ failures = s.failures /\ last = s.last

Become(s) ==
  /\ visible' = s.visible /\ disposed' = s.disposed /\ active' = s.active
  /\ live' = s.live /\ dead' = s.dead /\ timer' = s.timer /\ interval' = s.interval
  /\ queued' = s.queued /\ failures' = s.failures /\ last' = s.last

ClearTimer(s) == [s EXCEPT !.timer = FALSE, !.interval = 0]

Request(s) ==
  IF s.disposed THEN s
  ELSE LET c == ClearTimer(s) IN
       IF ~c.visible \/ (GuardActive /\ c.active)
       THEN [c EXCEPT !.queued = TRUE]
       ELSE [c EXCEPT !.queued = FALSE, !.active = TRUE, !.dead = c.dead + c.live, !.live = 1]

Schedule(s) ==
  IF s.disposed \/ s.active \/ ~s.visible THEN s
  ELSE [s EXCEPT !.timer = TRUE, !.interval = s.failures]

AfterSettle(s) ==
  IF s.disposed THEN s
  ELSE IF RequeueOnSettle /\ s.queued /\ s.visible THEN Request(s)
  ELSE IF ScheduleOnSettle THEN Schedule(s)
  ELSE s

Success(outcome) == outcome = "ok" \/ (outcome = "refused" /\ ~RefusalIsFailure)

\* The state after the settle handler of the un-aborted read, lines 41-47.
Settled(outcome) ==
  LET s0 == [Cur EXCEPT !.live = 0, !.active = FALSE]
      s1 == IF s0.disposed THEN s0
            ELSE [s0 EXCEPT !.failures = IF Success(outcome) THEN 0
                                         ELSE IF s0.failures < 2 THEN s0.failures + 1 ELSE 2,
                            !.last = outcome]
  IN AfterSettle(s1)

Blank(v) == [visible |-> v, disposed |-> FALSE, active |-> FALSE, live |-> 0, dead |-> 0,
             timer |-> FALSE, interval |-> 0, queued |-> FALSE, failures |-> 0, last |-> "none"]

Init == \E v \in BOOLEAN, immediate \in BOOLEAN :
          Is(IF immediate THEN Request(Blank(v)) ELSE Schedule(Blank(v)))

ReadOk == live = 1 /\ Become(Settled("ok"))
ReadRefused == live = 1 /\ Become(Settled("refused"))
ReadUnreachable == live = 1 /\ Become(Settled("unreachable"))
AbortedReadSettles == dead > 0 /\ Become(AfterSettle([Cur EXCEPT !.dead = dead - 1, !.active = FALSE]))
TimerFires == timer /\ Become(Request(Cur))
Refresh == ~disposed /\ Become(Request(Cur))
Hide ==
  /\ visible /\ ~disposed
  /\ LET c == ClearTimer(Cur) IN
     Become([c EXCEPT !.visible = FALSE, !.queued = FALSE,
                      !.dead = IF HideAborts THEN c.dead + c.live ELSE c.dead,
                      !.live = IF HideAborts THEN 0 ELSE c.live])
Show == ~visible /\ ~disposed /\ Become(Request([Cur EXCEPT !.visible = TRUE]))
Unmount ==
  /\ ~disposed
  /\ LET c == ClearTimer(Cur) IN
     Become([c EXCEPT !.disposed = TRUE, !.dead = c.dead + c.live, !.live = 0])
Done == disposed /\ live + dead = 0 /\ UNCHANGED vars

Next == ReadOk \/ ReadRefused \/ ReadUnreachable \/ AbortedReadSettles \/ TimerFires
        \/ Refresh \/ Hide \/ Show \/ Unmount \/ Done

Spec == Init /\ [][Next]_vars

Bound == dead <= 2

\* "A promise must retire before the same loop can start its queued request."
OneUnsettledRead == live + dead <= 1
\* A visible page with no read in flight has its next read on a timer.
LoopAlive == (~disposed /\ visible /\ live + dead = 0) => timer
\* A refresh that arrives during a read runs when that read settles.
NoLostRefresh == (queued /\ ~disposed) => (~visible \/ live + dead > 0)
\* A hidden page has no read whose answer it will use, and no timer.
HiddenIsQuiet == ~visible => (live = 0 /\ ~timer)
\* After the cleanup the instance starts nothing.
DisposedIsQuiet == disposed => (live = 0 /\ ~timer)
\* "A typed refusal is an answer; only a request with no answer backs the loop off."
RefusalKeepsCadence == (timer /\ last = "refused") => interval = 0
=============================================================================
