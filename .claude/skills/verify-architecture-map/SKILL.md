---
name: verify-architecture-map
description: "TLA+ model checks of the architecture map collector cycle and of the architecture page flows. Use before you change src/effects/operator/architecture-map-collector.ts, another resident collector with the same cycle (docs, execution, tests), the map read in src/operator-web/ArchitectureMap.tsx, or the view state in src/operator-web/ArchitectureWorkspace.tsx."
---

# Verify the architecture map

Three models describe the code at the sync commit. `ResidentCollector.tla` is the cycle of `startArchitectureMapCollector`: boot, one child for each repository, publish, timer, close. `ArchitectureFirstMapFlow.tla` is the collector and the page from the start of `operator serve` to the first map. `ArchitectureMapsFlow.tla` is the tabs, the topology segment and the selection.

Sync commit: `c9af3b06c3361b4e46b5254d1629e0537acccac0` (main). Move it forward only after each row of the coverage record is true for the new code.

## What is checked

| Rule | Sentence | Harm when it breaks | State |
|---|---|---|---|
| `NoOverlap` | Cycles never overlap. | Two children run archctx and git on one repository at the same time. | holds |
| `NoChildAfterClose` | A closed collector starts no child. | Shutdown starts a child for each repository that is left in the cycle. | holds |
| `NoPublishAfterClose` | A closed collector publishes nothing. | A read after shutdown gets a map of a cycle that the close stopped. | holds |
| `ClosedIsQuiet` | A closed collector with no cycle in flight has no timer. | The collector starts a new cycle after `operator serve` closed it. | holds |
| `CollectedResultIsServed` | The result that a child returned is the answer of the next GET for its repository. | The map of each repository waits for the last repository of the cycle. One child that runs to its limit (about 140 s) holds every map back. | finding: new |
| `BuiltMapIsServed` | The same rule in the page flow. | The page shows "not collected yet" for a map that the collector holds. | finding: new |
| `PendingKeepsCadence` | After the answer "not collected yet", the next read comes after 30 s. | The first map shows up to 120 s after it is ready. | finding: #2151 |
| `TopologyOpensOnBoxes` | The topology opens on a segment that has more than one box. | The first topology view is one box on an empty canvas. | finding: #2151 |
| `ChosenSegmentSurvivesHistory` | A segment that the person chose stays after a visit to History. | The lens, the flow and the segment go back to their first values. | finding: candidate rule, the owner decides |
| `SelectionSurvivesATabChange` | A selection stays when the person opens another tab. | The inspector closes at each tab change. | finding: candidate rule, the owner decides |
| `SelectionSurvivesANewCommit` | A selection stays when the collector reads a new commit. | The inspector closes when a commit lands. | finding: candidate rule, the owner decides |

`ResidentCollector.publish-each-child.cfg` and `ArchitectureFirstMapFlow.publish-each-child.cfg` are a design in which each child result is published when it returns: the four guards and the two served rules hold together.

## Coverage record

| Model part | Code |
|---|---|
| `Boot` | `src/effects/operator/architecture-map-collector.ts:152-153` |
| `StartCycle`, `ChildReturns`, `Continue` | lines 126-143 |
| `LoopChecksClosed` | line 134 |
| `PublishChecksClosed` | line 140 |
| `Finish`, `ArmAfterSettle`, `ArmChecksClosed` | lines 144-149 |
| `Close` | lines 162-168 |
| `Served` | lines 156-160 |
| the page read and the kept map | `src/operator-web/ArchitectureMap.tsx:51-65,292-295,312-313` |
| the tabs | `src/operator-web/ArchitectureWorkspace.tsx:245-247,294,325-333` |
| the lens, the flow and the segment | `src/operator-web/ArchitectureMap.tsx:286-291` |
| the selection | `ArchitectureModules.tsx:275`, `ArchitectureLayers.tsx:162`, `ArchitectureSequence.tsx:382`, `ArchitectureTopology.tsx:180` |

The docs, execution and tests collectors publish in the same way (`states = next` at `docs-collector.ts:150`, `execution-collector.ts:108`, `tests-collector.ts:290`). The model reads only the architecture map collector. Read the other file against the header of `ResidentCollector.tla` before you rely on the model for it.

A change touches the verified code when `git diff c9af3b06c3361b4e46b5254d1629e0537acccac0 -- src/effects/operator/architecture-map-collector.ts src/operator-web/ArchitectureMap.tsx src/operator-web/ArchitectureWorkspace.tsx` is not empty.

## Run

```sh
TLA2TOOLS_JAR=<tla2tools.jar of TLA+ v1.7.4> bash specs/tla/check.sh ResidentCollector ArchitectureFirstMapFlow ArchitectureMapsFlow
```

The run takes about 10 s and needs Java 11 or later. The script takes the version and the SHA-256 of the jar from `scripts/contract-closeout-tla.sh`. `specs/tla/checks.tsv` holds the expectation of each config: `holds`, `breaks` (one guard is off, and TLC must report the named rule) or `finding` (the code breaks these rules now).

Read each result with the pstack `/statechart` skill. It tells the shortest path to each broken rule in the words of the view module beside the spec (`ArchitectureFirstMapFlow.view.mjs`, `ArchitectureMapsFlow.segment.view.mjs`, `ArchitectureMapsFlow.selection.view.mjs`), and it draws the chart. `ArchitectureFirstMapFlow.main-path.cfg` is the config for a chart of the main path.

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

The collector test does not reach the three close guards. With line 134, line 140 or line 146 removed, `tests/cli/operator-serve.test.ts` (`the collector is pending, then serves the child map`) still passes. The configs `no-loop-close-check`, `no-publish-close-check` and `no-arm-close-check` report each removal.

## Not covered

- The content of a map, the child process, its time limit and the abort signal.
- A registry that changes between two cycles.
- The Modules list, the module detail graph and History.
- The geometry of a map: the first viewport, the edge routes and the layout (#2151, #2152, #2153, #2156).
