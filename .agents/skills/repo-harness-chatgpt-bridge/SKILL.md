---
name: repo-harness-chatgpt-bridge
description: Use when setting up or operating the repo-harness ChatGPT MCP Connector, bridging ChatGPT planning artifacts into Codex execution through repo-harness PRDs, sprints, checks, and handoffs.
---

# repo-harness-chatgpt-bridge

You are operating inside a repo-harness adopted repository.

## When To Use

Use this Skill when the user asks to set up, operate, inspect, or continue the repo-harness ChatGPT MCP Connector, or when a ChatGPT-generated repo-harness PRD/Sprint/Goal handoff needs to be consumed by Codex.

This Skill has four modes:

1. Setup mode: configure local MCP server files, ChatGPT guide, or Codex MCP config.
2. Planning handoff mode: preserve the chain idea -> PRD -> checklist Sprint -> Codex Goal.
3. Execution mode: local Codex reads `.ai/harness/handoff/codex-goal.md` and executes the referenced checklist Sprint.
4. Direct coding mode: an explicitly enabled `coding` profile opens a granted repo workspace and uses the five guarded coding/process tools without invoking Codex.

## First Reads

Before acting, read the repo-local source of truth that matches the mode:

- Setup: `docs/repo-harness-chatgpt-mcp-setup.md`, `.repo-harness/mcp.local.json` if present, and `repo-harness mcp doctor --repo .`.
- Planning handoff: `docs/spec.md`, `tasks/current.md`, existing `plans/prds/`, existing `plans/sprints/`, and latest `.ai/harness/handoff/`.
- Execution: `.ai/harness/handoff/codex-goal.md`, the referenced PRD, the referenced Sprint, `tasks/current.md`, and `.ai/harness/handoff/resume.md` when present.

Do not rely on chat history when these files exist.

## Agent Responsibilities

1. Treat ChatGPT as planner/reviewer and Codex as executor.
2. Prefer `repo-harness mcp` CLI commands over manual file edits when preparing setup or handoff artifacts.
3. In planner mode, keep ChatGPT write access limited to PRD, checklist Sprint, plan, notes, and approved handoff artifacts. Direct source writes require the separate coding profile.
4. Preserve checklist Sprint task cards and stage gates; do not collapse them into prose.
5. Stage each completed execution phase before moving to the next Sprint task card.
6. Report exact commands run, files changed, checks passed, and any remaining blocker.

## Required Planning Chain

For execution-ready planning, keep the chain explicit:

1. idea -> PRD: use `write_prd_from_idea`.
2. PRD -> checklist Sprint: use `write_checklist_sprint`.
3. Sprint -> Goal: use `prepare_codex_goal_from_sprint` or local `repo-harness mcp prepare-goal`.
4. Codex execution: use the host-native `/goal` prompt from `.ai/harness/handoff/codex-goal.md`.

The local CLI equivalent is:

```bash
repo-harness mcp prepare-goal --repo . --prd <prd-path> --sprint <sprint-path> --reference-repo <optional-reference-repo>
```

The generated `/goal` prompt should preserve this shape when absolute paths are useful:

```text
/goal
Read: <prd-path>
Open or use a worktree and complete: <sprint-path>
After each completed phase, stage the result before continuing.
Use the user's language for status reports unless repo-local instructions require otherwise.
Reference repo: <optional-reference-repo>
```

## Safety Boundaries

Never do these through planner, executor, or orchestrator MCP profiles:

- Do not expose arbitrary shell execution.
- Do not allow ChatGPT to edit application source files.
- Do not commit secrets, OAuth passphrases, bearer tokens, tunnel tokens, or `~/.codex/auth.json`.
- Do not paste MCP OAuth passphrases into chat, logs, issues, PRs, or handoff files.
- Do not implement or run a default remote `codex exec` runner.
- Do not modify `_ref/`, `_ops/`, `.env*`, `.git/`, package lockfiles, or source paths through planner-profile MCP tools.

MCP prepares `.ai/harness/handoff/codex-goal.md`; the local Codex host owns `/goal` execution.

Coding exception: the user may explicitly run user-scoped setup with `--profile coding --grant-read-write <repo>`. That profile exposes only `open_workspace`, `read`, `apply_patch`, `exec_command`, and `write_stdin` for direct coding, is revision-bound to explicit repo grants, defaults to managed worktrees, and runs Bash with local-user authority. It must remain off by default; shell is not a filesystem sandbox. It still hard-denies secret paths, `.git/**`, `.env*`, `_ops/**`, writable `_ref/**`, traversal, and symlink escapes.

Exception: if the user explicitly enables the local `orchestrator` dev runner setting, MCP may expose `run_agent_goal`. That tool must stay local-only, timeout-bounded, audited, limited to the fixed `.ai/harness/handoff/codex-goal.md`, and limited to user-allowed agents such as `codex` or `claude`. It is not arbitrary shell and must not be exposed through an untrusted tunnel.

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
repo-harness mcp setup chatgpt --scope user --profile coding --grant-read-write <repo> --endpoint https://host/mcp
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

Run local dev-mode orchestration only after the user has opted in:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile orchestrator --enable-dev-runner --dev-runner-agents codex
```

## Execution Checklist

When consuming `.ai/harness/handoff/codex-goal.md`:

1. Verify the PRD and Sprint paths exist.
2. Confirm the Sprint is checklist-shaped and has stage gates.
3. Open or use the requested worktree.
4. Complete one Sprint task card at a time.
5. Run that task card's focused checks.
6. Update the checklist and stage the completed phase.
7. Continue only after `git status --short` shows the intended staged files.
8. At closeout, run repo-required checks or document why the Sprint narrowed the check surface.

## Troubleshooting

- ChatGPT cannot connect: verify the HTTPS tunnel ends in `/mcp` and local `/health` responds.
- ChatGPT auth loops: prefer `allow once`; persistent `allow always` may require OAuth/session follow-up.
- Tool scan misses tools: restart `repo-harness mcp serve` and rescan the Connector.
- Coding is disabled: verify user-scoped v3 config, a live `read_write` grant, and current OAuth authorization revision.
- PTY returns `PTY_UNAVAILABLE`: keep the failure explicit; do not silently downgrade a requested PTY to pipe execution.
- Codex cannot see the MCP server: rerun `repo-harness mcp setup codex --repo . --scope project`.
- Sprint is prose-only: regenerate with `write_checklist_sprint` before execution.
