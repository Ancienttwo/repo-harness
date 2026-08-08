# Claude provider mode

Runs the Claude Code CLI (`claude -p`) as a read-only reviewer. Claude is
started with `--safe-mode` so host hooks, plugins, MCP servers, and repository
instructions cannot mutate or block the review process while the normal OAuth
credential remains available. It is given only `Read,Grep,Glob` (no `Bash`/`Edit`/`Write`),
so it cannot edit your code; the review scope's diff text is embedded directly
in the prompt since Claude has no Bash access to inspect the repo itself.

## Model and timeout

- Pinned to the `fable` alias so the external opinion does not silently
  follow the host's default model.
- If the fable route emits its explicit capacity-limit signal, retries exactly once on `opus`
  -- one fallback step, never a loop, and never a fallback to a
  different provider. Other nonzero exits remain failures even if they wrote
  stdout.
- Per-attempt default budget: 330 seconds; the bounded two-attempt capacity
  route therefore has a 660-second worst-case budget.
- Claude Code must support `--safe-mode`; an older CLI fails closed instead of
  loading host hooks or silently dropping isolation.

## Transcript recovery

Claude Code persists print-mode sessions to
`~/.claude/projects/<project>/<session-id>.jsonl`. If stdout is empty, the
runner recovers the last assistant message from the most recent matching
session file started after the run began. If a session file is found but no
usable assistant text can be extracted from it, the result is an explicit
`malformed_transcript` failure -- recovered text is never treated as a
passing review when the run itself timed out or exited nonzero.

## Command

```bash
repo-harness cross-review --provider claude
```

## Boundaries

- No merge-gate: this mode never produces or verifies a `merge-gate` receipt.
- No semantic fallback: timeout, empty output, malformed transcript, and
  auth failure are reported as distinct, explicit outcomes -- never
  silently retried against Codex instead.
