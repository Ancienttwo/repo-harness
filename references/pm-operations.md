# PM operations and host admission

This interface is shared by Bot hosts. It adds no task scheduler or task store.
The PM model receives task-level operations. An operator owns host configuration.

## CLI contract

Send one JSON object to `repo-harness pm request` on stdin. The command returns
one `repo-harness-pm-response` object. `ok: false` returns a nonzero exit code.

```json
{"protocol":1,"operation":"capabilities"}
```

The response contains the current closed operation schemas. Adapters must use
those schemas and reject an unknown inventory. Do not keep a second schema copy.

| Operation | Effect |
| --- | --- |
| capabilities | Return schemas, dispatch limits and runtime admission readiness. |
| status | Read current offers, claim identities and worker observations for a registered repo. |
| dispatch | Start or recover the same admitted OAR coding task and submit its frozen input. |
| follow-up | Send a bounded message to the same task after checking its prior request identity. |
| collect | Validate and ingest the existing request-bound TaskResult. |

Dispatch, follow-up and collection carry canonical task, claim and revision
fences. Collection can write an immutable evidence record, so it requires the
repository write grant. It does not require permission to start a coding host.
Status remains available for read-only observation.

No operation takes a shell command, executable, environment, permission setting,
arbitrary output path or publication command from the model. Unknown fields fail.

## First-slice dispatch scope

The task must already have a valid canonical lease, token and linked worktree.
The operator must approve that exact worktree. Missing acquisition or admission
returns `pm_acquisition_not_admitted`. Prepare it through the existing fleet
acquisition and operator workflow. The PM cannot approve a write grant itself.

Task, topology and repository authorization locks use the existing lock paths.
The launch and delivery effects hold those locks through their awaited action.
The running model turn does not retain those locks. Unknown delivery remains
attached to the original request; a retry must not create a second worker.

## Operator file

The CLI reads `pm-host.json` under the existing repo-harness user state root.
The file and its parent must be owned, regular and not group/other writable.
The configuration must be outside the execution worktree. It is not a PM input.

The shape below is an example for review, not an installation instruction or
an approval. Every path, identity and authorization reference needs real values.

```json
{
  "protocol": 1,
  "endpoint": {"session": "operator-selected-session"},
  "parent_pane": "live-parent-pane-id",
  "max_requests": 3,
  "admission": {
    "version": 1,
    "runtime": "codex",
    "execution_root": "/absolute/approved-linked-worktree",
    "node": "/absolute/node-24-or-25",
    "executable": "/absolute/codex",
    "model": "operator-selected-model",
    "effort": "high",
    "approval_policy": "never",
    "filesystem": "worktree-only",
    "authorization_ref": "exact-human-approval-reference"
  }
}
```

OAR 0.37.0 disables interactive approval by default. This implementation does
not treat that default as user approval. Activation needs approval of the exact
`never` policy together with the enforced child boundary. The PM has no tool to
write or broaden this configuration.

Only macOS Codex is conditionally supported in this slice. The child and its
descendants are restricted by Seatbelt to the exact admitted worktree. Control
records, Git metadata, agent instructions, hooks and credentials stay protected.
Pre-existing hardlinks and special IPC entries are refused. No additional HOME
or native-state write grant is made. A real Codex startup can therefore fail;
do not widen permissions as a retry. Other runtimes and platforms fail closed.

This boundary assumes a trusted host administrator. It does not contain an
unrestricted administrator that changes files after the admission probe.

## Evidence and closeout

OAR observations do not create TaskResult. An idle pane, a successful process
exit or a completed OAR turn without a matching result remains incomplete.
The existing collection code checks request ID and context hash. Cleanup waits
for the owned OAR session's disposal acknowledgement before closing its pane.

Keep scripted-library, real OS boundary, native host inventory and real-provider
checks separate. Report missing live-provider evidence as unverified.

For the current Hermes adapter, see `assets/hermes/README.md`. It uses a dedicated
profile and the same CLI schemas. Its tool restriction is a model tool boundary,
not an OS sandbox for the Hermes process. Grok and Dot need their own host checks.
