# Bot execution observation

Human owns goals and required approval. Dot/Grok selects bounded operations.
Repo-harness owns task and execution state. Codex/Claude implements the task.
Kanban is a read-only view.

## Recover a lost response

Use the same authoritative task ID and role. Do not send again because a
response was lost. A lost response can mean the input was delivered.

Treat delivery as unknown. Use the herdr skill in the explicitly identified
session. Read the peer pane with `herdr agent read <name> --source
recent-unwrapped` to inspect its state. Empty scrollback does not prove that
delivery failed: the peer can accept the prompt and not show it yet. Never send
the same request again because the pane shows nothing. A resend can repeat
edits or side effects. Ask the same peer a status question that does not replay
the request, or hand the decision to the operator. Do not start a new executor
as a recovery step.

Terminal output is observation. It is not a result, completion evidence or
human approval. Keep candidate-bound validation and approval in their current
owners. Get the expected candidate HEAD from the controlling task, not from a
Bot's claim about which candidate passed.

Protected review and coding results stay with their domain readers
(`repo-harness review status` and the PM collect path). A missing, conflicting
or changing request fails closed. Inspect the same task.

## Integration limits

Herdr control trusts the local operator. Do not expose it as arbitrary remote shell.
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
