# Read-Back Mode: MCP Invocation Evidence

Reconciles the `repo-harness-gptpro` "MCP Read-Back Acceptance"/"Pro Surface
Fallback" sections with the ChatGPT Connector setup guide's "Connector
Invocation Evidence" section. Both prose owners shared this contract; this
file is now their single source.

## Four Independent Readiness Checks

1. Endpoint: the sidecar and public HTTPS `/mcp` endpoint respond.
2. Schema: ChatGPT Connector settings show the expected Action after
   Refresh/Scan Tools.
3. Selection: a fresh chat has the recorded Connector selected from `+` ->
   More.
4. Invocation: the current model surface emits a real tool call.

## Accepted Evidence

Only a visible `Called tool` event with the selected Action/result, or an
equivalent captured tool-call transcript, proves MCP invocation. Connector
selection, assistant self-report, plausible JSON, and sandbox shell commands
do not prove that ChatGPT called MCP.

For Pro runs, the tool-call runtime UI may not appear the way it does for
other models because Pro uses a sandbox/process flow. Open the assistant's
`Thinking`/`Thought for ...` disclosure (the right-side process pane) to
confirm whether Pro emitted a real `Called tool` event, which action it
chose, or whether it only reasoned inside the sandbox without invoking MCP.

Outcome labels:

- `invocation_verified`: a real `Called tool` event or captured tool-call
  transcript.
- `approval_pending`: a real tool request produced a confirmation prompt.
- `surface_blocked`: schema is current but the model surface did not call MCP
  (sandbox-only reasoning, or `app_unavailable` with no tool event).
- `bundle_fallback`: Pro is reviewing a local evidence bundle instead of
  reading through MCP.

## Acceptance Requirement For Review Prompts

- Use the recorded `chatgpt.serverName` to read current repo state before
  producing findings or a merge/readiness verdict; a prompt asking ChatGPT to
  use MCP is not sufficient by itself.
- Before the attempt: open ChatGPT Settings -> Connectors for the recorded
  server, Refresh/Scan Tools, verify the expected Action, then start a fresh
  chat (Deep research enabled when the review needs it) and select the
  Connector from `+` -> More.
- For multi-repo/user-scope reads, call `discover_harness_repos` first and use
  the returned exact target; do not guess a literal relative path.
- Read the actual changed-file list/diffs/artifacts through the recorded
  server; pasted summaries are context, not evidence.
- Include an `MCP Read Evidence` section in the final answer naming the
  server, the reads performed, and the files/diffs/artifacts inspected.
- Missing/unconfigured `chatgpt.serverName`: treat setup as incomplete and
  route to `setup.md`.
- Unavailable, blocked, stale, or restricted server: classify the result as
  blocked or partial, never merge-ready.
- Never ask ChatGPT to retrieve secrets, cookies, browser storage, `_ops/`
  state, or other denied paths through the recorded MCP server.

## Pro Surface Fallback

When Pro is `surface_blocked`: stop retrying the same connector prompt after
one explicit-tool retry, and do not delete/recreate the Connector as the
first response. Reuse the local GPT Pro/Oracle consult path (`consult.md`) to
build a bounded local evidence bundle instead, with a provenance header:

```yaml
source: local_repo_harness_bundle
pro_invoked_mcp: false
working_tree: clean | dirty
included_paths: [...]
omitted_or_truncated: [...]
```

Tell Pro that anything outside the bundle is unknown. Codex still executes
and verifies locally, then creates a fresh post-change bundle for another Pro
review if needed. Do not claim MCP read-back evidence for fallback output.

## Boundaries

- Repo-scope setup is repo-bound; broad multi-repo discovery requires
  explicit user-scope setup with registered repos, never a default full-disk
  read.
- Does not treat GPT Pro advice as implementation authority; Codex still owns
  repo edits and verification.
