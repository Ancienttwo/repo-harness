# Bot execution observation

Human owns goals and required approval. Dot/Grok selects bounded operations.
Repo-harness owns task and execution state. Codex/Claude implements the task.
Kanban is a read-only view.

## Recover a lost response

Use the same authoritative task ID and role. Read `task-agent status` to find
the saved request ID. Do not send again because a response was lost.
Get the expected candidate HEAD from the controlling task, not from a Bot's
claim about which candidate passed. Run:

```sh
repo-harness task-agent reconcile --repo <repository> --task <task-id> \
  --role <role> --request-id <saved-request-id> --expected-head <full-sha>
```

The query launches no worker and writes no receipts. It reads at most 100
request slots. It returns original evidence references and hashes. JSON
hashes use sorted-key canonical JSON. The context hash covers raw bytes.
`delivery: unknown` stays unknown even if the provider is alive.
`result_status: available` means a result matches the saved request and context.
It does not mean the result passed validation or received human approval.
`provider` is a process observation. It is not completion evidence.

An expected HEAD mismatch fails closed. The current HEAD does not prove which
SHA produced the result. `result_head_binding: unverified` makes this limit
explicit. Keep candidate-bound validation and approval in their current owners.
Protected host results return `host_authority`. Use their owning domain reader.
A missing, conflicting or changing request fails closed. Inspect the same task.
Do not create a new executor as a recovery step.

## Integration limits

This CLI trusts the local operator. Do not expose it as arbitrary remote shell.
No new Bot account, grant, credential or action approval is created here.
The existing MCP coding profile exposes shell and is not a Bot control profile.
The orchestrator HTTP profile has no distinct Bot principal/action grants.

Shared PM submit/collect work is in open PR #608. It is not merged or copied
here. Its acquisition/admission and native validation remain separate blockers.
After it lands, use its closed schemas and effects. Acquire authoritative
task/claim/execution IDs before creating the associated executor. Check current
repo/action grants on the server. A Bot-supplied human name or a nonempty
authorization reference is not human approval. Use stable request identity for
reconciliation. Do not allocate a fresh request for unknown delivery.

An intent-only controller Skill can select these operations. Persistent state
must remain in repo-harness. A thin MCP adapter must use the same effects and
must not accept commands, paths or permission overrides. A local MCP install
does not prove remote Dot access. Tool access does not prove event wake.
Dot/Grok remote access and event wake remain unverified.
