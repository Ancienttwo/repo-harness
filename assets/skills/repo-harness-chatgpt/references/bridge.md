---
name: repo-harness-chatgpt-bridge
description: Use when setting up or operating the repo-harness ChatGPT MCP Connector, bridging ChatGPT planning artifacts into Codex execution through repo-harness PRDs, checks, and issue-based goals.
---

# repo-harness-chatgpt-bridge

You are operating inside a repo-harness adopted repository.

## When To Use

Use this Skill when the user asks to set up, operate, inspect, or continue the repo-harness ChatGPT MCP Connector, or when a ChatGPT-generated repo-harness PRD or issue-based Goal handoff needs to be consumed by Codex.

This Skill has four modes:

1. Setup mode: configure local MCP server files, ChatGPT guide, or Codex MCP config.
2. Planning handoff mode: preserve the chain idea -> PRD -> issue-based Goal.
3. Execution mode: local Codex executes the prepared Goal prompt against the current GitHub issue.
4. Direct coding mode: an explicitly enabled `coding` profile opens a granted repo workspace, retains the workflow/status tools, and adds five guarded coding/process tools without invoking Codex.

## First Reads

Before acting, read the repo-local source of truth that matches the mode:

- Setup: `docs/repo-harness-chatgpt-mcp-setup.md`, `.repo-harness/mcp.local.json` if present, and `repo-harness mcp doctor --repo .`.
- Planning handoff: `docs/spec.md`, `tasks/lessons.md`, existing `docs/prds/`, and the bridge files `.ai/harness/handoff/task-goal.md` and `.ai/harness/handoff/chatgpt-plan.md` when present.
- Execution: the prepared Goal prompt, the current GitHub issue and its claim comments, any referenced PRD under `docs/prds/`, and `tasks/lessons.md`.

Do not rely on chat history when these files exist.

## Agent Responsibilities

1. Treat ChatGPT as planner/reviewer and Codex as executor.
2. Prefer `repo-harness mcp` CLI commands over manual file edits when preparing setup or handoff artifacts.
3. In planner mode, keep ChatGPT write access limited to PRDs under `docs/prds/`, `tasks/lessons.md`, and the two bridge files under `.ai/harness/handoff/`. Direct source writes require the separate coding profile.
4. Treat the GitHub issue as task authority. A PRD or other planning document does not widen execution scope.
5. Prepare Goal prompts from an OPEN GitHub issue; do not invent task identity from local files.
6. Report exact commands run, files changed, checks passed, and any remaining blocker.

## Required Planning Chain

For execution-ready planning, keep the chain explicit:

1. idea -> PRD: use `write_prd_from_idea`; the PRD is written under `docs/prds/`.
2. Issue -> Goal: run `repo-harness mcp prepare-goal --repo . --issue <n>` against an OPEN GitHub issue.
3. Codex execution: send the printed Goal prompt to the explicitly addressed Herdr agent. The issue owns task identity, scope and completion.

The local CLI is:

```bash
repo-harness mcp prepare-goal --repo . --issue <n>
```

The command prints the Goal Prompt shape from the repo-harness-product goal
reference. It reads the issue title, body, URL and state. An unavailable or
non-OPEN issue exits 2 and names the reason. Use the user's language for status reports unless repo-local instructions require otherwise.

## Safety Boundaries

Never do these through planner, executor, or orchestrator MCP profiles:

- Do not expose arbitrary shell execution.
- Do not allow ChatGPT to edit application source files.
- Do not commit secrets, OAuth passphrases, bearer tokens, tunnel tokens, or `~/.codex/auth.json`.
- Do not paste MCP OAuth passphrases into chat, logs, issues, PRs, or handoff files.
- Do not implement or run a default remote `codex exec` runner.
- Do not modify `_ref/`, `_ops/`, `.env*`, `.git/`, package lockfiles, or source paths through planner-profile MCP tools.

MCP prints a Goal prompt from an OPEN GitHub issue; the task owner directs its explicitly addressed Herdr agent.

Coding exception: the user may explicitly run user-scoped setup with `--profile coding --grant-read-write <repo>`. That profile retains the workflow/status tools and adds exactly five direct coding tools: `open_workspace`, `read`, `apply_patch`, `exec_command`, and `write_stdin`. It is revision-bound to explicit repo grants, defaults to managed worktrees, and runs Bash with local-user authority. It must remain off by default; shell is not a filesystem sandbox. It still hard-denies secret paths, `.git/**`, `.env*`, `_ops/**`, writable `_ref/**`, traversal, and symlink escapes.

## Setup Commands

Use these commands from the adopted repo root:

```bash
repo-harness mcp doctor --repo .
repo-harness mcp setup chatgpt --repo .
repo-harness mcp setup codex --repo . --scope project
repo-harness mcp install-skill --repo .
```

Enable direct coding only after the user accepts the local-shell trust model:

```bash
repo-harness mcp setup chatgpt --profile coding --grant-read-write <repo> --endpoint https://host/mcp
repo-harness mcp serve --repo <repo> --transport http --host 127.0.0.1 --port 8765 --profile coding
repo-harness mcp doctor --repo <repo> --live
```

Run the local HTTP server for ChatGPT:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Run stdio for local Codex MCP config:

```bash
repo-harness mcp serve --repo . --transport stdio --profile executor
```

## Execution Checklist

When consuming a prepared Goal prompt:

1. Verify the GitHub issue is OPEN and still owns the requested scope.
2. Read the issue title, body, acceptance checks and any referenced PRD under `docs/prds/`.
3. Open or use the requested worktree.
4. Execute the issue scope only.
5. Run the acceptance checks and focused tests.
6. Leave the issue or PR with the revision, changed files, command results and remaining blockers.
7. At closeout, run repo-required checks or document why the issue narrowed the check surface.

## Troubleshooting

- ChatGPT cannot connect: verify the HTTPS tunnel ends in `/mcp` and local `/health` responds.
- ChatGPT auth loops: prefer `allow once`; persistent `allow always` may require OAuth/session follow-up.
- Tool scan misses tools: restart `repo-harness mcp serve` and rescan the Connector.
- Coding is disabled: verify user-scoped v3 config, a live `read_write` grant, and current OAuth authorization revision.
- Coding process sessions are pipe-only under Bun; stdin, polling, Ctrl-C/SIGINT, and process-tree cleanup remain supported.
- Codex cannot see the MCP server: rerun `repo-harness mcp setup codex --repo . --scope project`.
- `prepare-goal` exits 2: read the message. The issue number, `gh` availability, or the issue state blocks Goal preparation.
