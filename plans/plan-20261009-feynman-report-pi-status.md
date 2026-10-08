# Plan: Feynman reports and Pi program status

> Status: SOP implementation and source research complete. Runtime integration is planned.
> Date: 2026-10-09 (Asia/Singapore)
> Base: `e7c86c553f229a0068dba7bef727192c8a93220c`
> Branch: `codex/feynman-report-pi-status`
> Owner: Parent Codex agent in this chat.
> Authority: The user requested the report SOP change, a Plan and task dispatch.

## Goal and scope

Explain project progress to a reader who does not know the project. Include a PlantUML progress diagram in formal reports. Keep each claim tied to observed evidence.

Plan the Pi 1.1 status link for the read-only Kanban. Pi is the worker. Its program status is a signal light. The Kanban shows that light beside the task. The task still needs its own checks before acceptance.

This work changes the report SOP and records bounded implementation tasks. It does not add a scheduler, a second task store or a Pi package dependency. It does not change the existing 0.21.2 candidate, start a live provider, change a user daemon, merge, tag or publish. External code publication and live configuration changes need their own task scope.

## P1: Map the boundaries

- `assets/reference-configs/agentic-development-flow.md` owns the development and report SOP. `docs/reference-configs/agentic-development-flow.md` is its byte-identical projection. `scripts/sync-reference-configs.ts` checks this relation.
- Pi `v1.1.0`, commit `abe508e1b89912adde45528136c3221eb69acdd7`, reports program status through `packages/coding-agent/src/modes/interactive/program-status-reporter.ts` and `packages/tui/src/program-status.ts`.
- Herdr owns terminal parsing and pane status. The existing request is [Discussion 5073](https://github.com/herdrdev/herdr/discussions/5073). Source research pinned current master at `cce57bc32c44b0a83b641fe5f8625cd3c93ba7e4`. Its collector handles OSC 0/2/9. The inspected pane/event schemas have no typed program status or reason.
- repo-harness candidate [PR 604](https://github.com/Ancienttwo/repo-harness/pull/604), head `48d39b0533512f83f7cc699273766949dd9e4426`, contains the Kanban work from [PR 603](https://github.com/Ancienttwo/repo-harness/pull/603). PR 604 was open and Draft when checked for this Plan.
- In that candidate, `src/effects/operator/runtime-status.ts` owns `ProgramStatusV1` and `observeProgramStatus()`. `runtime-source.ts` owns source capability admission. `runtime-service.ts` verifies dispatch bindings. `src/effects/terminal/herdr-observation.ts` pins Herdr 0.9.3 and protocol 22. `src/operator-web/RuntimeBadges.tsx` renders status.

## P2: Trace one path

Pi receives an `agent_start` event. Its reporter selects `working`. The terminal writer emits OSC 7501 after support detection, unless an explicit setting changes that behavior. A supporting terminal must receive the report before any dashboard can use it.

The current repo-harness candidate reads Herdr snapshots through its transport. It verifies the pane, session, task and current round before it creates an observation. Its HTTP GET reads the cache. The UI then shows the observation beside the task. The production source does not yet admit Pi program status. A typed in-memory adapter is not proof of a live receiver.

The report path is source SOP -> docs projection -> formal user report and PlantUML source. The diagram is an evidence view. It is not a task store.

## P3: Decision and invariants

Adopt the protocol at the observation boundary. Keep terminal parsing in Herdr. Reuse the current candidate's typed adapter and UI. Do not parse screen text in repo-harness or copy Pi's runtime into it.

- `working` means that a run is active. It does not give a completion percentage.
- `blocked` can carry `permission`, `question` or `auth`. It grants no action authority.
- Map protocol `done` to a run-ended observation, such as the existing `settled` state. Never use it to accept a task, release a lease or unblock a dependent task.
- `idle` cannot prove cancellation. Admit `cancelled` only from an explicit, correctly bound `agent_settled.aborted` event. OSC alone does not carry that event.
- `clear` removes program observations. It does not delete tasks.
- Reports do not require heartbeats. Track connection/snapshot freshness separately from the time of the last status change.
- The protocol does not authenticate task identity. Require current dispatch bindings, session identity, attempt and source epoch. Drop ambiguous and old observations.
- Pi 1.1 reports the root record only. Do not infer child-task states.
- Exclude free-text messages from the first public projection. Session names, dialog titles and error text may contain private data.

## Work packages and owners

The table is a dated planning view. Live task results and Git evidence remain the sources for execution status.

| ID | Owner and paths | Work and dependency | Acceptance | Dispatch state |
|---|---|---|---|---|
| R1 | Codex child `/root/report_sop`; source SOP and its docs projection only | Add the Feynman report and PlantUML rules. No dependency on Pi. | Formal reports explain goal, value, behavior, result and gaps. Diagrams have editable source and the same evidence date/revision. No invented progress or extra approval gate. Projection and scope checks pass. | Complete. Worker checks passed. Parent inspected the diff. |
| D0 | Codex child `/root/pi_status_plan_input`; read-only source research | Pin current Herdr source. Locate the missing receiver and snapshot contract. Reuse Discussion 5073. No live daemon access. | Report source SHA, actual call path, evidence gaps and the smallest next slice. Do not label source inspection as a live test. | Complete. Herdr source gap confirmed. Live capability is still unknown. |
| P0 | Codex backend worker; disposable repo and HOME; Pi reporter and Herdr snapshot/event interfaces | Follow D0. Use an authorized Herdr caller and an owned real Pi session. First probe support and typed fields. If absent, stop with a precise negative result. | Record exact versions, source and session/attempt identity, handshake and available fields. Where supported, observe real work and input waits. No fabricated `printf` status or stub provider can establish live capability. | Not dispatched. This desktop parent has no Herdr pane context. |
| P1 | Codex backend worker; isolated Herdr source checkout; `src/pane/osc.rs` and `src/api/schema/{panes,events,common}.rs` | Follow P0. If upstream already implements the feature, verify it instead of duplicating it. Otherwise prepare a bounded receiver candidate within a separately assigned upstream scope. Do not change a running user installation. | Support query/reply, bounded decoding, replacement/clear and exit/reset lifetime. Preserve typed reasons and pane provenance. Expose status via snapshots/events. Record native tests and the exact candidate. | Planned external dependency; no external writer has been started. |
| P2 | Codex backend worker; repo-harness runtime source/transport and existing status tests | Follow a proven P1 interface. First reconcile with the live state of PR 604 and use one owned branch. Reuse the existing adapter. | Correct mappings, current-round identity, disconnect/reconnect and event-loss handling. Unknown capability fails closed. GET remains read-only. No task/lease mutation. Typecheck and affected tests pass. | Planned; waits for the structured upstream interface. |
| P3 | Claude frontend worker, only if a verified gap remains in `RuntimeBadges.tsx` or `i18n.ts` | Follow P2. Inspect the existing candidate UI before any edit. Dispatch via the documented Herdr/OAR route. | Reuse existing badges where sufficient. If changed, show waits and freshness accurately. Browser QA uses real data. A run-ended badge never says task accepted. | Conditional; no frontend worker started. |
| P4 | Codex integration worker; disposable test repo, HOME and owned processes | Follow P2 and any required P3. Run a real Pi 1.1 session through a compatible Herdr receiver. | Observe work, a real input wait, resume, finish and cancellation. Check reset/reconnect isolation. Task and lease records remain unchanged. Record commands, exit codes, versions and UI evidence. Use one read-only review when implementation and assertions change together. | Planned; live chain unverified. |

P1 is a proposed external-code slice, not a claim that Herdr accepted or shipped it. The first live probe must establish runtime capability before any provider work. A missing capability is a stop result, not a reason to force status output or scrape a screen.

## Dispatch and execution rules

R1 and D0 are native Codex child tasks in this chat. Their scopes do not overlap. The parent owns this Plan and its diagram. These are not Herdr pane launches or verified fleet-role selections. Both children reported default native routing; no configured fleet-role routing is claimed.

Each current child has a bounded timebox: R1 ten minutes; D0 eight minutes. Both returned their results. Preserve other authors' files. Do not retry an uncertain external effect.

P0 is the next bounded dispatch brief. Goal: prove or reject the real Pi-to-Herdr observation path. Scope: owned disposable processes and read-only public snapshot/event calls. Verify: record real capability and exact provenance, then stop at the first unsupported boundary. Rollback: stop only owned test processes and retain evidence. Timebox: twenty minutes; do not repeat failed probes without new evidence. No package install, credential change, provider substitution or user-daemon reconfiguration is included.

Future cross-model and CLI-worker dispatch must follow [Herdr Dispatch](../docs/reference-configs/external-tooling.md#herdr-dispatch). This desktop parent has no Herdr pane context. Do not invent that identity or start direct provider subprocesses. This Plan does not change that rule.

## Verification and report delivery

For this documentation slice, use the worker's recorded `bun run check:reference-configs` result, inspect the source/projection diff, then check Plan links, file scope and `git diff --check`. Product typechecks and product tests are not required for mechanical prose.

The parent must deliver a short Feynman report and [PlantUML source](plan-20261009-feynman-report-pi-status.puml). Label rendering as unverified if no local renderer is available. Do not upload private source to a public renderer. The graph must show P0 as not dispatched and P1-P4 as planned, not complete.

Runtime acceptance is a separate slice. No synthetic fixture or passed CI job can replace the real-chain checks in P4.

## Risk and rollback

The main risk is confusing a program's reported state with a verified task result. The identity and acceptance boundaries above prevent that promotion. An upstream protocol/version change can require a small transport update and new real-chain evidence.

This slice changes documents only. Revert its local commit to remove the SOP addition, Plan and diagram. It does not modify runtime state. Do not delete unrelated files or branches. No push, PR, merge or release is part of this slice.

## Sources

- [Pi v1.1.0 release](https://github.com/earendil-works/pi/releases/tag/v1.1.0).
- [Pi reporter at the pinned commit](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/modes/interactive/program-status-reporter.ts).
- [Pi protocol writer at the pinned commit](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/tui/src/program-status.ts).
- [Program Status Protocol](https://www.superlogical.com/rex/docs/build/program-status).
- [Candidate runtime adapter](https://github.com/Ancienttwo/repo-harness/blob/48d39b0533512f83f7cc699273766949dd9e4426/src/effects/operator/runtime-status.ts).
- [Herdr collector at the observed master](https://github.com/herdrdev/herdr/blob/cce57bc32c44b0a83b641fe5f8625cd3c93ba7e4/src/pane/osc.rs#L510).
- [Herdr pane schema at the observed master](https://github.com/herdrdev/herdr/blob/cce57bc32c44b0a83b641fe5f8625cd3c93ba7e4/src/api/schema/panes.rs#L473).
- [Herdr event schema at the observed master](https://github.com/herdrdev/herdr/blob/cce57bc32c44b0a83b641fe5f8625cd3c93ba7e4/src/api/schema/events.rs#L399).

## Results

- R1 changed only the two SOP files. `bun run check:reference-configs` exited 0 with all 25 projections equal. Worker diff, link and scope checks exited 0. Parent inspected the complete 18-line addition.
- D0 returned a source report at the fixed revisions above. It used Git and GitHub API reads. It did not install, edit, control Herdr or run a provider.
- Parent inline Python checks exited 0: exact four-file scope, byte-identical SOP projection, four local links/anchors, diagram delimiters and all referenced node aliases. `git diff --check` exited 0.
- `/usr/bin/java -version` exited 1 because no Java runtime is installed. PlantUML grammar compilation and image rendering were not run. The editable source remains available. No report content was sent to an external renderer.
- No product test, live Pi/Herdr acceptance, upstream code change or deployment is claimed. The change is local; it has no PR, merge or release result.
