# Fleet placement and canonical task counts

AKN-04a implements the approved Agent-first Kanban roadmap section 8.3. The source base is AKN-03b `75036305`; notification reconciliation (AKN-03c) is an independent sibling. This document describes the source contract. Stage acceptance, PR integration and installed runtime validation remain separate evidence.

## Authority and wire boundary

Canonical Board owns `task_state`, row identity, Lease state and publication pointers. TaskOffer owns `execution_readiness` and its exact `{code, attention_owner}` blocker pairs. `src/effects/fleet/board.ts` joins these observations; `src/core/fleet/board.ts` owns placement and aggregate counts. Operator projection allowlists the result without semantic reclassification. The browser checks the protocol, closed field vocabularies, unique identities and count conservation.

Fleet protocol 4 becomes 5; Operator protocol 5 becomes 6. The old top-level `card.column` is removed. Every card carries one `placement`:

| Shape | Meaning |
| --- | --- |
| `{kind: column, column: available / working / in_review / ready_to_merge / done}` | Existing lifecycle stage |
| `{kind: preparation}` | Pending work whose preparation or authorization prerequisites are incomplete |
| `{kind: alternate_workflow, workflow: inline}` | Canonical work using the inline workflow |
| `{kind: unclassified, reason: ...}` | Failed, contradictory, unavailable or unmapped observation |

`readiness_blockers: null` means no TaskOffer observation; `[]` is an observed empty blocker set. Merge blockers remain a separate field and source. Missing fields, old protocol, retired `column`, malformed unions and unknown blocker vocabulary are rejected by the browser.

## Classification precedence

1. A failed card observation is `unclassified / observation_failed` and retains its safe typed error. Siblings remain visible.
2. Canonical `missing` and `drifted` take precedence over surviving Lease facts (`canonical_missing`, `task_drifted`).
3. Done remains done. A reviewing Lease with a publication uses merge readiness. Reserving, bound and completing remain working. Reacquisition blockers do not move these tasks back into preparation or create readiness-derived attention.
4. Only pending work with an available Lease uses TaskOffer readiness. Empty-blocker `execution_ready` is available; empty-blocker `inline_ready` is alternate workflow.
5. `planning_required` or `unsupported` is preparation only with a nonempty blocker set entirely composed of `repo_read_only`, `plan_missing`, `plan_not_approved`, `plan_not_projectable`, `contract_missing`, `contract_not_projectable`.
6. Missing authority is `readiness_unavailable`. Ambiguous plans, source mismatch, unsupported modes, contradictory ready/blocker combinations and other unsupported readiness remain `unsupported_readiness`. Unmapped Lease/state combinations remain `state_unmapped`.

Normal preparation and inline work preserve repository health. Unclassified observations degrade it. Readiness owners participate in pre-execution attention; raw blocker pairs remain available for detail even when valid execution facts take precedence. The browser distinguishes preparation, available to acquire, and claimed/review stages; it does not infer worker activity from Claim or notification observations.

## Count conservation

`known_tasks` counts observed canonical tasks, including drifted tasks and failed card observations. Each contributes to exactly one of the five columns, preparation, alternate workflow or unclassified. A `task_state: missing` row is only an `isolated_execution` record; it contributes neither to known tasks nor to the placement totals. Unreadable repositories have unknown task counts and contribute only to `unreadable`.

Thus:

`known_tasks = available + working + in_review + ready_to_merge + done + preparation + alternate_workflow + unclassified`

The core rejects repeated repository/task identities. The browser rejects duplicated identities and any counts that disagree with the delivered cards. Repository health and the stage matrix show isolated execution separately and display unknown counts for unreadable repositories. Neither layer invents hidden task totals.

## Verification and limits

- The existing Fleet unit suite records the missing-plan degraded regression and covers preparation codes/owners, stage precedence, contradictory readiness, inline work, failed-card containment, isolated execution, duplicates and digest stability. Before-fix evidence: `.ai/harness/runs/akn04-placement/preparation-before.log`.
- Existing Fleet effects fixtures exercise the real canonical Sprint -> TaskOffer -> Fleet path for read-only inline, writable inline and a missing-plan contract, proving exact blockers and no source/registry mutation.
- Existing Operator projection, decoder, CLI, server, write-boundary and UI suites cover the protocol cutover and consumer behavior. The contract Verification Plan owns executable acceptance evidence.
- A local GET-only fixture server served the built browser bundle on `127.0.0.1:43924`. Browser inspection confirmed healthy preparation/inline/available grouping, approval owner/code detail, English/Chinese labels and the mobile detail pane. No live repository or runtime mutations were enabled.

Rollback Fleet, Operator and browser together. This read-model cutover has no persisted domain migration. It does not authorize CodeGraph indexing, Host/provider activation or runtime installation. At 10x task count, projection and count validation remain linear; existing repository IO and provider budgets are unchanged and remain the first scaling pressure. New scoped context/activity routes remain AKN-04b and the full monitor-home redesign remains AKN-05.
