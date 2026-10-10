# Bot request readback

## Goal

Let a controller inspect one saved request after a lost response. Keep task,
claim, execution and evidence state in the current stores. Do not launch work.

## P1: Map

Base: `461e054ee5538bc4038fee8b5c3c5011435fbbf8`.
`task-agent` calls `effects/terminal/task-session`. Git owns the primary and
execution checkout identities. Request files, delivery markers and result
files are the evidence. Fleet leases and claim tokens own task execution.
The pipeline ledger projects progress. Kanban observes that projection.

Open #608 at `36722705a3d378cbf2e29f30580d2fec1e09f216` owns the shared PM
protocol, locked dispatch and Hermes transport. Its acquisition is unavailable.
It is not a dependency of this change. #609 owns the read-only Board.
#604 owns the paused release candidate. Do not change those branches.

## P2: Trace

`task-agent send` saves a UUID request, context bytes and a start marker before
delivery. A failed response saves unknown delivery and raises an error.
Another send cannot pass a pending round. `status` lists request IDs.
`read` selects a round. Neither returns a bounded ID-selected receipt with
evidence references and a candidate HEAD fence. `collect` writes primary state.
The new query must use `readTaskAgent`, `assertTaskRequest` and
`readTaskRequestResult`. It must not call send, collect or Herdr mutations.

## P3: Decision

Add `task-agent reconcile`. Require task, role, stable request ID and expected
execution HEAD. Search at most the binding's 100 request slots. Return delivery,
provider observation, validated result and canonical evidence hashes. Check
HEAD before and after the read. Fail on request identity or context drift.
This is historical execution evidence. It grants no acceptance or approval.
The supplied HEAD is a query fence, not proof that the result ran on that SHA.

Do not add a remote MCP surface yet. Main's orchestrator HTTP profile has no
Bot principal/action grants. Reuse the CLI effect after those grants exist.
Do not copy #608's PM core or create a second operation store. A PR based on
main also avoids the main-only publication readiness gate for stacked branches.
At ten times the request count, the fixed 100-slot session limit is the bound.

## Task Breakdown

- Implement the read-only effect and CLI query.
- Test repeated queries, unknown delivery, interrupted provider, SHA drift,
  bad result identity, context drift and protected host results.
- Run typecheck, affected tests and affected CI checks. Record all failures.
- Get a read-only review. Commit and open a Draft PR against main.

## Deferred integration

The full Bot submit chain still needs #608 acquisition/admission and a verified
Bot principal with server-owned repo/action scope. Human approval must name the
exact candidate and action. A Bot-supplied person name or authorization reference
is not approval. A controller must get authoritative task/claim/execution IDs
before it creates a linked executor. Do not retry unknown delivery as new work.
Candidate changes must invalidate old approval and acceptance in their owners.

Install an intent-only Skill at the controller. Call the shared PM operations
through a thin typed adapter. Keep shell, credentials, permissions, release and
publication out of that adapter. Keep evidence source references and hashes.
Dot/Grok remote tool access and event wake are separate platform connections.
Local MCP installation proves neither. Both remain unverified here.

## Acceptance follow-up

Independent static review of published `f658da3e` found no confirmed blocking
defect. Follow-up tests cover HEAD/context changes during the read, missing
delivery, real provider exit, invalid input and the 100-request bound. They do
not weaken the existing assertions. The production readback code is unchanged.

The initial sandbox test failed because `ps` was denied. The same command then
ran through the tool's explicit execution approval path. The expanded file
passed 18 tests and 70 assertions. No global permission policy was changed.

The first dependency source had Pi 1.0.0, while this lock needs 1.1.0. Interrupted
local installation left an incomplete copied package. These were environment
failures, not a verified clean-base compiler failure. A complete installation
was copied from `/tmp/repo-harness-wt-0212-main-sync/node_modules` into this
task's own directory. Its lock is equal except for the root Pi peer constraint
(`1.1.0` versus `*`); all locked package entries match. Installed Pi is 1.1.0
and OAR is 0.45.1. Typecheck passes on both this source and isolated unchanged
base `461e054e`, using the same dependencies. No dependency file was changed.

Local `check-ci.sh affected` was interrupted during installation (exit 130).
This is not a GitHub Actions result. Local offline installation also stalled
against the configured `/Volumes/D/caches/npm` cache and was interrupted.
Neither installation is claimed as passing. Final affected coverage selects
370 files. Run the selected test lane without changing its test selection or
assertions. Record its result separately from the aggregate install command.
