# Read-only worktree cleanup session

This slice implements investigation and preview for #1025. It does not install an
archive or deletion actuator. The existing green cleanup endpoint keeps its
existing contract; it does not accept these plans as authorization.

## Create

`POST /api/v1/sessions` accepts the normal audited `request_id` and:

```json
{"kind":"worktree_cleanup","runtime":"codex"}
```

Optional `ids` selects 1–16 distinct server worktree IDs. Without `ids`, the server
selects its bounded inventory. More than 16 items returns 422
`inventory_too_large`. Client paths, advice and deletion grants are invalid.
The runtime must have verified isolation and the configured docs use. Unsupported
platforms return 501 `platform_unsupported`; there is no Linux fallback.

Success returns 201 with `protocol: 1`,
`kind: operator_worktree_cleanup_session_created`, and `session_id`.
An unknown preparation or launch outcome stays unresolved in the existing audit.
Retrying its request ID does not create another host.

CLI: `repo-harness operator doc-sessions cleanup --runtime codex --json`.
Use `--ids '<JSON array>'` for selected IDs and `--request-id <uuid>` for readback.

## Preview

`GET /api/v1/sessions/<sid>/plan` accepts no query. CLI:
`repo-harness operator doc-sessions plan <sid> --json`.

The exact envelope is:

```json
{
  "protocol": 1,
  "kind": "operator_worktree_cleanup_preview",
  "session_id": "<32 hex>",
  "runtime": "codex",
  "state": "investigating",
  "agent": null,
  "observed_at": "<UTC timestamp>",
  "plan": null,
  "execution": {"enabled": false, "code": "cleanup_execution_unavailable"}
}
```

`state` is `investigating`, `ready` or `unavailable`. Only `ready` has a non-null
`plan`. `agent` is null or the existing host state. Missing sessions return 404;
unsafe, corrupt or inconsistent storage returns 503. The read does not start or
resume a host. Agent failure or stop before a plan makes the preview unavailable.

`plan` is the existing `CleanupPlan` from `core/operator/worktree-cleanup-plan.ts`:
its items contain `worktree`, `advice`, `loss`, `loss_sha256` and `plan_sha256`.
Each item's hashes bind the saved observation and advice. There is no global plan
hash or flattened duplicate item contract. Advice must name every item exactly
once. Incomplete or red observations require `keep`. Private archive directories
must equal that item's repository ID. Reading a stored plan recomputes its binding.

The timestamp names the saved observation, not a fresh filesystem check. A later
turn uses that same observation. Future execution must re-observe under its own
locks and apply the existing loss, preservation and removal proof checks.
The disabled execution flag is authoritative for this slice.

## Shared host and frontend integration

The existing `events`, `messages` and `stop` routes and `epoch.seq` cursors apply.
The transcript exposes tool categories, turn boundaries and a fixed investigation
summary. Raw advice, commands and tool output do not enter it. The plan contains
only the existing public-safe advice and loss summary, never private target paths
or full content evidence. Idle resume retains the read-only purpose.

`GET /api/v1/sessions` now includes `kinds: ["docs", "worktree_cleanup"]`.
Its `sessions` array remains the docs continuation list. Cleanup sessions reopen
through their saved session ID and plan route. A cleanup recent-session list is
not part of this slice.

Frontend PR #1185 must consume this envelope and the existing nested item contract.
Its proposed duplicate cleanup core shape must not replace the backend plan core.
Keep execution controls disabled until the separately reviewed actuator is wired.

## Evidence and remaining gates

Cloud tests exercise real temporary Git repositories, private storage, HTTP and
CLI reads, audited refusal and the real Node host with OAR scripted events.
Scripted runtime coverage is not real-provider acceptance. The macOS native test
checks parent and descendant denial for primary docs/source/Git and another
worktree, permits scratch writes, and checks admission without a docs directory.
Linux cannot perform that native proof. True provider/D1 and independent High
review gates remain separate.
