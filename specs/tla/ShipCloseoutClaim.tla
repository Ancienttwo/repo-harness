-------------------------- MODULE ShipCloseoutClaim --------------------------
(*
Action                          scripts/ship-worktrees.sh (base 29b23f542)
ObserveMkdir, MakeDir, Elect     closeout_claim_elect:197-198
WriteOwner                      closeout_claim_acquire:224-233; takeover:329-339
BindJournal, CompleteJournal    closeout_claim_bind_journal:236; journal:654-704
ReadClaim, CheckClaimPid         closeout_claim_takeover_for_recovery:309-315
ReadLane, CheckLanePid           closeout_claim_takeover_for_recovery:316-320
MarkLane, CheckLaneGeneration    closeout_claim_reclaim_lane:274-287
CheckClaimGeneration            closeout_claim_takeover_for_recovery:340-343
CheckRelease                    closeout_claim_release:249-254
CheckCancel                     closeout_claim_cancel_recovery:346-350
BeginRemove, FinishRemove       closeout_claim_remove:203-205
RecoverJournal                  closeout_claim_abort_orphan:379-392
Crash                           SIGKILL at any action boundary; no EXIT trap

Bound: each actor invokes ship or recover once, with a unique generation for
each election. The configs use two ships and two recoveries. No PID is reused.
Directory tokens distinguish a new path from the retired directory at the old
path. A retired directory has no reachable owner or lane. Its off-path contents
are abstracted away; a pending FinishRemove still names its original token.
The journal has only none/open/complete; snapshots and its eight phases are out
of scope. An absent or empty record cannot be proved dead and is not recovered.

Read/check actions are separate from the following file operations. mkdir has
an entry and a return: with the mkdir fix off, two overlapping calls that saw
an absent path can both return success. O_EXCL is one atomic create. A record
write is the atomic rename of a completed temporary file (395-400).

held records the generation returned to the caller by acquire/takeover. A
competing write does not revoke that caller's local authority. SingleOwner
counts those live holders, not just the last writer of owner.json (which would
make the invariant unable to detect two successful acquisitions).
The two other invariants retain a failed operation as a history bit, so a later
cleanup cannot hide an election in an rm walk or an act on an unchecked record.
*)
EXTENDS Naturals, FiniteSets

CONSTANTS Ships, Recoveries, ElectByExclusiveCreate, RemoveByRename,
          RecoveryChecksGeneration
ASSUME /\ Ships \cap Recoveries = {}
       /\ ElectByExclusiveCreate \in BOOLEAN
       /\ RemoveByRename \in BOOLEAN
       /\ RecoveryChecksGeneration \in BOOLEAN

Actors == Ships \cup Recoveries
None == "none"
Empty == [pid |-> None, generation |-> "empty"]
Absent == [pid |-> None, generation |-> None]
Record(p) == [pid |-> p, generation |-> p]

VARIABLE state
vars == <<state>>

Init == state = [
  claimDir |-> "absent", claimToken |-> None, owner |-> Absent,
  laneDir |-> "absent", laneToken |-> None, laneOwner |-> Absent,
  markers |-> {}, journal |-> None,
  generationSafe |-> TRUE, electionSafe |-> TRUE,
  proc |-> [p \in Actors |-> [
    pc |-> IF p \in Ships THEN "mkdirRead" ELSE "readClaim",
    live |-> TRUE, held |-> None, checked |-> None, laneChecked |-> None,
    mkdirAbsent |-> FALSE, target |-> IF p \in Ships THEN "claim" ELSE "lane",
    removal |-> None, removeToken |-> None, afterRemove |-> "done"]]]

Advance(p, next) == [state EXCEPT !.proc[p].pc = next]
IsRecord(r) == r.generation \in Actors
OwnerDead(r) == IF r.pid \in Actors THEN ~state.proc[r.pid].live ELSE TRUE
Dir(target) == IF target = "claim" THEN state.claimDir ELSE state.laneDir
Owner(target) == IF target = "claim" THEN state.owner ELSE state.laneOwner
Token(target) == IF target = "claim" THEN state.claimToken ELSE state.laneToken
ParentExists(target) == target = "claim" \/ state.claimDir = "present"
Walking(target) == \E p \in Actors :
  /\ state.proc[p].removal = "walk"
  /\ state.proc[p].target = target
  /\ state.proc[p].removeToken = Token(target)
ClaimGenerationMatches(p) == state.owner.generation = state.proc[p].checked
LaneGenerationMatches(p) == state.laneOwner.generation = state.proc[p].laneChecked

ObserveMkdir(p) ==
  /\ state.proc[p].pc = "mkdirRead"
  /\ state' = [Advance(p, "mkdir") EXCEPT
       !.proc[p].mkdirAbsent = Dir(state.proc[p].target) # "present"]

MakeDir(p) ==
  /\ state.proc[p].pc = "mkdir"
  /\ LET target == state.proc[p].target
         exists == Dir(target) = "present"
         canEnter == ParentExists(target)
         won == ElectByExclusiveCreate \/ state.proc[p].mkdirAbsent
         next == IF canEnter /\ won
                 THEN IF ElectByExclusiveCreate THEN "elect" ELSE "write"
                 ELSE "done"
         updated == Advance(p, next)
     IN state' =
       IF ~canEnter \/ exists THEN updated
       ELSE IF target = "claim" THEN [updated EXCEPT
         !.claimDir = "present", !.claimToken = p, !.owner = Absent,
         !.laneDir = "absent", !.laneToken = None, !.laneOwner = Absent,
         !.markers = {}]
       ELSE [updated EXCEPT
         !.laneDir = "present", !.laneToken = p, !.laneOwner = Absent,
         !.markers = {}]

Elect(p) ==
  /\ state.proc[p].pc = "elect"
  /\ LET target == state.proc[p].target
         won == ParentExists(target) /\ Dir(target) = "present"
                /\ Owner(target) = Absent
         updated == Advance(p, IF won THEN "write" ELSE "done")
     IN state' = IF ~won THEN updated ELSE
       IF target = "claim" THEN [updated EXCEPT
         !.owner = Empty, !.electionSafe = @ /\ ~Walking(target)]
       ELSE [updated EXCEPT
         !.laneOwner = Empty,
         !.electionSafe = @ /\ ~Walking(target) /\ ~Walking("claim")]

WriteOwner(p) ==
  /\ state.proc[p].pc = "write"
  /\ LET target == state.proc[p].target
         exists == ParentExists(target) /\ Dir(target) = "present"
         updated == Advance(p, IF ~exists THEN "done"
                    ELSE IF p \in Ships THEN "bind" ELSE "checkClaim")
     IN state' = IF ~exists THEN updated ELSE
       IF target = "claim" THEN [updated EXCEPT
         !.owner = Record(p), !.proc[p].held = p,
         !.electionSafe = @ /\ ~Walking(target)]
       ELSE [updated EXCEPT
         !.laneOwner = Record(p), !.proc[p].laneChecked = p,
         !.electionSafe = @ /\ ~Walking(target) /\ ~Walking("claim")]

BindJournal(p) ==
  /\ state.proc[p].pc = "bind"
  /\ state' = [Advance(p, "complete") EXCEPT !.journal = "open"]

CompleteJournal(p) ==
  /\ state.proc[p].pc = "complete"
  /\ state' = [Advance(p, "release") EXCEPT !.journal = "complete"]

ReadClaim(p) ==
  /\ state.proc[p].pc = "readClaim"
  /\ state' = [Advance(p, IF state.claimDir = "present" /\ IsRecord(state.owner)
                         THEN "claimPid" ELSE "done") EXCEPT
       !.proc[p].checked = state.owner.generation]

CheckClaimPid(p) ==
  /\ state.proc[p].pc = "claimPid"
  /\ state' = Advance(p, IF OwnerDead(state.owner) THEN "readLane" ELSE "done")

ReadLane(p) ==
  /\ state.proc[p].pc = "readLane"
  /\ state' = [Advance(p,
       IF state.laneDir # "present" THEN "mkdirRead"
       ELSE IF IsRecord(state.laneOwner) THEN "lanePid" ELSE "done") EXCEPT
       !.proc[p].laneChecked = state.laneOwner.generation]

CheckLanePid(p) ==
  /\ state.proc[p].pc = "lanePid"
  /\ state' = Advance(p, IF OwnerDead(state.laneOwner) THEN "marker" ELSE "done")

MarkLane(p) ==
  /\ state.proc[p].pc = "marker"
  /\ LET won == state.claimDir = "present" /\ state.laneDir = "present"
                /\ state.proc[p].laneChecked \notin state.markers
     IN state' = IF ~won THEN Advance(p, "done") ELSE
       [Advance(p, "checkLane") EXCEPT
         !.markers = @ \cup {state.proc[p].laneChecked}]

CheckLaneGeneration(p) ==
  /\ state.proc[p].pc = "checkLane"
  /\ state' = IF RecoveryChecksGeneration /\ ~LaneGenerationMatches(p)
     THEN [Advance(p, "done") EXCEPT
       !.markers = @ \ {state.proc[p].laneChecked}]
     ELSE [Advance(p, "remove") EXCEPT !.proc[p].afterRemove = "mkdirRead"]

CheckClaimGeneration(p) ==
  /\ state.proc[p].pc = "checkClaim"
  /\ state' = IF RecoveryChecksGeneration /\ ~ClaimGenerationMatches(p)
     THEN Advance(p, "cancel")
     ELSE [Advance(p, "recover") EXCEPT
       !.proc[p].held = state.proc[p].checked,
       !.generationSafe = @ /\ ClaimGenerationMatches(p)]

RecoverJournal(p) ==
  /\ state.proc[p].pc = "recover"
  /\ state' = [Advance(p, "release") EXCEPT !.journal = None]

CheckRelease(p) ==
  /\ state.proc[p].pc = "release"
  /\ LET matches == IF p \in Ships THEN state.owner.generation = p
                    ELSE ClaimGenerationMatches(p) /\ LaneGenerationMatches(p)
         allowed == matches \/ (p \in Recoveries /\ ~RecoveryChecksGeneration)
     IN state' = [Advance(p, IF allowed THEN "remove" ELSE "done") EXCEPT
       !.proc[p].target = "claim", !.proc[p].afterRemove = "done"]

CheckCancel(p) ==
  /\ state.proc[p].pc = "cancel"
  /\ state' = [Advance(p,
       IF ~RecoveryChecksGeneration \/ LaneGenerationMatches(p)
       THEN "remove" ELSE "done") EXCEPT
       !.proc[p].target = "lane", !.proc[p].afterRemove = "done"]

BeginRemove(p) ==
  /\ state.proc[p].pc = "remove"
  /\ LET target == state.proc[p].target
         exists == ParentExists(target) /\ Dir(target) = "present"
         safe == p \notin Recoveries \/
           (IF target = "claim" THEN ClaimGenerationMatches(p)
            ELSE LaneGenerationMatches(p))
         updated == [Advance(p, IF exists THEN "removeFinish" ELSE "done") EXCEPT
           !.proc[p].held = None,
           !.proc[p].removeToken = Token(target),
           !.proc[p].removal = IF ~exists THEN None
                              ELSE IF RemoveByRename THEN "rename" ELSE "walk",
           !.generationSafe = @ /\ (~exists \/ safe)]
         status == IF RemoveByRename THEN "retired" ELSE "present"
     IN state' = IF ~exists THEN updated ELSE
       IF target = "claim" THEN [updated EXCEPT
         !.claimDir = status, !.owner = Absent,
         !.laneDir = "absent", !.laneOwner = Absent, !.markers = {}]
       ELSE [updated EXCEPT !.laneDir = status, !.laneOwner = Absent, !.markers = {}]

FinishRemove(p) ==
  /\ state.proc[p].pc = "removeFinish"
  /\ LET target == state.proc[p].target
         same == state.proc[p].removeToken = Token(target)
         removable == same /\ (Dir(target) = "retired" \/ Owner(target) = Absent)
         updated == [Advance(p, state.proc[p].afterRemove) EXCEPT
           !.proc[p].removal = None]
     IN state' = IF ~removable THEN updated ELSE
       IF target = "claim" THEN [updated EXCEPT !.claimDir = "absent"]
       ELSE [updated EXCEPT !.laneDir = "absent"]

Crash(p) ==
  /\ state.proc[p].live
  /\ state' = [state EXCEPT !.proc[p].live = FALSE]

Next == \E p \in Actors :
  /\ state.proc[p].live
  /\ ObserveMkdir(p) \/ MakeDir(p) \/ Elect(p) \/ WriteOwner(p)
     \/ BindJournal(p) \/ CompleteJournal(p) \/ ReadClaim(p) \/ CheckClaimPid(p)
     \/ ReadLane(p) \/ CheckLanePid(p) \/ MarkLane(p) \/ CheckLaneGeneration(p)
     \/ CheckClaimGeneration(p) \/ RecoverJournal(p) \/ CheckRelease(p)
     \/ CheckCancel(p) \/ BeginRemove(p) \/ FinishRemove(p) \/ Crash(p)

Spec == Init /\ [][Next]_vars
SingleOwner == Cardinality({p \in Actors : state.proc[p].live /\
  state.proc[p].held # None /\ state.proc[p].held =
    (IF p \in Ships THEN p ELSE state.proc[p].checked)}) <= 1
RecoveryActsOnCheckedGeneration == state.generationSafe
NoElectionInRetiredDir == state.electionSafe
=============================================================================
