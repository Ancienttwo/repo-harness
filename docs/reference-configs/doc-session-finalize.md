# Doc session finalization integration

Issue #1023 has two independent operation factories in
`src/effects/operator/doc-session-finalize.ts`. They are not HTTP routes.
This slice does not enable publication or deletion in the server.

## Call contract

- `docSessionCommitOperation(sid, fields, deps)` accepts `expected_head`,
  `expected_diff_sha256`, and the user's edited `message`.
- `docSessionDiscardOperation(sid, fields, deps)` accepts `expected_head`
  and `expected_loss_sha256`.
- Both return `OperatorWriteOperation`. Call `runOperatorWrite(request_id,
  operation, env)` for both CLI and HTTP. The shared target is
  `docs_session:<sid>`. The factories reject unknown request fields.
- Execute the effect in a bounded write worker. Git and filesystem observations
  are synchronous and must not run on the HTTP serve loop.
- `readDocSessionFinalization(env, sid)` returns null or a safe progress object
  for the detail page. It omits saved messages, target URLs and filesystem paths.

The integration owner retains `server.ts`, `doc-sessions.ts`, route inventory,
write-boundary tests, and the host/lifecycle adapter. The core owns no launcher,
resume implementation, frontend, or GitHub CLI adapter.

## Required server capabilities

`with_quiesced_session(sid, action)` must acquire the lifecycle exclusion shared
with messages and resume. It must refuse active turns, stop an idle host, prove
that the host and descendants have stopped, and keep resume excluded until the
promise settles. A stopped session needs no restart. Event-log activity alone is
not proof of host exit. A missing or uncertain host state must fail closed.
Replays after a successful discard must also work when the worktree is gone.

`validate_changes(record, changes)` must inspect the complete base-relative
changes. Use the existing writable-path policy and
`readArchitectureHandEdits` (the authority behind
`architecture-projection hand-edits --json`). Reject out-of-scope paths,
instruction files, generated targets and generated regions. Provider failure
must refuse the commit. Throw `DocSessionScopeRefusal(code, relativePaths)` to
return the PRD's 422 code and file list. There is no permissive default here.

`publication_target(record)` selects the registered repository's remote and
GitHub default branch. Resolve these from server-owned registry/provider data,
not request fields. The core pins the single push URL in its journal. It refuses
a changed or multi-URL remote. The adapter must verify that this URL identifies
the selected GitHub repository; fixture tests use a local bare remote.

`find_draft_pr` must query all PR states for the exact repository/head/base and
verify the head SHA and Draft state. Ambiguity, an existing incompatible PR, and
query failure must throw. Only a successful absence query returns null.
`create_draft_pr` returns `created`, `not_created`, or `unknown`. Only proven
absence of any creation permits `not_created`. A timeout or failed response parse
is `unknown`. Both adapters must use server credentials outside the docs host.

## Persistence and recovery

`<session directory>/finalize.json` binds the action fields and durable progress.
It is outside the removable worktree. The private finalization lock excludes
other direct core calls. The shared write-run also excludes commit/discard and
records the outer intent/result. Commit, push, PR creation, worktree removal and
branch deletion each record their own global intent/result before and after
execution. Audit failure cannot authorize the next step.

The journal persists each step's request_id before execution and links a retry
to its prior attempt. Recovery reads that exact intent/result pair through the
shared audit authority. A missing result stays `step_audit_incomplete`, even if
HEAD or the remote matches. This slice does not repair missing audit results:
operator reconciliation is required. A recorded failed attempt can retry under
a new linked step ID. The new attempt audits the observed Git result before it
advances. Provider readback recovery also has a separate audited step.

Before writing a Git object or journal, commit checks the encoded JSON size
against the same 32 KiB bound used by the journal reader and writer. The check
reserves the largest later PR and audit fields. Oversized escaping or target
metadata returns 413 `finalize_state_too_large`; the message is never truncated.
An unchanged prepared attempt that fails scope validation returns 422 and its
safe relative file list before further Git operations.

Commit snapshots use the canonical #1153 digest and a temporary private index.
They preserve the user's index, including independently staged bytes. A new
initial finalization requires HEAD at the session base: the docs host cannot
write Git metadata. Externally created intermediate commits need manual review;
a final tree diff cannot authorize hidden bytes in their ancestry.

The persisted candidate commit precedes the compare-and-swap branch update.
Push is non-force, publishes exactly that commit, and reads the remote SHA back.
A push failure can resume the existing commit. After push, retries continue from
PR lookup/creation. An uncertain PR creation is never repeated automatically;
a later exact lookup can recover the created PR. A proven PR failure can retry.

A retry after a recorded partial failure needs a **new request_id and identical
action fields**. The same request_id replays the shared write-run result. A
changed message or digest conflicts with an existing finalization. A partial
local deletion requires reconciliation; it never resumes deletion from a stale
loss approval. A completed journal replays the result.

Discard holds the topology and lifecycle exclusions. It checks canonical loss,
HEAD, ownership, process inventory, branch use by other worktrees, and a live
remote branch lookup. Unknown process inventory refuses deletion. A pushed
branch is retained. The adapter must provide the UI's manual-command guidance;
this module returns `branch_pushed`. It never deletes a remote branch. Merged
worktrees remain the responsibility of closeout and sweep.

## Acceptance still required

Core tests use real temporary Git repositories and bare remotes. PR-provider,
scope, lifecycle and process-inventory adapters are fixture seams; these tests
do not establish production adapter correctness. Cloud process inventory could
not prove complete `/proc` access, so production deletion fails closed there.

Before enabling the routes, finish native lifecycle and process acceptance,
real scope/generated-region adapter tests, HTTP/CLI composition and response
schema tests, bounded-worker behavior, and architecture model registration.
Keep #1149 D1 and the High gatekeeper/cross-model reviews open. This slice grants
no merge, release, deployment or production publication authority.
