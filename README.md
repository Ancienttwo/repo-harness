# repo-harness

<p align="center">
  <img src="docs/images/repo-harness-hook-carrot.png" alt="repo-harness hooks leading Codex and Claude forward with repo-local workflow state" width="900">
</p>

`repo-harness` turns Claude/Codex coding sessions into a repeatable repo-local
workflow. It ships a CLI plus skill/runtime hooks that write context, plans,
handoffs, checks, and review evidence back into the project, so the next agent
session can continue from files instead of chat memory.

Use it to:

- adopt an existing repo with a tasks-first agent contract
- keep Claude and Codex aligned on the same plans, checks, handoffs, and context
  boundaries
- spend fewer tokens rediscovering structure by using CodeGraph and progressive
  context loading

Give the agent a complete PRD or Sprint; after that, your loop is just review
and `next`, or start `/goal` and go AFK.

Repository: `https://github.com/Ancienttwo/repo-harness`

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)

## Why repo-harness

- **File-backed sessions, not chat memory.** Separate agent sessions — Claude and
  Codex, now and later — stay coordinated through the repo, not a thread.
  `.ai/hooks/session-start-context.sh` injects the prior session's resume packet
  (`.ai/harness/handoff/resume.md`, `tasks/current.md`) when a new session starts;
  `stop-orchestrator.sh` writes the stop handoff, while `post-edit-guard.sh`
  refreshes edit-time traces and task status after changes. A session can end
  mid-task and the next one resumes the exact next step, blockers, and changed
  files without re-deriving them.
- **Token-lean by design.** Instead of grep-and-read loops that re-scan the repo every
  session, the harness leans on a pre-built CodeGraph index for structural queries
  (callers, callees, definitions) and on progressive context loading via
  `.ai/context/context-map.json` and `capabilities.json`: a small, stable root context
  (~12KB) plus capability blocks loaded only when the files you touch need them. Agents
  read a 1KB capability contract or query the index instead of spending thousands of
  tokens rediscovering structure.

In an adopted repo, the surface area is intentionally small:

| Surface | Purpose |
| --- | --- |
| `docs/spec.md` and `docs/reference-configs/` | Shared standards and stable product intent that every agent session can read. |
| `plans/`, `plans/prds/`, and `plans/sprints/` | Decision-complete work packages before implementation starts. |
| `tasks/contracts/`, `tasks/reviews/`, and `.ai/harness/checks/` | Scope, verification, and review evidence for proving the work is done. |
| `.ai/harness/handoff/` and `tasks/current.md` | Session journal and resumable status, derived from workflow artifacts instead of chat memory. |

## Human Review Path

Start with `tasks/reviews/<task>.review.md`. The `## Human Review Card` is the
one-screen decision surface: verdict, change type, intended vs actual files,
commands passed, external acceptance, residual risk, reviewer action, and
rollback. Then inspect the active contract, latest trace in
`.ai/harness/checks/latest.json`, and the changed files. Accept only when the
review recommends pass, the card verdict is pass, and external acceptance is
pass, `not_required`, or an explicit manual override.

Runtime-heavy validators such as Unity, browser E2E, mobile simulators, hardware
rigs, or staging smoke tests can publish external verification manifests under
the ignored run-evidence surface. This is a manual convention today, not an
automatic `repo-harness check` discovery or gate. See
[`docs/reference-configs/external-tooling.md`](docs/reference-configs/external-tooling.md#external-verification-evidence).

## Agent Tracking Path

Agents read source artifacts before derived summaries:

| Agent reads first | Human reviews first |
| --- | --- |
| Current user prompt and referenced files | `tasks/reviews/<task>.review.md` Human Review Card |
| `AGENTS.md` / `CLAUDE.md` | Changed files and diff |
| Active plan in `.ai/harness/active-plan` | Active contract allowed paths and exit criteria |
| Active contract in `tasks/contracts/` | `.ai/harness/checks/latest.json` and run trace |
| Latest handoff in `.ai/harness/handoff/` | Residual risks and rollback |

`tasks/current.md` is only an orientation snapshot. If it disagrees with the
active plan, contract, review, checks, or handoff, the source artifacts win.

## What's New

Release notes live in [`docs/CHANGELOG.md`](docs/CHANGELOG.md). The current line
is `0.9.2`.

## How It Works

The design has three layers:

1. **Source package**: this repository owns the CLI, CLI-backed command facades,
   templates, hook assets, workflow contract, tests, and release gate.
2. **Target repo contract**: `repo-harness adopt` or migration writes repo-local
   files such as `docs/spec.md`, `plans/`, `tasks/`, `.ai/context/`,
   `.ai/harness/`, helper scripts, and `.ai/hooks/`.
3. **Host adapters**: user-level `~/.claude/settings.json` and
   `~/.codex/hooks.json` route Claude/Codex events into `repo-harness-hook`.

<p align="center">
  <img src="docs/images/repo-harness-gptpro.png" alt="repo-harness architecture and ChatGPT Pro local planner workflow diagram" width="960">
</p>

The hook entrypoint exits silently for non-opt-in repos. For opted-in repos,
it resolves hooks central-first through the packaged install or
`~/.repo-harness/hooks/`, with repo policy able to pin self-host development
back to `.ai/hooks/*`.

Minimal-change hooks sit inside that same route surface without adding a public
adapter route. `SessionStart` and allowed execution prompts print advisory
context when policy opts in, `PostToolUse.edit` can write bounded change signals
to `.ai/harness/checks/minimal-change.latest.json` when
`post_edit_observer:true` is explicitly enabled, and `Stop` records the latest
review summary in the handoff. Missing or malformed policy defaults to off; even
`mode: "enforce"` is normalized to advisory behavior so tests, contracts, and
human review stay the enforcement boundary.

For `UserPromptSubmit`, the public adapter contract stays
`repo-harness-hook UserPromptSubmit --route default`. The CLI route registry
dispatches that route to `.ai/hooks/prompt-guard.sh`. The shell hook remains the
repo-local adapter for host JSON parsing, workflow file reads, capture side
effects, and host-safe stdout/stderr. It pipes the prompt text into
`repo-harness-hook prompt-guard-decide`, where every prompt-text intent
classifier (Unicode-aware, `src/cli/hook/prompt-intents.ts`) and the
`intent x plan state` decision table live; the engine returns one verdict JSON
line with the action, the classified intent facts, and derived strings. The
shell keeps no duplicate classifier or fallback decision table — when the
engine is unreachable the prompt layer degrades to a one-shot advisory.

Prompt-layer plan/spec/contract gates are advisory routing. Hard enforcement
lives at the edit boundary: `pre-edit-guard.sh` blocks implementation edits
unless the active plan is Approved/Executing (policy
`.guards.edit_plan_gate`: enforce | advice | off). Done-claim gates keep
blocking because they verify file-backed completion evidence, not language.

The core invariant is that durable truth lives in the repo, not in a chat
thread. Hooks are accelerators and guardrails; the authority remains the
file-backed plan, contract, review, checks, and handoff artifacts.

## Task Workflow: Plan to Closeout

The diagram below assumes the harness is already installed in the repo. It shows
the normal lifecycle from a program sprint backlog down to one contract task:
draft or select the task, project it into execution files, check out the
contract worktree when policy requires it, implement under hooks, verify, review,
complete the sprint task when applicable, and close out. The 0.4.x loop-system
surfaces add scheduled heartbeat discovery, state-snapshot/eval evidence for
routing changes, architecture queue freshness, and optional contract-run
delegation without changing the file-backed authority model.

```mermaid
flowchart TD
  Program["Program goal or release theme"] --> Sprint{"Sprint layer needed?"}
  Sprint -->|yes| PRD["Upper-layer PRD<br/>plans/prds/*.prd.md"]
  PRD --> SprintDoc["Sprint backlog<br/>plans/sprints/*.sprint.md"]
  SprintDoc --> NextTask["Select next sprint task<br/>sprint-backlog.sh next"]
  Sprint -->|no| UserTask["User task or planning prompt"]
  Heartbeat["Heartbeat triage<br/>scripts/heartbeat-triage.sh<br/>.ai/harness/triage/"] --> UserTask
  NextTask --> UserTask

  UserTask --> Discovery["Due diligence<br/>P1 map, P2 trace, P3 decision"]
  Discovery --> LoopEvidence["Loop evidence when routing changes<br/>state-snapshot --json<br/>route-nl-vs-ts / cutover gate"]
  LoopEvidence --> PlanDraft["Draft plan<br/>plans/plan-*.md"]
  PlanDraft --> PlanReview{"Plan ready for execution?"}
  PlanReview -->|no| Refine["Refine plan, scope, evidence contract"]
  Refine --> PlanDraft
  PlanReview -->|yes| Approve["Approved plan<br/>Status: Approved"]

  Approve --> Project["Project plan into execution<br/>capture-plan.sh --execute<br/>or plan-to-todo.sh --plan"]
  Project --> Active["Active markers<br/>.ai/harness/active-plan<br/>.ai/harness/active-worktree"]
  Project --> SprintActive["Sprint projection<br/>active-sprint marker<br/>tasks/current.md"]
  Project --> Contract["Sprint contract<br/>tasks/contracts/YYYYMMDD-HHMM-task-slug.contract.md"]
  Project --> ReviewFile["Review file<br/>tasks/reviews/YYYYMMDD-HHMM-task-slug.review.md"]
  Project --> Notes["Task notes<br/>tasks/notes/YYYYMMDD-HHMM-task-slug.notes.md"]

  Contract --> Delegation["Delegation contract<br/>budget / permission_scope / roles"]
  Delegation --> Delegate{"Use contract-run delegation?"}
  Delegate -->|yes| ContractRun["Worker/verifier child run<br/>scripts/contract-run.ts"]
  Delegate -->|no| WorktreePolicy{"Contract worktree required?"}
  WorktreePolicy -->|yes| Checkout["Checkout isolated worktree<br/>contract-worktree.sh start --plan<br/>branch codex/task-slug"]
  WorktreePolicy -->|no| CurrentTree["Use current worktree<br/>small or explicitly allowed slice"]
  Checkout --> Implement
  CurrentTree --> Implement
  ContractRun --> Changes

  Implement["Edit and run commands"] --> PreHooks["Pre-edit guards<br/>PlanStatusGuard, ContractScopeGuard, WorktreeGuard"]
  PreHooks -->|blocked| ScopeFix["Fix plan, contract, worktree, or scope"]
  ScopeFix --> Implement
  PreHooks -->|allowed| Changes["Code, docs, tests, or config changes"]
  Changes --> PostHooks["Post-edit and post-bash hooks<br/>trace, drift request, handoff, check evidence"]
  PostHooks --> ArchQueue["Architecture queue<br/>architecture-queue.sh record/reindex<br/>check-architecture-sync.sh"]
  ArchQueue --> Verify["Run verification<br/>tests plus repo workflow checks"]

  Verify --> Checks["Structured evidence<br/>.ai/harness/checks/latest.json<br/>.ai/harness/runs/*.json"]
  Checks --> CheckReview["Evaluator review<br/>Waza /check -> review file"]
  CheckReview --> External["External acceptance advice<br/>or explicit manual override"]
  External --> DoneGate{"Contract, checks, review, and acceptance pass?"}
  DoneGate -->|no| Repair["Repair failing evidence or implementation"]
  Repair --> Implement
  DoneGate -->|yes| SprintComplete{"Sprint task active?"}
  SprintComplete -->|yes| MarkSprint["Mark backlog item complete<br/>sprint-backlog.sh complete-task"]
  SprintComplete -->|no| Closeout["Closeout<br/>scripts/contract-worktree.sh finish"]
  MarkSprint --> Closeout

  Closeout --> Commit["Commit contract branch"]
  Commit --> Merge["Fast-forward target branch"]
  Merge --> Archive["Archive plan/todo and refresh handoff"]
  Archive --> Cleanup["Cleanup merged worktree<br/>contract-worktree.sh cleanup"]
  Cleanup --> Done["Reviewable completed task"]
```

## Long-Running Product Loops

For Greenfield and Brownfield work, front-load discovery and engineering-plan
judgment in Claude-Fable before asking Codex to loop on execution:

1. In Claude-Fable, use gstack `office-hours` for product discovery or
   `plan-eng-review` for engineering plan review. The output should be the
   development documents that lock product intent, architecture, risks, and the
   evidence contract.
2. Turn those documents into an upper-layer PRD under `plans/prds/`, then into
   an ordered sprint backlog under `plans/sprints/` with detailed sub-plans for
   each execution slice.
3. In Codex, create a Goal that points at that sprint file. The harness can then
   project each sprint item through the normal plan -> contract -> worktree ->
   verification flow.

That handoff keeps long-running loops precise: Claude-Fable owns the broad
front-loaded judgment, the PRD remains the upper source of truth, the sprint
backlog is the durable execution queue, and Codex Goal mode resumes against a
concrete sprint instead of reinterpreting the original chat.

## First 5 Minutes

<p align="center">
  <img src="docs/images/repo-harness-install-donkey-carrot.png" alt="Pixel art donkey following a carrot for repo-harness installation" width="900">
</p>

This is the fastest path for an AI tooling owner evaluating whether the workflow is
safe to adopt in a real repo. It separates the machine-level runtime bootstrap
from the repo-local contract install, so a dry run can show exactly what will
change before anything is applied.

Prerequisites: a Git working tree, `bash`, and `bun` (for follow-up verification
and template assembly). `jq` is optional for `--dry-run`, but recommended when
applying settings merges.

### 1. Install the CLI

No Node.js required for the default path: the installer uses Bun >= 1.1.35 as
the runtime. If Bun is missing or older, it installs or upgrades Bun first, then
installs the `repo-harness` CLI.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex
```

If Bun >= 1.1.35 is already on PATH, you can skip the shell installer. When an
older self-managed Bun launches one of these direct paths, `repo-harness install`
upgrades that same binary before continuing. Package-manager-owned Bun installs
fail closed with the matching upgrade command (for example, `brew upgrade bun`
or `scoop update bun`) instead of overwriting manager-owned files:

```bash
# Bun one-shot bootstrap
bunx repo-harness@latest install

# Or install the persistent CLI first
bun add -g repo-harness
repo-harness install

# npx fallback, with Bun already on PATH because the CLI runs on Bun
npx -y repo-harness@latest install
```

### 2. Bootstrap the host runtime once

```bash
repo-harness install --profile minimal
```

`install` is the first-run global bootstrap path. It installs the current npm
package as the global CLI, refreshes repo-harness skill aliases, installs
user-level hook adapters, and records an explicit install profile. `minimal`
is the interactive and non-interactive default; it does not install Waza,
cross-review skills, a brain root, or CodeGraph. Use `standard`,
`product-planning`, or `strict` only when those surfaces are wanted. The command
is idempotent. `--dry-run --json` lists components to install, skip, and remove;
`--state --json` reads the effective installed state; `--rollback` restores the
previous profile transaction. See
[`docs/reference-configs/install-profiles.md`](docs/reference-configs/install-profiles.md).

It does not apply repo-local workflow files to the current directory.

For an Agent-owned, read-only bootstrap audit, run `repo-harness setup check
--json` or add `--check-updates` for version and adopted-repo refresh
advisories. `setup check` is not a runtime hook: it does not write user-level
files, install updates, run `adopt`, or register adapters. It emits
`agent_actions` with the reason, risk, target files, optional command, and
verification surface for the Agent to execute deliberately.
`repo-harness init-hook` remains a compatibility alias.

### Install and refresh examples

```bash
# Refresh user-level CLI/runtime pieces after a package update.
repo-harness update

# Remove managed host adapters without touching sibling or third-party hooks.
repo-harness uninstall

# Install only the host hook adapters (older adapter-only surface).
repo-harness install --target both --location global

# Read-only repair guidance, no writes.
repo-harness update --check

# Refresh repo-local workflow files in an adopted repository.
repo-harness adopt --repo /path/to/repo
```

`repo-harness install --target codex|both --location global` also resolves and
persists the Codex delegation mode read by the delegation-advisor hook: pass
`--delegation-mode auto|explicit` for non-interactive use, or answer the
one-line interactive prompt shown in a TTY (Enter keeps the current choice,
defaulting to `explicit` when nothing is configured yet). The chosen mode is
written to `delegation.mode` in `~/.repo-harness/config.json`, merged with
existing keys such as `brainRoot`; this global value takes precedence over a
repo's `.ai/harness/policy.json` `delegation.mode`. The step never fires for
`--target claude`, and with no flag and no TTY it leaves the file untouched —
it never writes a silent default.

### 3. Preview the repo-local contract

```bash
repo-harness adopt --dry-run
```

Run the dry run from the target repository root. It reports the specs, task
state, helper runtime, hook adapter target, and verification files that would be
created or refreshed. It should not create an application stack; existing repos
use `repo-harness adopt`, while new projects or modules use
`repo-harness-scaffold`.

### 4. Apply, then prove the workflow

```bash
repo-harness adopt
bash scripts/check-task-workflow.sh --strict
bun test
```

After apply, the repo should have a reviewable file-backed contract rather than
tool-specific chat setup. Agents should be able to find the stable intent in
`docs/spec.md`, execution state in `plans/` and `tasks/`, and resume state in
`.ai/harness/handoff/`.

For a new project or module, use the branch command `repo-harness-scaffold`
instead of `adopt`; it installs or refreshes the harness without creating an
application stack. Maintainers editing the package itself need a source checkout
— see [Maintainer Reference](#maintainer-reference).

### Success looks like this

The command should end with `=== Migration Report ===` and summarize:

- `Project hooks synced from:` to show where generated hook behavior comes from
- `Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json` to show the adapter layer
- `Host hook adapters are user-level:` to remind the user to install global adapters and trust `~/.codex/hooks.json`
- `Workflow migration:` to show the repo-local harness surfaces it will create or refresh
- `Helper runtime:` to show `.ai/harness/scripts/*` implementations and `scripts/*` compatibility wrappers after apply
- `--- External Tooling ---` to show default gstack/Waza/gbrain routing plus advisory install/update hints

If the dry-run output looks wrong, stop there and inspect
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)
before applying anything.

## MCP Connector Quickstart

As an optional sidecar, `repo-harness mcp` exposes workflow artifacts to MCP
clients through the default `planner` profile. ChatGPT acts as a
planner/reviewer that reads state and moves an idea through PRD, checklist
Sprint, and Codex goal handoff artifacts — with no default source-code write access,
arbitrary shell execution, or default Codex runner. Codex remains the executor.

The same `planner` Connector also exposes general repo tools for
registered adopted repos. Use `discover_harness_repos` first, then call
`list_allowed_roots` to get the stable `repo_id`. General repo reads use
`repo_manifest`, `list_tree`, `stat_file`, `read_file`, `read_files`, and
`search_text`. The write surface currently exposes `write_file`, `apply_patch`,
`move_path`, `delete_path`, and `refresh_repo_index`, all rejected unless that
registered repo is explicitly configured as `read_write`.
`write_file` creates only with `must_not_exist: true`, replaces only with
`expected_sha256`, and reports `before`, `after`, `diff`, `mutation_id`, and
`index_state` after an atomic same-directory rename. `apply_patch` operates only
on existing text files, requires `expected_sha256`, and accepts either structured
`old_text`/`new_text` edits or guarded unified diff hunks. Patch precondition
misses and stale hashes return `REVISION_CONFLICT` without writing. Successful
file moves require a source `expected_sha256` plus `must_not_exist: true` for the
target. Deletes require `expected_sha256`; v1 deletes regular files only and
rejects directory or recursive deletes. Successful writes leave the index
pending and append an index invalidation event under
`.ai/harness/mcp/index-events.jsonl`; `refresh_repo_index` runs CodeGraph sync
for the repo, invalidates reader snapshots, records refresh success or
dead-letter failure in that same event log, and returns the new `snapshot_id`,
`index_revision`, `index_state`, refresh strategy, and optional mutation lag when
called with `mutation_id`. The CLI adapter reports `path_refresh_supported:false`
when it must use repo-level sync for requested paths. The MCP audit log records
actor/profile, repo id, operation, relative paths, hash summary, result, error
code, duration, and mutation/index event ids without storing file bodies or
patch text. The repo whitelist is the authorization boundary, `.ignore` is the
only content exclusion source, paths are repo-relative, and authorized file
content is not implicitly redacted. External non-repo local roots require
explicit `--allow-root` authorization.

When CodeGraph is initialized for a registered repo, the general reader merges
CodeGraph indexed-file metadata into manifest/stat/read/search responses while
keeping the filesystem walker as the complete manifest source of truth. Responses
carry `snapshot_id`, `index_revision`, `ignore_digest`, and `indexed` metadata;
stale client snapshots return `SNAPSHOT_STALE` instead of silently mixing
versions. Responses also expose `snapshot_state`, snapshot TTL/expiry, and a
bounded in-process snapshot cache marker. The public `snapshot_cache.key` is
scoped by tool and repo-relative path set, while `snapshot_cache.snapshot_key`
identifies the underlying repo snapshot. Entry metadata is cached separately by
repo, registry revision, `.ignore` digest, relative path, and current stat
signature, so unchanged warm manifest/stat/read calls avoid repeated file hash
and binary probes without hiding file, registry, or `.ignore` changes. Explicit
`snapshot_id` stat/read calls can reuse the cached snapshot and validate the
requested file hash instead of rebuilding the full repo snapshot. If CodeGraph
reports a now-missing indexed path or metadata that no longer matches the
filesystem, the snapshot becomes `index_lagging` while authorized read/stat
fallback stays available. Full-text search still falls back to the guarded
filesystem path when CodeGraph cannot provide complete repo-text search.
For large manifests, `repo_manifest` streams the visible tree and keeps only the
requested page of entries in memory. Returned page entries include exact content
hashes; non-page file content metadata is deferred and reported as
`counts.content_deferred` until a later manifest page, `stat_file`, `read_file`,
or `search_text` actually returns that content.

For large-repo reader baselines, run:

```bash
bun run benchmark:mcp-reader -- --entries 10000 --json
```

Use `--entries all` for the full 10k/100k/500k fixture sequence when the local
machine can spend the filesystem time.

For the full tool reference, JSON examples, repo administrator guidance,
privacy notes, migration guide, rollout flags, and known limits, see
[`docs/reference-configs/general-repo-mcp.md`](docs/reference-configs/general-repo-mcp.md).
For index stale, CodeGraph down, manifest incomplete, mutation conflict,
reindex dead-letter, and rollback operations, see
[`deploy/runbooks/general-repo-mcp-codegraph.md`](deploy/runbooks/general-repo-mcp-codegraph.md).

This sidecar assumes the CLI is already installed from
[First 5 Minutes](#first-5-minutes). Use it when you want ChatGPT to plan
against the real repo state and Codex to execute the resulting file-backed
Sprint.

The ChatGPT Connector registers one endpoint URL, not one repository per URL.
Adopted repos are discovered from `~/.repo-harness/registered-repos.json`, which
is updated by `repo-harness adopt`, `repo-harness init`, and user-scope ChatGPT
setup. Stale registry entries are ignored unless the live repo still has
repo-harness adoption markers.

```bash
repo-harness mcp setup chatgpt --repo .
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

User-scope global Connector setup:

```bash
repo-harness mcp setup chatgpt --scope user --repo . --endpoint <https-url>/mcp
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Optional external reader roots:

```bash
repo-harness mcp setup chatgpt \
  --scope user \
  --repo . \
  --enable-reader \
  --allow-root "$HOME/Documents" \
  --allow-root "$HOME/Projects" \
  --endpoint <https-url>/mcp
```

Expose that local server through an HTTPS tunnel and create a ChatGPT Connector
with the `/mcp` URL. The generated guide is written to:

```text
docs/repo-harness-chatgpt-mcp-setup.md
```

The human workflow is:

1. ChatGPT reads repo-harness workflow files through MCP.
2. ChatGPT writes a PRD with `write_prd_from_idea`.
3. ChatGPT writes a checklist Sprint with `write_checklist_sprint`.
4. ChatGPT prepares `.ai/harness/handoff/codex-goal.md` with `prepare_codex_goal_from_sprint`.
5. Codex runs the host-native `/goal` prompt and stages each completed Sprint phase.

Local fallback for the last handoff step:

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md
```

The agent-facing Skill is installed at:

```text
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
```

That Skill tells Codex how to consume ChatGPT-produced PRD/Sprint/Goal artifacts
without granting ChatGPT source-code writes or shell execution.

Dev Mode can opt into local agent execution through MCP. This is off by default.
When the user enables the `orchestrator` profile with the dev runner setting,
ChatGPT can call `run_agent_goal`, which reads only
`.ai/harness/handoff/codex-goal.md` and runs the fixed handoff through an
allowed local CLI such as `codex exec` or `claude -p`.

```bash
repo-harness mcp serve --repo . --transport http --profile orchestrator --enable-dev-runner --dev-runner-agents codex
```

This setting is for local Developer Mode only. It is timeout-bounded, audited,
and not arbitrary shell.

## Hook Authority Map

- `assets/hooks/` is the only human-authored shared hook implementation. This self-host repo keeps `.ai/hooks/` as a checked-in generated projection for `"hook_source": "repo"` dogfood.
- `~/.claude/settings.json` is the user-level Claude adapter that dispatches into opted-in repos.
- `~/.codex/hooks.json` is the user-level Codex adapter that dispatches into the same runner.
- Repo-local `.claude/settings.json` and `.codex/hooks.json` hook adapters are legacy project-level config and should be retired during migration.
- Codex must mark `~/.codex/hooks.json` as trusted in Codex Settings before those hooks run.
- Debug in this order: user-level adapter config -> `repo-harness-hook` (or fallback `repo-harness hook`) -> route registry -> active hook source.
- For hook product changes, edit `assets/hooks/<path>`, run `bun run sync:hooks`, then verify with `bun run check:hooks`. Package-only templates are classified in `assets/hooks/projection.json` and are not projected into `.ai/hooks/`.

The installed adapter owns eight shared managed hook routes. Codex also installs
three Codex-only bounded-delegation routes. The route tuple
`event + routeId + matcher` is the stable contract; script names are the current
implementation under `assets/hooks/` or a repo-pinned `.ai/hooks/` copy.

| Route | Matcher | Scripts | Function |
| --- | --- | --- | --- |
| `SessionStart.default` | all sessions | `session-start-context.sh`, `minimal-change-context.sh`, `security-sentinel.sh` | Injects prior handoff, sprint status, minimal-change guidance, and read-only config-security findings before work starts. |
| `PreToolUse.edit` | `Edit|Write` | `worktree-guard.sh`, `pre-edit-guard.sh` | Enforces worktree policy and plan/contract readiness before implementation edits. |
| `PreToolUse.subagent` | `Task|Agent|SendUserMessage` | `subagent-return-channel-guard.sh` | Keeps delegated work returning through the parent session instead of leaking completion claims. |
| `PostToolUse.edit` | `Edit|Write` | `post-edit-guard.sh`, `minimal-change-observer.sh` | Records edit traces, refreshes handoff/task status, queues architecture drift, and writes bounded minimal-change evidence when controlled files change. |
| `PostToolUse.bash` | `Bash` | `post-bash.sh` | Observes command results and captures verification evidence without replacing the command runner. |
| `PostToolUse.always` | all tools | `post-tool-observer.sh` | Provides low-noise always-on trace and runtime observation; stale pinned copies soft-skip with a refresh hint. |
| `UserPromptSubmit.default` | all prompts | `prompt-guard.sh` | Classifies prompt intent, routes planning/check/hunt hints, and renders host-safe workflow guidance. |
| `Stop.default` | session stop | `stop-orchestrator.sh` | Finalizes handoff and guards against ending with unresolved draft-plan or completion evidence gaps. |

Codex-only routes are `UserPromptSubmit.delegation`,
`SubagentStart.context`, and `SubagentStop.quality`. Claude keeps the shared
`PreToolUse.subagent` return-channel route and does not install those Codex
delegation lifecycle entries.

`SessionStart` resolves hooks central-first, then runs three ordered scripts before
work begins:

```mermaid
flowchart LR
  SessionStart["Claude/Codex SessionStart"] --> Adapter["user-level adapter"]
  Adapter --> Entry["repo-harness-hook SessionStart --route default"]
  Entry --> Source{"hook source"}
  Source -->|central default| Central["packaged hooks<br/>or ~/.repo-harness/hooks"]
  Source -->|repo policy pin| Repo["repo .ai/hooks<br/>self-host development"]
  Central --> Ctx["session-start-context.sh<br/>resume + sprint + handoff context"]
  Repo --> Ctx
  Ctx --> Min["minimal-change-context.sh<br/>advice-only scope pressure"]
  Min --> Sec["security-sentinel.sh<br/>read-only config scan, fingerprint-gated"]
  Sec --> SSOut["SessionStart additionalContext<br/>prior-session state + SecurityConfig findings"]
```

`SessionStart` and `Stop` hooks are advisory for missing repo-local scripts: stale
repos get a drift warning instead of a startup failure. Required guard routes,
including edit and prompt gates, still fail closed when their scripts are
missing.

Prompt guard has one extra internal step:

```mermaid
flowchart LR
  Host["Claude/Codex UserPromptSubmit"] --> Adapter["user-level adapter"]
  Adapter --> CLI["repo-harness-hook UserPromptSubmit --route default"]
  CLI --> Route["route registry"]
  Route --> Shell[".ai/hooks/prompt-guard.sh"]
  Shell -->|"stdin {prompt}"| Decision["repo-harness-hook prompt-guard-decide<br/>TypeScript classifiers + decision table"]
  Decision -->|"verdict JSON<br/>action + intent facts + derived"| Shell
  Shell --> RouteHint["Waza route hint<br/>explicit think/planning matched first → /think"]
  Shell --> HostOutput["host-safe advice, done gate, or capture output"]
```

The shell layer owns filesystem authority and side effects. TypeScript owns all
prompt-text classification plus the `intent x plan state` decision table.
Plan-state blocks render at the PreToolUse edit layer, not here.

## Hook Failure Playbook

When a hook blocks work, start with the structured output in the terminal. The core
fields are `guard`, `reason`, `fix`, `failure_class`, and `run_id`.

- Failure log: `.ai/harness/failures/latest.jsonl`
- Trace log: `.claude/.trace.jsonl`
- Deep guide: [`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)

Most common guards:

- `PlanStatusGuard` (edit layer): an implementation edit was attempted with no active plan, or the plan is not ready to execute; the prompt layer emits the same guard name as advisory guidance
- `ContractGuard`: approved execution has not yet produced the contract/review/notes scaffold
- `ContractGuard`: completion was claimed before the task contract passed
- `WorktreeGuard`: writes were attempted in the primary worktree while linked worktrees are enforced

## Repo Workflow

- Root routing docs: `CLAUDE.md`, `AGENTS.md`
- Shared hook layer: `.ai/hooks/`
- User-level adapter layer: `~/.claude/settings.json`, `~/.codex/hooks.json`
- Active execution surface: `tasks/`
- Plan source of truth: `plans/`
- Durable progress: `tasks/workstreams/`
- Release history: `docs/CHANGELOG.md`

## Current Release

- npm package: `repo-harness@0.9.2`
- Generated workflow stamp: `repo-harness@0.9.2+template@0.9.2`
- GitHub repository: `Ancienttwo/repo-harness`
- Release history: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Acknowledgements and Workflow Influences

`repo-harness` is built around a small set of external skills, repos, and agent
runtimes that
proved useful while this project was being designed, debugged, and released.
They are acknowledged here because they shaped the workflow contract, but they
are not ordinary bundled product dependencies.

| Tool or repo | Used for | Dependency shape |
| --- | --- | --- |
| [Hylarucoder](https://x.com/hylarucoder) / Geju | P1/P2/P3 due-diligence method and Geju practice that shaped the planning, tracing, and decision-rationale discipline in this workflow | Methodology contribution and acknowledgement; not a bundled dependency |
| Waza by [TW93](https://x.com/HiTw93), including `think`, `hunt`, `check`, and `health` | Daily planning, bug hunts, verification, health checks, and Codex-first skill sync | Installed through the skills CLI into host skill roots |
| gstack skills and `gbrain` by [Garry Tan](https://x.com/garrytan) | Product discovery, plan review, design review, post-ship documentation hygiene, knowledge sync, handoff retrieval, and long-form repo memory | External operator workflow plus optional external CLI/index; advisory by default |
| `mermaid` | Human-readable architecture and system-flow diagrams when Mermaid is not enough | Runtime-referenced skill, not vendored into generated repos |
| CodeGraph (`@colbymchenry/codegraph`) | Symbol-aware navigation, impact tracing, and readiness checks for this self-host repo | Dev dependency in this repo; generated repos stay global-MCP-first unless policy opts in |
| [Oracle](https://github.com/steipete/oracle) by [Peter Steinberger](https://x.com/steipete) (`@steipete/oracle`, MIT) | Default GPT Pro / ChatGPT Web browser consult engine that the `chatgpt-browser` Oracle provider shells out to for `gptpro` consults | Externally-resolved binary (`--oracle-bin`, `REPO_HARNESS_ORACLE_BIN`, `node_modules/.bin`, or `PATH`); never auto-downloaded, and a missing binary is a hard `ORACLE_NOT_INSTALLED` failure |
| OpenAI Codex | Primary execution agent for repo-local implementation, verification, and GitHub contributor attribution when a commit materially includes Codex-authored work | External agent runtime; attribution is an explicit commit trailer, not hidden hook automation |

### GitHub Contributor Attribution

When Codex materially contributes to a commit, use GitHub's standard co-author
trailer format at the end of the commit message:

```text
Co-authored-by: codex <codex@openai.com>
```

Keep this opt-in and visible per commit. Do not bake it into downstream
repo-harness commit scripts or hooks unless that repo explicitly adopts the same
policy.

## Action Command Skills

Source-owned command facades live in `assets/skill-commands/`. They keep host
skill discovery compatible while the CLI and hooks own execution:

- Planning and review: `repo-harness-plan`, `repo-harness-review`, `repo-harness-autoplan`
- Product planning layer: `repo-harness-prd` (activates `$geju`, then uses Claude-first `claude -p --model opus` drafting with Codex fallback to write upper-layer PRDs in `plans/prds/`)
- Sprint program layer: `repo-harness-sprint` (ordered sprint backlogs in `plans/sprints/`, each row expanded with `$think` before the contract flow)
- Goal session layer: `repo-harness-goal` / `repo-harness:goal` (prepares Codex/Claude `/goal` prompts from detailed PRD or Sprint artifacts and asks for those docs when missing)
- GPT Pro local setup layer: `repo-harness-gptpro-setup` / `repo-harness:gptpro_setup` (guides `gptpro_browser` browser/session setup and `gptpro_mcp` ChatGPT Connector MCP setup while keeping ChatGPT Pro separate from API quota)
- GPT Pro consult layer: `repo-harness-gptpro` / `repo-harness:gptpro` (uses `gptpro consult/read/continue/open` language while mapping to the local ChatGPT Web browser session engine)
- Repo workflow actions: `repo-harness-ship`, `repo-harness-init`, `repo-harness-migrate`, `repo-harness-upgrade`, `repo-harness-capability`, `repo-harness-architecture`, `repo-harness-handoff`, `repo-harness-deploy`, `repo-harness-repair`, `repo-harness-check`
- Branch project creation command: `repo-harness-scaffold`

The planning chain is intentionally layered:

```text
idea -> repo-harness-prd -> repo-harness-sprint from-prd -> repo-harness-goal
```

Use `repo-harness-prd` when the source is still a product idea; it first runs a
`$geju` direction pass, then asks Claude via `claude -p --model opus` to draft the PRD, with
Codex only as fallback. Use
`repo-harness-sprint from-prd <plans/prds/*.prd.md>` to turn an approved PRD into
an ordered Sprint backlog with machine-checkable acceptance lines. Use
`repo-harness-goal` only after a detailed PRD or Sprint artifact exists; it
prepares a bounded Codex/Claude `/goal` prompt and keeps the PRD/Sprint as the
source of truth. If that document is missing, the goal command must ask for it
instead of starting implementation from chat context.

`repo-harness adopt` is for an existing repo; `repo-harness-scaffold` creates a
new project or module scaffold as a side command. `hooks-init`, `docs-init`, and
`create-project-dirs` are internal steps, not public commands.

`repo-harness-scaffold` keeps the A-K plan catalog as the project-type authority
and layers optional overlays on top: an `ai_native_profile` overlay (default
`none`) for AI-native app structure, and a separate webapp-rendering overlay
(client-only Vite as Plan B, or TanStack Start + Vite on a Cloudflare Worker as
Plan C). Overlays never install model providers or force a language default.

Use `repo-harness-capability` when the harness already exists and only selected
capability boundaries should be added. It updates `.ai/context/capabilities.json`,
syncs the requested local `AGENTS.md` / `CLAUDE.md` contract files, and validates
the registry without running a full init, migrate, or upgrade pass.

Use `repo-harness-architecture`, `repo-harness-handoff`, and `repo-harness-deploy`
for focused architecture documentation, rollover, and deploy/ops readiness
passes. These commands call existing repo-local helpers and keep their scope
narrow instead of refreshing the full harness.

## Maintainer Reference

Maintainers editing the package itself need a source checkout:

```bash
git clone https://github.com/Ancienttwo/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness
bun src/cli/index.ts update
```

The `~/Projects/repo-harness` repo is the only editable source of truth; local
Claude/Codex paths (`~/.claude/skills/repo-harness`,
`~/.codex/skills/repo-harness`) are symlink-backed runtime entrypoints. Only
`~/.codex/skills/repo-harness` exposes `SKILL.md` and `assets/skill-commands/`;
`scripts/sync-codex-installed-copies.sh` rebuilds these aliases and removes the
retired `repo-harness-skill` / `project-initializer` directories. The script
links runtime paths back to the source repo by default; set
`AGENTIC_DEV_LINK_INSTALLED_COPIES=0` for copy-based staging, or
`CODEX_SKILLS_ROOT` / `CLAUDE_SKILLS_ROOT` to stage under alternate roots.

### Self-check this repository's workflow contract

Run the full gate in [Verification](#verification); `bun run check:ci` is the
single CI-equivalent command.

### Runtime reference docs

Generic repo-harness runtime/reference docs live in the installed package under
`assets/reference-configs/` and are resolved through the CLI:

```bash
repo-harness docs list
repo-harness docs path harness-overview
repo-harness docs show harness-overview
```

Initializer and runtime defaults (question flow, plan menu, template vars,
external-tooling routing) are documented in `harness-overview.md` under
**Initializer and Runtime Model**. Generated and migrated repos still keep
`docs/reference-configs/*.md`, but those files are deterministic pointer stubs.
Repo-local workflow state, policy, checks, runs, handoff packets, context maps,
and helper snapshots stay under `.ai/`.

### Explicit template assembly

```bash
bun scripts/assemble-template.ts --plan C --name "MyProject"
bun scripts/assemble-template.ts --target agents --plan C --name "MyProject"
```

### Local benchmark skeleton

```bash
bun run benchmark:skills --dry-run
```

Dry-run benchmark output is a wiring smoke only. Release or readiness evidence
needs a non-dry-run eval with grader output.

### Run one eval across both Claude and Codex

```bash
bun run benchmark:skills --eval repair-agents-task-sync
```

## Key Files

- Skill spec: `SKILL.md`
- Root routing docs: `CLAUDE.md`, `AGENTS.md`
- Plan mapping: `assets/plan-map.json`
- Question-pack: `assets/initializer-question-pack.v4.json`
- Shared hooks: `assets/hooks/`
- Runtime reference docs: `assets/reference-configs/` via `repo-harness docs`
- Workflow contract: `assets/workflow-contract.v1.json`
- Source repo reference docs: `docs/reference-configs/*.md`
- Template assembler: `scripts/assemble-template.ts`
- Question inference helper: `scripts/initializer-question-pack.ts`
- State inspector: `scripts/inspect-project-state.ts`
- Canonical adoption planner: `src/core/adoption/standard-plan.ts`
- External tooling detector: `scripts/check-agent-tooling.sh`
- Scaffolding scripts:
  - `scripts/init-project.sh`
  - `scripts/create-project-dirs.sh`

## Generated vs Self-Hosted Hook Projection

- Downstream hook behavior is defined by `assets/hooks/` plus `assets/reference-configs/`.
- This repo dogfoods the same hook runtime through `.ai/hooks/`, but that tree is generated from `assets/hooks/projection.json`.
- Every hook change should update canonical `assets/hooks/` once, run `bun run sync:hooks`, and include `bun run check:hooks` in verification.

## Package Manager Defaults

- General default priority: `bun > pnpm > npm`
- **Plan G/H** (Python-centric) default to **`uv`** as primary package manager.

## Runtime Profiles

- `Plan-only (recommended)` (default)
- `Plan + Permissionless`
- `Standard (ask before each action)`

Configured in `assets/initializer-question-pack.v4.json` and consumed by `scripts/initializer-question-pack.ts`.

## Verification

Use the single CI-equivalent gate for release review:

```bash
bun run check:ci
```

The gate expands to the owned checks below; `bun run check:release` adds only the npm unpublished-version preflight before delegating to the same gate.

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts adopt --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --eval route-workflow-check
```
