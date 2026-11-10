--------------------------- MODULE BossCommandFlow ---------------------------
(*
The flow "send a boss command to the advisor seat", as the room shows it.

Part                    code (base c9af3b0)
the buttons             src/operator-web/BoardOffice.tsx BossButtons, lines 338-356:
                        locked when the shown turn is not over or a send runs;
                        disabled while the browser holds a cooldown
the dialog              BoardOffice.tsx BossConfirm, lines 294-325, and line 658
the send and the answer src/operator-web/office-boss.ts useBossCommands, lines 36-62
the server order        src/effects/operator/advisor-seat-route.ts, lines 193-224:
                        the cooldown, then the read-back of the turn, then the send
the shown turn          BoardOffice.tsx line 614: the advisor status of the last parents read

Scope: one command of one parent, one browser page. `turnReal` is the turn of
the advisor terminal. `turnShown` is the turn that the room shows.
`coolServer` is the cooldown that the audit log proves. `coolShown` is the
cooldown in the memory of the page. `reached` counts the commands that reached
the seat in one cooldown. BossCommandSend.tla holds the protocol of the server.
*)
EXTENDS Naturals

VARIABLES ui, turnShown, turnReal, coolShown, coolServer, notice, reached

vars == <<ui, turnShown, turnReal, coolShown, coolServer, notice, reached>>

Init ==
  /\ ui = "buttons" /\ turnShown = "over" /\ turnReal = "over"
  /\ coolShown = FALSE /\ coolServer = FALSE /\ notice = "none" /\ reached = 0

Offered == ui = "buttons" /\ turnShown = "over" /\ ~coolShown

YouPickACommand == Offered /\ ui' = "confirm" /\ UNCHANGED <<turnShown, turnReal, coolShown, coolServer, notice, reached>>
YouCancel == ui = "confirm" /\ ui' = "buttons" /\ UNCHANGED <<turnShown, turnReal, coolShown, coolServer, notice, reached>>
YouConfirm ==
  /\ ui = "confirm" /\ ui' = "sending" /\ notice' = "none"
  /\ UNCHANGED <<turnShown, turnReal, coolShown, coolServer, reached>>

ServerSends ==
  /\ ui = "sending" /\ ~coolServer /\ turnReal = "over"
  /\ ui' = "buttons" /\ reached' = reached + 1 /\ coolServer' = TRUE /\ coolShown' = TRUE
  /\ turnReal' = "running"
  /\ UNCHANGED <<turnShown, notice>>
ServerRefusesForCooldown ==
  /\ ui = "sending" /\ coolServer
  /\ ui' = "buttons" /\ notice' = "cooldown" /\ coolShown' = TRUE
  /\ UNCHANGED <<turnShown, turnReal, coolServer, reached>>
ServerRefusesForTurn ==
  /\ ui = "sending" /\ ~coolServer /\ turnReal = "running"
  /\ ui' = "buttons" /\ notice' = "turn"
  /\ UNCHANGED <<turnShown, turnReal, coolShown, coolServer, reached>>
\* The command reached the seat, but the page got `reconcile_required` or no answer.
AnswerIsLostAfterTheSend ==
  /\ ui = "sending" /\ ~coolServer /\ turnReal = "over"
  /\ ui' = "buttons" /\ notice' = "unknown" /\ reached' = reached + 1 /\ coolServer' = TRUE
  /\ turnReal' = "running"
  /\ UNCHANGED <<turnShown, coolShown>>
AnswerIsLostBeforeTheSend ==
  /\ ui = "sending" /\ ui' = "buttons" /\ notice' = "unknown"
  /\ UNCHANGED <<turnShown, turnReal, coolShown, coolServer, reached>>

RoomReadsTheSeat ==
  /\ turnShown # turnReal /\ turnShown' = turnReal
  /\ UNCHANGED <<ui, turnReal, coolShown, coolServer, notice, reached>>
AdvisorEndsItsTurn ==
  /\ turnReal = "running" /\ turnReal' = "over"
  /\ UNCHANGED <<ui, turnShown, coolShown, coolServer, notice, reached>>
AdvisorStartsATurn ==
  /\ turnReal = "over" /\ turnReal' = "running"
  /\ UNCHANGED <<ui, turnShown, coolShown, coolServer, notice, reached>>
CooldownEnds ==
  /\ coolServer /\ coolServer' = FALSE /\ coolShown' = FALSE /\ reached' = 0
  /\ UNCHANGED <<ui, turnShown, turnReal, notice>>
YouReloadThePage ==
  /\ ui = "buttons" /\ (coolShown \/ notice # "none")
  /\ coolShown' = FALSE /\ notice' = "none"
  /\ UNCHANGED <<ui, turnShown, turnReal, coolServer, reached>>

Next == YouPickACommand \/ YouCancel \/ YouConfirm \/ ServerSends \/ ServerRefusesForCooldown
        \/ ServerRefusesForTurn \/ AnswerIsLostAfterTheSend \/ AnswerIsLostBeforeTheSend
        \/ RoomReadsTheSeat \/ AdvisorEndsItsTurn \/ AdvisorStartsATurn \/ CooldownEnds
        \/ YouReloadThePage

Spec == Init /\ [][Next]_vars

\* One command reaches the seat in one cooldown.
OneCommandInACooldown == reached <= 1
\* A command that the room offers is not refused for the turn of the advisor.
OfferMatchesTheTurn == Offered => turnReal = "over"
\* A command that the room offers is not refused for the cooldown.
OfferMatchesTheCooldown == Offered => ~coolServer
=============================================================================
