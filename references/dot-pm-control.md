# Dot PM controller

Use this Skill when a Bot controls a repo-harness task. The human owns the goal
and required approval. The Bot selects bounded PM operations. Repo-harness owns
tasks, claims, requests, execution constraints and evidence. Coding agents own
code changes. Kanban is a read-only view.

## Local MCP boundary

Start the installed CLI with `repo-harness mcp serve --profile pm --transport stdio`.
The server has five tools: `pm_capabilities`, `pm_status`, `pm_dispatch`,
`pm_follow_up` and `pm_collect`. The tool schemas come from the shared PM core.
The PM profile does not expose shell, files, browser, coding, permission or
publication tools. Reader and runner overrides fail closed.
A local server installation does not establish a connection to Dot.

The operator supplies `pm-mcp.json` in the existing repo-harness user state root.
It must be owned, regular, private from group/other writes, and outside the
repository and its linked worktrees. It restricts the existing registry grant.
It creates no task state and no human approval. The operator configuration is
not a model input. Example for review only:

```json
{
  "protocol": 1,
  "repo_id": "repo_0123456789abcdef",
  "authorization_revision": 7,
  "allowed_operations": ["capabilities", "status", "dispatch", "follow-up", "collect"]
}
```

Use real registered values. The server binds repo and authorization revision.
Tool inputs cannot replace them. An unlisted operation is refused even if the
client knows its name. Configuration changes or registry revocation invalidate
the connection. Restart with a current operator-approved configuration.
The existing PM core locks and rechecks task, claim, token and write scope.
Stdio is a local trusted-host boundary. It is not remote principal authentication
or an OS sandbox for the controller process.

## Inactive HTTP boundary

The HTTP implementation uses the existing OAuth token store and session store.
It requires an operator-selected v3 local configuration with `profile: "pm"`,
`pm.enabled: true`, and the current registry `authorizationRevision`. The same
`pm-mcp.json` restricts all sessions to one registered read-write repository.
The normal setup command does not yet enroll this profile. No live configuration
or credentials are created by this change. HTTP stays inactive without these
operator prerequisites. Do not copy test tokens into a real installation.

PM tokens must have the PM profile, `repo-harness.pm` scope, current revision,
and a nonempty authorization ID. A planner or coding token cannot enter this
profile. Each session binds that ID. Another authorization cannot call, stream,
or delete it. Tool listing and calls recheck the current token and owner.
Revocation closes that owner's existing sessions. A profile, grant, or PM scope
change closes stale sessions. Each HTTP session uses the same startup scope
snapshot. A new session cannot silently accept a changed operation set.

The normalized repo/action scope fingerprint is part of the consent code,
access token and refresh grant in the existing OAuth store. A restart does not
upgrade an old token to a new repo or action set. Missing fingerprints fail
closed. Scope changes require fresh consent, even if the registry revision
does not change. A planner grant cannot become a PM grant.

The trusted server injects a synchronous execution guard through the CLI
wrapper into the existing PM effects. It is never a model request field.
After topology, task and registry lock waits, the guard rechecks the current
token, owner and operator scope before the action. The coding host and task
session paths carry the same guard through workspace and caller lock waits,
startup readiness, context publication and delivery acknowledgement. Collection
checks it under the session lock before writing the immutable result receipt.
The PM effect also rechecks canonical task, claim, grant and admission state.

Revocation stops new actions. Closing a socket does not cancel queued effects.
The guard supplies that fence. An already-issued launch or delivery cannot be
undone by this check. Its existing unknown-outcome evidence is retained. Recovery
needs the same canonical request or start intent. It must not create a new worker.

This path reuses existing host, origin, consent and OAuth checks. It creates no
second identity store, task ledger, or approval store. OAuth consent permits
bounded PM access. It does not approve a candidate or supply worker admission.

## Controller sequence

1. Read capabilities and status. Preserve canonical task, claim, generation,
   task revision and offer revision. Do not derive them from a board row or name.
2. Require the existing fleet acquisition and exact linked-worktree admission.
   `acquisition: unavailable` means the PM cannot acquire or approve it. The
   human/operator can use the existing CLI. Never invent an approval reference,
   user name, lease or worktree. Report `pm_acquisition_not_admitted` to the human.
3. Dispatch only that admitted canonical task. The core resolves its bound
   execution worktree and claim token before it creates the linked coding host.
   Record the returned canonical request ID and round. Do not create an external
   executor first or construct another task ledger.
4. If a response is lost, reuse the same canonical dispatch scope or request ID.
   The core uses the frozen input and canonical request as its retry receipt.
   Unknown delivery remains unknown. Do not create another worker to make it
   appear successful. A follow-up uses the same task and previous request tuple.
5. Collect the matching request result. Pending, provider exit and an interrupted
   executor do not establish completion. Keep the original request ID for later
   reconciliation. Report the canonical request/result evidence, not a new Bot
   account of execution. Do not submit a result on behalf of the coding agent.

A stale task revision, claim generation, request identity or registry revision
must stop the operation. Refresh status and explain the changed authority.
A collected result is not publication approval. Candidate SHA drift requires
fresh candidate-bound validation and approval through the existing acceptance
mechanism. Do not apply a previous candidate's approval to a new SHA. The PM
surface does not grant release, merge or publication authority.

## Verification limits

Real local stdio query and collection tests use canonical repository fixtures.
Fixture results are test evidence, not live coding-provider acceptance. Native
host tests are separate. OAuth and in-memory MCP handler tests cover identity,
scope, revision, revocation and owner isolation. The HTTP wire fixture is kept
as a required test. Its local run is blocked by loopback listen permission.
A real Dot connector, remote OAuth flow, event wake-up, and a live provider task
need platform evidence. They are unverified here. MCP tool availability does not
mean an event can wake Dot. Do not report
an end-to-end connection until the host and platform checks have passed.

For the canonical admission and effect contract, read [PM operations](pm-operations.md).
