------------------------- MODULE ArchitectureMapsFlow -------------------------
(*
The flow "use the maps of the architecture page": tabs, the topology segment
and the selection.

Part                        code (base c9af3b0)
the tabs                    src/operator-web/ArchitectureWorkspace.tsx, lines 245-247, 294, 325-333
the lens and the segment    src/operator-web/ArchitectureMap.tsx, lines 286-291: state of
                            ArchitectureMap, which the History and Modules tabs unmount
the first segment           ArchitectureMap.tsx line 290: `namespace`
the selection               one useState in each canvas: ArchitectureModules.tsx:275,
                            ArchitectureLayers.tsx:162, ArchitectureSequence.tsx:382,
                            ArchitectureTopology.tsx:180
a new commit                ArchitectureMap.tsx lines 314-325: the key of each canvas
                            holds the commit, so a new commit makes a new canvas

Scope: a model of the form of the recorded map: 1 namespace, 14 processes and
0 mounts, so only the process segment has more than one box. The tabs are the
module map, Layers, Sequence, Topology and History. `lost` and `reset` are
history variables: how the page last dropped a selection, and whether it
dropped a segment that the person chose.

FirstSegment selects a design. The code at the base is "namespace".
*)
CONSTANTS FirstSegment

VARIABLES tab, segment, chosen, selected, lost, reset

vars == <<tab, segment, chosen, selected, lost, reset>>

MapTabs == {"map", "layers", "sequence", "topology"}

Init ==
  /\ tab = "map" /\ segment = FirstSegment /\ chosen = FALSE
  /\ selected = FALSE /\ lost = "none" /\ reset = FALSE

YouSelectABox ==
  /\ tab \in MapTabs /\ ~selected /\ selected' = TRUE /\ lost' = "none"
  /\ UNCHANGED <<tab, segment, chosen, reset>>

YouOpenAnotherMapTab ==
  /\ tab \in MapTabs
  /\ \E t \in MapTabs \ {tab} : tab' = t
  /\ selected' = FALSE /\ lost' = IF selected THEN "tab" ELSE lost
  /\ UNCHANGED <<segment, chosen, reset>>

YouOpenHistory ==
  /\ tab \in MapTabs /\ tab' = "history"
  /\ selected' = FALSE /\ lost' = IF selected THEN "tab" ELSE lost
  /\ segment' = FirstSegment /\ chosen' = FALSE /\ reset' = (reset \/ chosen)
YouComeBackFromHistory ==
  /\ tab = "history"
  /\ \E t \in MapTabs : tab' = t
  /\ UNCHANGED <<segment, chosen, selected, lost, reset>>

YouChooseAnotherSegment ==
  /\ tab = "topology"
  /\ segment' = (IF segment = "process" THEN "namespace" ELSE "process")
  /\ chosen' = TRUE /\ reset' = FALSE
  /\ UNCHANGED <<tab, selected, lost>>

ANewCommitIsCollected ==
  /\ tab \in MapTabs /\ selected
  /\ selected' = FALSE /\ lost' = "commit"
  /\ UNCHANGED <<tab, segment, chosen, reset>>

Next == YouSelectABox \/ YouOpenAnotherMapTab \/ YouOpenHistory \/ YouComeBackFromHistory
        \/ YouChooseAnotherSegment \/ ANewCommitIsCollected

Spec == Init /\ [][Next]_vars

\* The topology opens on a segment that has more than one box.
TopologyOpensOnBoxes == (tab = "topology" /\ ~chosen) => segment = "process"
\* A selection stays when the person opens another tab.
SelectionSurvivesATabChange == lost # "tab"
\* A selection stays when the collector reads a new commit.
SelectionSurvivesANewCommit == lost # "commit"
\* A segment that the person chose stays after a visit to History.
ChosenSegmentSurvivesHistory == ~reset
=============================================================================
