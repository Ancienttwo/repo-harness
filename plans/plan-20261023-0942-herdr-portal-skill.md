# Plan: herdr-portal Skill (Claude App → Claude CLI in Herdr)

> **Status**: APPROVED. Aimpact locked Q1–Q5 at the recommended defaults on 2026-10-23. The implementation PR on `claude/herdr-portal-skill-impl` carries this plan and the v1 Skill.
> **Created**: 20261023-0942 (Asia/Taipei)
> **Slug**: herdr-portal-skill
> **Baseline**: `origin/main@61a8a9d8e`
> **Branch**: `claude/herdr-portal-skill-design`
> **Rollback Surface**: plan only. `git revert <squash-commit>` removes it. The v1 implementation PR has its own rollback (section 9).

## 0. P1 / P2 / P3

**P1: current map**

- The Claude desktop App (Code tab) has native sub-sessions and Claude Code cross-session messaging (`ListAgents`, `SendMessage`, @mentions). Messaging needs Claude Code ≥ 2.1.224. The Mini has 2.1.309 (`claude --version`, 20261023).
- Herdr cannot host the App. Herdr hosts terminal agents in panes. Herdr 0.9.3 is the repo pin (`src/effects/terminal/herdr-observation.ts:9` `HERDR_OBSERVATION_VERSION`, `src/core/adoption/standard-plan.ts:352` `min_version`).
- Herdr 0.9.3 exposes the needed verbs over its socket API: `herdr status`, `workspace list|create`, `tab create`, `pane split|rename`, `agent start|get|list|prompt|wait|read`. Every verb prints one JSON envelope `{"id":…,"result":…}` or `{"id":…,"error":{"code":…,"message":…}}` (live probe: `herdr agent get nonexistent-portal-probe` → `agent_not_found`).
- `herdr agent list` rows carry `name`, `agent`, `pane_id`, `tab_id`, `workspace_id`, `terminal_id`, `cwd`, `agent_status`, `interactive_ready` and `agent_session.value` (the Claude session id for `kind: "id"`).
- `claude -n, --name <name>` sets the session display name. The same name shows in the prompt box, the `/resume` picker and the terminal title.
- Existing Herdr paths:
  - The user-level `herdr` skill requires `HERDR_ENV=1`. An App session is not inside a Herdr pane, so that skill does not apply to it.
  - `docs/reference-configs/herdr-notify.md` "Herdr Dispatch": cross-model peers in visible panes through `herdr agent start|prompt|wait|read`. Max 3 panes side by side per tab; no vertical stack.
  - `repo-harness review round --launch app-terminal` is the App path for receipt-bearing acceptance review. This plan does not change it.
- Bundled Skills live under `assets/skills/<skill>/` and are declared in `assets/skill-commands/manifest.json` (`hosts`, `profiles`, `component`, `audience`). `repo-harness install|update` projects them. `repo-harness-cross-review` is the closest precedent (provider-skill, `full` profile, host placement).

**P2: traced path (target flow)**

1. The operator in the App Code tab asks: "start a portal worker for repo X, task Y".
2. The Skill checks the gates (section 4). Herdr down or messaging missing → stop with a typed failure.
3. The Skill resolves the cwd under `/private/tmp` and the name `portal-<slug>`.
4. `herdr agent get portal-<slug>` decides reuse or create.
5. Create: find or create the workspace and a pane, then `herdr agent start portal-<slug> --kind claude --pane <id> -- --name portal-<slug>`.
6. `herdr agent get portal-<slug>` gives the identity record. The Skill prints the portal record (section 3.3).
7. The Skill sends one bootstrap brief with `herdr agent prompt`.
8. From then on, the App and the CLI talk only through Claude Code messaging. The App finds the CLI as the `portal-<slug>` row in `ListAgents`.
9. Pressure point: step 8. Herdr and Claude Code know the session by two ids (herdr `name`, Claude session `name`/id). The plan makes them one string so no mapping table is needed.

**P3: decision**

- The Skill is a procedure over existing CLIs. It owns no state, no daemon and no new transport. Herdr owns pane and agent identity. Claude Code owns the message channel.
- One name is the authority: `portal-<slug>` is the Herdr agent name and the Claude session name. Reuse compares live records against it. No local registry file.
- Fail closed: no headless Herdr server start, no takeover of a name with a different `agent` or `cwd`, no second message channel when messaging is absent.
- Why a Skill, not MCP or CLI: the decision is locked (section 1). The current shape also argues for it: every step is an existing JSON-returning command, and the App already has Bash. A wrapper adds value only when a second consumer (Bot, Codex host) needs the same sequence.
- At 10x portals, Herdr layout and operator attention fail first, not the commands. Section 3.2 caps panes per tab; section 8 lists portal count as a later concern.

## 1. Locked decisions (not reopened here)

1. v1 deliverable is a Skill. A thin `repo-harness herdr portal …` wrapper is an outline only (section 7). No MCP.
2. The Skill teaches any Claude Code session (App Code tab first) to ensure Herdr is up, create or reuse a workspace and pane, run `herdr agent start --kind claude`, return a stable name, pane id and cwd, and then use `SendMessage` / @mentions.
3. A Codex second pane is out of v1. Cross-model work stays on the existing Herdr patterns.
4. `review round --launch app-terminal` stays the App acceptance path. The portal does not replace it.
5. Worktrees are under `/private/tmp` or `/tmp` only. Never a personal or iCloud (`~/Library/Mobile Documents`) folder.
6. Idempotent: the same name reuses a live, matching agent. Herdr down → fail closed.

## 2. Problem and non-goals

**Problem.** The operator works in the App Code tab. Long execution work belongs in a visible terminal worker that survives App restarts and that Herdr can observe and notify on. Today the operator starts that worker by hand and copies context between them.

**Non-goals (v1)**

- MCP server or MCP tools for the portal.
- Codex auto-pair or any second-model pane.
- Grok Bot, computer-use, Claude in Chrome or any UI automation of the App or of Herdr.
- Embedding or hosting the App inside Herdr.
- Receipt-bearing acceptance. That stays `repo-harness review round`.
- Task state, queues or a portal registry. Herdr and Claude Code hold all live state.
- Automatic cleanup of portal panes or worktrees.

## 3. Command contract

### 3.1 Inputs

| Input | Rule |
| --- | --- |
| `slug` | `^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$`. The operator gives it, or the Skill derives it from repo and task and shows it before use. |
| `name` | Always `portal-<slug>`. Not configurable. |
| `cwd` | Existing directory. `realpath` must start with `/private/tmp/`. `/tmp/<x>` resolves there on macOS. Must be a git worktree (`git -C <cwd> rev-parse --show-toplevel` equals `cwd`). |
| `repo` | `basename` of the main worktree (`git -C <cwd> rev-parse --git-common-dir`). Used for the workspace label only. |

If the operator names a repo but no worktree, the Skill creates one with the repo convention: `git -C <repo> worktree add /tmp/<repo>-wt-<slug> -b portal/<slug> origin/main`. It fails closed if the path or branch exists (Q4).

### 3.2 Sequence

Every command below is parsed as JSON. A non-zero exit or an `error` envelope stops the sequence with that `code`.

```bash
# 0. Gates (section 4)
claude --version                       # CLI ≥ 2.1.224
herdr --version                        # ≥ HERDR_OBSERVATION_VERSION (0.9.3)
herdr status                           # server.status == running, endpoint_compatible == yes

# 1. Reuse check
herdr agent get portal-<slug>
#   agent_not_found            → go to 2
#   found, agent == "claude", cwd == <cwd>, interactive_ready == true
#                              → reused: true, go to 5
#   found, agent_status == "blocked"
#                              → report blocked, do not prompt, stop
#   found, any other mismatch  → fail closed: portal_name_conflict

# 2. Workspace (one per repo; Q2)
herdr workspace list
#   label == "portal-<repo>"   → reuse workspace_id
herdr workspace create --cwd <cwd> --label portal-<repo> --no-focus
#   → workspace_id and its root pane id (Phase 0 confirms the field)

# 3. Pane (max 3 side by side per tab, no vertical split)
#   new workspace              → use its root pane
#   active tab has < 3 panes   → herdr pane split --pane <rightmost> --direction right --cwd <cwd>
#   active tab is full         → herdr tab create (in workspace_id), use its root pane
herdr pane rename <pane_id> portal-<slug>

# 4. Start
herdr agent start portal-<slug> --kind claude --pane <pane_id> --timeout 60000 -- --name portal-<slug>

# 5. Identity
herdr agent get portal-<slug>

# 6. Bootstrap brief (new portal only; Q3)
herdr agent prompt portal-<slug> "<brief>" --wait --until working --until idle --timeout 30000
```

The brief is fixed text in the Skill. It states: the worker name, the cwd, the App session to report to, the boundaries in section 5, and "reply with SendMessage to the sender; do not wait at the prompt for an answer the sender cannot see". It holds no task content. Task content goes through `SendMessage`.

The Skill passes no permission flags. The CLI uses the operator's own Claude settings and hooks in that worktree.

### 3.3 Portal record (returned to the App user)

```json
{
  "portal": "v1",
  "name": "portal-<slug>",
  "reused": false,
  "cwd": "/private/tmp/<repo>-wt-<slug>",
  "herdr": {
    "workspace_id": "w7",
    "tab_id": "w7:t1",
    "pane_id": "w7:p2",
    "terminal_id": "term_…",
    "agent_status": "idle",
    "interactive_ready": true
  },
  "claude": {
    "session_id": "<agent_session.value>",
    "cli_version": "2.1.309"
  },
  "messaging": {
    "address": "portal-<slug>",
    "listed": true
  }
}
```

Every field is copied from a command output in the same run. A field that a command did not return is absent, and the Skill reports the gap. It never fills a value from memory or from an earlier run.

### 3.4 How the App finds the CLI

1. `--name portal-<slug>` at start gives the Claude session that name.
2. The App runs `ListAgents` (the `/list-agents` view). The portal is the row whose name is exactly `portal-<slug>`. `messaging.listed` records whether the row was present.
3. The App sends with `SendMessage({to: "portal-<slug>", …})` or an @mention of that name.
4. If the row is absent after start, the Skill does not switch to `herdr agent prompt` for task traffic. It reports `portal_not_listed` with the identity record. Repair is manual: the operator runs `/rename portal-<slug>` in that pane, then the Skill runs step 1 again.
5. The App session needs its own stable name so the worker can reply. If the App session has no name, the Skill asks the operator to run `/rename` in the App before step 6.

## 4. Gates

| Gate | Check | Failure code |
| --- | --- | --- |
| Messaging in the caller | `ListAgents` and `SendMessage` tools are present in the current session. This is the observable condition; the App's bundled Claude Code version is not readable from Bash. | `messaging_unavailable` |
| CLI version | `claude --version` semver ≥ 2.1.224 | `claude_cli_too_old` |
| Herdr version | `herdr --version` ≥ `HERDR_OBSERVATION_VERSION`. The Skill cites that constant; it does not keep its own pin. | `herdr_too_old` |
| Herdr server | `herdr status`: `server.status == running` and `endpoint_compatible == yes` | `herdr_down` |
| Socket reach | The App Bash sandbox may block the Herdr socket. A `herdr status` transport error is reported as is. | `herdr_unreachable` |
| cwd | Section 3.1 rules | `cwd_outside_tmp`, `cwd_not_worktree` |

`herdr_down` tells the operator to start Herdr in a terminal (`herdr`). The Skill does not run `herdr server` headless (Q1): a headless server creates panes the operator cannot see.

## 5. Security boundaries

The Skill and the bootstrap brief state these. The Skill text is guidance; the real enforcement is the operator's Claude settings, the repo hooks and GitHub branch protection.

The Skill must never:

- merge, squash, push to `main`, tag, publish, release or deploy, or tell the worker to do so;
- approve, close or comment on PRs or issues on the operator's behalf;
- drive the App UI, use computer-use, Claude in Chrome or any browser automation (GitHub clicks are banned in `CLAUDE.md`);
- pass `--dangerously-skip-permissions`, `--permission-mode bypassPermissions` or any other permission change;
- read, write or forward credentials, `.env` files or tokens in the brief or in messages;
- send keys, prompts or reads to a pane it did not start, or to an agent whose name does not start with `portal-`;
- close, kill or rename panes, tabs or workspaces it did not create; close any of them without an explicit operator request;
- create or use a worktree outside `/private/tmp`;
- start a headless Herdr server or change Herdr config.

## 6. Skill layout and install surface

### 6.1 Files (implementation PR, not this PR)

```text
assets/skills/repo-harness-herdr-portal/
  SKILL.md                    # outcome contract, gates, boundaries, mode selection
  references/
    spawn.md                  # section 3 sequence, JSON fields, error codes
    messaging.md              # section 3.4: ListAgents / SendMessage / @mention / repair
```

`SKILL.md` frontmatter:

```yaml
name: repo-harness-herdr-portal
description: Start or reuse a named Claude CLI worker in a visible Herdr pane from a Claude Code session (App Code tab first), return its portal record, then coordinate through Claude Code cross-session messaging.
when_to_use: "herdr portal, portal worker, start claude in herdr, spawn claude cli worker, App 开 herdr worker, 在 herdr 里起 claude"
```

Boundaries in `SKILL.md`: not for review or acceptance (use `repo-harness-cross-review` / `review round`), not for Codex panes, not for sessions already inside Herdr that only need pane control (use the `herdr` skill).

The Skill orchestrates several Herdr verbs and Claude Code messaging. It is not a rename of one CLI command, so it meets the `assets/skill-commands/CLAUDE.md` rule.

### 6.2 Install: bundled (recommended default)

| Option | For | Against |
| --- | --- | --- |
| **Bundled under `assets/skills/`, manifest entry** | Versioned with the Herdr pin and the manifest drift checks. `repo-harness update` refreshes it. Same path as `repo-harness-cross-review`. | One manifest entry and projection test update. |
| User skill only (`~/.claude/skills/`) | No repo change. | No drift check, no version link to the Herdr pin, lost on a new machine. |

Recommended manifest entry:

```json
{
  "name": "repo-harness-herdr-portal",
  "kind": "provider-skill",
  "source": "assets/skills/repo-harness-herdr-portal",
  "provider": null,
  "hosts": ["claude"],
  "profiles": ["full"],
  "discoverability": "cross-model",
  "component": "cross-model-acceptance",
  "requires": [],
  "mutatesRepoByDefault": false,
  "audience": "bot"
}
```

Plus `expectedProjections.hostSkillPlacementsByProfile.full.claude` gains `repo-harness-herdr-portal`. Codex gets nothing in v1. Q5 covers the component choice.

## 7. Later: thin CLI wrapper (outline only)

Build only when a second consumer (Bot routine or Codex host) needs the same sequence.

```text
repo-harness herdr portal spawn --slug <slug> --cwd <path> [--repo <path>] --json
repo-harness herdr portal get   --slug <slug> --json
repo-harness herdr portal list  --json          # agents whose name starts with portal-
```

- Same contract as section 3: same record, same error codes. The Skill then calls the wrapper and the Skill text shrinks to gates, boundaries and messaging.
- Lives beside `src/cli/commands/herdr.ts`. Uses the existing Herdr transport in `src/effects/operator/herdr-runtime-transport.ts`. No new transport.
- No `close` verb until the operator asks for one; deletion stays a user boundary.

## 8. Failure modes

| Failure | Observation | Behavior |
| --- | --- | --- |
| Herdr not running | `herdr status` error or `server.status != running` | `herdr_down`; stop |
| App sandbox blocks the socket | transport error from `herdr status` | `herdr_unreachable`; report the raw error; stop |
| Name taken by another kind or cwd | `agent get` found, mismatch | `portal_name_conflict`; stop; no takeover |
| Agent blocked | `agent_status == blocked` | report record; no prompt |
| Pane not at a shell prompt | `agent start` error | report the Herdr `code`; leave the pane as is |
| Start timeout | `agent start` timeout | report; leave the pane for the operator |
| Session not listed for messaging | no `ListAgents` row | `portal_not_listed`; manual `/rename` repair; no prompt fallback |
| Worker waits at its prompt for an answer | Herdr `blocked`/`idle`; the existing notify plugin fires | operator reads the pane; the brief tells the worker to reply with `SendMessage` |
| Two App sessions spawn the same slug | second run sees the first agent | reuse when it matches; otherwise conflict |
| Many portals | tab count grows | 3-pane cap per tab; portal count is visible in `herdr workspace list`; no cap in v1 |
| Worktree left behind | `/tmp/<repo>-wt-<slug>` remains | normal repo closeout and sweep rules apply; the Skill deletes nothing |

## 9. v1 exit criteria (implementation PR)

Manual proof on the Mini, recorded in the implementation PR:

1. In the App Code tab, the Skill spawns `portal-<slug>` for a `/tmp/repo-harness-wt-<slug>` worktree. The pane is visible in Herdr in workspace `portal-repo-harness`.
2. The printed record matches `herdr agent get portal-<slug>` field by field.
3. `ListAgents` in the App shows `portal-<slug>`. The App sends one message with `SendMessage`. The CLI replies through `SendMessage`. The reply shows in the App.
4. A second spawn with the same slug returns `reused: true` and starts no new pane.
5. With Herdr stopped, the Skill returns `herdr_down` and creates nothing.
6. A cwd under `$HOME` returns `cwd_outside_tmp`.
7. `review round --launch app-terminal` still works unchanged (no file in its path changed).

Automated checks for the implementation PR: manifest and projection tests that cover the new entry (`tests/scaffold-parity.test.ts` and the skill-surface catalog tests), plus link and scope checks on the Skill files. No product test simulates Herdr or the App.

Rollback: `git revert <squash-commit>`, then `repo-harness update` removes the projected Skill.

## 10. Open questions (recommended defaults)

| # | Question | Recommended default |
| --- | --- | --- |
| Q1 | Herdr down: fail closed, or start `herdr server` headless? | Fail closed. Headless panes are invisible to the operator. |
| Q2 | Workspace granularity: one per repo, or one per portal? | One per repo, label `portal-<repo>`, 3 panes per tab. |
| Q3 | Bootstrap brief: `herdr agent prompt` once, or first `SendMessage`? | `herdr agent prompt` once (deterministic, `--wait` observable). All task traffic after it uses `SendMessage`. |
| Q4 | May the Skill create the worktree, or only accept an existing one? | May create `/tmp/<repo>-wt-<slug>` on branch `portal/<slug>` from `origin/main`; fail closed if path or branch exists. |
| Q5 | Manifest placement: `cross-model-acceptance` component, `full` profile, Claude host only? | Yes. Revisit the component name only if a dedicated Herdr component appears. |

## 11. Phase 0 probes (before the Skill text is final)

- `herdr workspace create` result: the root pane id field name.
- `herdr agent get <name>` by name after `agent start <name>`: confirm the name lookup works the same as `agent list`.
- App Code tab Bash: confirm the Herdr socket is reachable from the App sandbox.
- `ListAgents` from the App: confirm a CLI session started with `--name` in a Herdr pane is listed under that name.
