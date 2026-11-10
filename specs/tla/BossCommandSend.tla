--------------------------- MODULE BossCommandSend ---------------------------
(*
Action          code (base c9af3b0)
Admit           src/effects/operator/write-run.ts runOperatorWrite, lines 145-171:
                the target lock, the request lookup and the intent record; then
                src/effects/operator/advisor-seat-route.ts execute, lines 193-205:
                earlierSends (141-158), maySend (126-131) and the cooldown
ReadBack        advisor-seat-route.ts, lines 207-222: the read-back child and the turn
ChildSends      the `board advisor send` child runs `hc send`
ChildFails      the child stops with a code of ADVISOR_SEAT_NOT_SENT
                (src/core/board/advisor-seat.ts:55-59)
SendReturns     sendText, lines 83-100, and childFailure, lines 65-77
SendTimesOut    src/effects/operator/board-read.ts terminate, lines 172-181
Record          write-run.ts, lines 181-197: the result record and the lock release
Crash           `operator serve` dies at a step boundary
Tick            the clock of `now()` moves

Admit is one step: the lookup, the intent append, the read of the log and the
cooldown decision run with no `await` between them, under the target lock.
Record is one step for the same reason. A crash can come between any two steps.

Scope: one binding (one command, one repository, one parent), one server
process at a time, three calls. Calls c1 and c2 carry the same request_id
(c2 is a retry). Call c3 carries a new request_id. `Window` is the cooldown in
clock ticks. At most one crash.

Assumptions: a child that reports a NOT_SENT code did not run `hc send`. A
send child can outlive a crashed server and send later. The target lock gives
mutual exclusion between live runs, and a dead owner loses it. An append to
the audit log is complete or absent. The clock does not go back.

Out of scope: the free-text message route (it shares the target lock), two
sends that reach one seat at the same time, and the lock implementation.
*)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Window, MaxTime, UnresolvedCounts, ReconcileCounts, IdempotentAdmission

Calls == {"c1", "c2", "c3"}
Rid == [c \in Calls |-> IF c = "c3" THEN "b" ELSE "a"]

VARIABLES now, log, lock, phase, child, out, resp, sent, crashes

vars == <<now, log, lock, phase, child, out, resp, sent, crashes>>

Intents == {i \in 1..Len(log) : log[i].kind = "intent"}
Results == {i \in 1..Len(log) : log[i].kind = "result"}
HasIntent(id) == \E i \in Intents : log[i].id = id
HasResult(id) == \E i \in Results : log[i].id = id
\* readOperatorAuditRequest and earlierSends keep the first record of a request_id.
FirstResult(id) == log[CHOOSE i \in Results : log[i].id = id /\ \A j \in Results : log[j].id = id => i <= j].res
IntentAt(id) == log[CHOOSE i \in Intents : log[i].id = id /\ \A j \in Intents : log[j].id = id => i <= j].at

\* maySend: a recorded send counts unless its result proves that nothing was sent.
MaySend(id) ==
  IF ~HasResult(id) THEN UnresolvedCounts
  ELSE FirstResult(id) = "ok" \/ (FirstResult(id) = "reconcile" /\ ReconcileCounts)

\* The cooldown of a new request `id` at time `at`, read from the log `l` that holds its intent.
InsideCooldown(id, at) ==
  \E other \in {"a", "b"} \ {id} : HasIntent(other) /\ MaySend(other) /\ IntentAt(other) + Window > at

Init ==
  /\ now = 0 /\ log = <<>> /\ lock = "free"
  /\ phase = [c \in Calls |-> "idle"] /\ child = [c \in Calls |-> "none"]
  /\ out = [c \in Calls |-> "none"] /\ resp = [c \in Calls |-> "none"]
  /\ sent = {} /\ crashes = 0

Admit(c) ==
  /\ phase[c] = "idle"
  /\ IF lock # "free"
     THEN /\ resp' = [resp EXCEPT ![c] = "busy"] /\ phase' = [phase EXCEPT ![c] = "done"]
          /\ UNCHANGED <<log, lock, out>>
     ELSE IF IdempotentAdmission /\ (HasIntent(Rid[c]) \/ HasResult(Rid[c]))
     THEN /\ resp' = [resp EXCEPT ![c] = IF HasResult(Rid[c]) THEN FirstResult(Rid[c]) ELSE "reconcile"]
          /\ phase' = [phase EXCEPT ![c] = "done"]
          /\ UNCHANGED <<log, lock, out>>
     ELSE /\ log' = Append(log, [kind |-> "intent", id |-> Rid[c], at |-> now, res |-> "none"])
          /\ lock' = c
          /\ IF HasResult(Rid[c])
             \* earlierSends: "the current boss command is not the newest unresolved intent"
             THEN /\ out' = [out EXCEPT ![c] = "refused"] /\ phase' = [phase EXCEPT ![c] = "recording"]
             ELSE IF LET id == Rid[c] IN
                     \E other \in {"a", "b"} \ {id} :
                       /\ HasIntent(other) /\ MaySend(other) /\ IntentAt(other) + Window > now
                  THEN /\ out' = [out EXCEPT ![c] = "refused"] /\ phase' = [phase EXCEPT ![c] = "recording"]
                  ELSE /\ phase' = [phase EXCEPT ![c] = "reading"] /\ UNCHANGED out
          /\ UNCHANGED resp
  /\ UNCHANGED <<now, child, sent, crashes>>

ReadBack(c) ==
  /\ phase[c] = "reading"
  /\ \/ /\ phase' = [phase EXCEPT ![c] = "sending"] /\ child' = [child EXCEPT ![c] = "started"]
        /\ UNCHANGED out
     \/ /\ phase' = [phase EXCEPT ![c] = "recording"] /\ out' = [out EXCEPT ![c] = "refused"]
        /\ UNCHANGED child
  /\ UNCHANGED <<now, log, lock, resp, sent, crashes>>

ChildSends(c) ==
  /\ child[c] = "started"
  /\ child' = [child EXCEPT ![c] = "sent"] /\ sent' = sent \cup {c}
  /\ UNCHANGED <<now, log, lock, phase, out, resp, crashes>>

ChildFails(c) ==
  /\ child[c] = "started"
  /\ child' = [child EXCEPT ![c] = "failed"]
  /\ UNCHANGED <<now, log, lock, phase, out, resp, sent, crashes>>

SendReturns(c) ==
  /\ phase[c] = "sending" /\ child[c] \in {"sent", "failed"}
  /\ \E o \in (IF child[c] = "failed" THEN {"refused"} ELSE {"ok", "reconcile"}) :
       out' = [out EXCEPT ![c] = o]
  /\ phase' = [phase EXCEPT ![c] = "recording"]
  /\ UNCHANGED <<now, log, lock, child, resp, sent, crashes>>

SendTimesOut(c) ==
  /\ phase[c] = "sending" /\ child[c] = "started"
  /\ child' = [child EXCEPT ![c] = "killed"]
  /\ out' = [out EXCEPT ![c] = "reconcile"] /\ phase' = [phase EXCEPT ![c] = "recording"]
  /\ UNCHANGED <<now, log, lock, resp, sent, crashes>>

Record(c) ==
  /\ phase[c] = "recording"
  /\ \/ /\ log' = Append(log, [kind |-> "result", id |-> Rid[c], at |-> now, res |-> out[c]])
        /\ resp' = [resp EXCEPT ![c] = out[c]]
     \/ /\ resp' = [resp EXCEPT ![c] = "reconcile"] /\ UNCHANGED log
  /\ phase' = [phase EXCEPT ![c] = "done"] /\ lock' = "free"
  /\ UNCHANGED <<now, child, out, sent, crashes>>

Crash ==
  /\ crashes = 0 /\ crashes' = 1
  /\ \E c \in Calls : phase[c] \notin {"idle", "done"}
  /\ phase' = [c \in Calls |-> IF phase[c] \in {"idle", "done"} THEN phase[c] ELSE "lost"]
  /\ lock' = "free"
  /\ UNCHANGED <<now, log, child, out, resp, sent>>

Tick == now < MaxTime /\ now' = now + 1 /\ UNCHANGED <<log, lock, phase, child, out, resp, sent, crashes>>

Done == (\A c \in Calls : phase[c] \in {"done", "lost"} /\ child[c] # "started") /\ UNCHANGED vars

Next == (\E c \in Calls : Admit(c) \/ ReadBack(c) \/ ChildSends(c) \/ ChildFails(c)
                           \/ SendReturns(c) \/ SendTimesOut(c) \/ Record(c))
        \/ Crash \/ Tick \/ Done

Spec == Init /\ [][Next]_vars

\* Two requests that reached the seat have intent times at least one cooldown apart.
CooldownHolds ==
  \A c1, c2 \in sent : Rid[c1] # Rid[c2] =>
    (IntentAt(Rid[c1]) + Window <= IntentAt(Rid[c2]) \/ IntentAt(Rid[c2]) + Window <= IntentAt(Rid[c1]))
\* One request_id reaches the seat at most one time.
OneSendPerRequest == \A c1, c2 \in sent : Rid[c1] = Rid[c2] => c1 = c2
\* Nothing is sent before the intent record is in the log.
IntentBeforeSend == \A c \in Calls : child[c] # "none" => HasIntent(Rid[c])
\* An answer that says "not sent" is true, and an answer 200 has a send.
HonestAnswer ==
  \A c \in Calls :
    /\ resp[c] = "refused" => ~\E s \in sent : Rid[s] = Rid[c]
    /\ resp[c] = "ok" => \E s \in sent : Rid[s] = Rid[c]
=============================================================================
