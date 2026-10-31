# Handoff Protocol

[AGENTS.md](../../AGENTS.md#handoff) owns the handoff rules. Use a checkpoint only
for context/session rollover or unresolved work, recording branch/worktree/HEAD,
goal, decisions, touched files, actual checks, blockers and the exact next command.
Keep temporary state under ignored `.ai/harness/handoff/`; read current-request files
first and verify live sources on resume. A stale snapshot cannot establish acceptance.
Ordinary completion belongs in the PR description, with no mandatory artifact chain.
