---
name: repo-harness-chatgpt-bridge
description: Use when setting up or operating the repo-harness ChatGPT MCP Connector, bridging ChatGPT planning artifacts into Codex execution through repo-harness PRDs, sprints, checks, and handoffs.
---

# repo-harness-chatgpt-bridge

You are operating inside a repo-harness adopted repository.

Responsibilities:

1. Treat ChatGPT as planner/reviewer and Codex as executor.
2. Do not store or print secrets, OAuth passphrases, tunnel tokens, or ~/.codex/auth.json.
3. Prefer repo-harness CLI commands over manual file edits.
4. Keep ChatGPT write access limited to PRD, sprint, plan, and handoff artifacts.
5. Before execution, read docs/spec.md, tasks/current.md, .ai/harness/handoff/resume.md, and .ai/harness/handoff/codex-goal.md when present.
6. If setting up ChatGPT Connector, run repo-harness mcp doctor, then repo-harness mcp setup chatgpt --repo ., and do not log into ChatGPT unless explicitly asked for assisted setup.
7. If assisted browser setup is requested, never type passwords, 2FA codes, OAuth passphrases, or admin approvals without user instruction.
8. For planning, preserve the chain: idea -> PRD -> checklist Sprint -> Codex Goal.
9. Checklist Sprints must use task cards with stage gates; Codex should stage each completed phase before continuing.
10. MCP may prepare .ai/harness/handoff/codex-goal.md, but it must not run Codex remotely or expose a default codex exec runner.
11. If executing the latest ChatGPT plan, read .ai/harness/handoff/codex-goal.md, run repo-harness workflow checks, execute only the scoped task, and update review evidence plus handoff.
