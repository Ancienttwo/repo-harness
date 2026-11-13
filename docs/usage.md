# repo-harness usage guide

The [README](../README.md) is the landing page. This guide holds the operational
detail: install in depth, update and cleanup, cross-session work, acceptance
review, hooks, the operator console, MCP, skills and maintainer notes.

## Contents

- [Install in depth](#install-in-depth)
- [Update, upgrade and remove](#update-upgrade-and-remove)
- [Long-running product loops](#long-running-product-loops)
- [Work across sessions](#work-across-sessions)
- [Persistent acceptance review](#persistent-acceptance-review)
- [Bot merge](#bot-merge)
- [Hooks](#hooks)
- [Local operator console](#local-operator-console)
- [MCP connector](#mcp-connector)
- [Reviewing work](#reviewing-work)
- [Skills](#skills)
- [Maintainer reference](#maintainer-reference)
- [Optional strategic reflection](#optional-strategic-reflection)

## Install in depth

### 1. Install the CLI

Prerequisites: a Git working tree, `bun`, and `hc` (herdr-core) >= the `min_version` in the package file `src/core/terminal/herdr-core-pin.json` for host readiness; macOS/Linux also require `bash`,
while Windows requires Git for Windows (including its Bash and `usr/bin`
tools). `jq` is optional. No Node.js required — the installer uses Bun >=
1.4.0 as the runtime, installing or upgrading Bun first when needed.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/aimpact-inc/repo-harness/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/aimpact-inc/repo-harness/main/install.ps1 | iex
```

With Bun >= 1.4.0 already on PATH, skip the shell installer. Package-manager-owned
Bun installs fail closed with the matching upgrade command (`brew upgrade bun`)
instead of overwriting manager-owned files.

```bash
bunx repo-harness@latest install     # Bun one-shot bootstrap
bun add -g repo-harness              # or install the persistent CLI first
rh install
npx -y repo-harness@latest install   # npx fallback; the CLI still runs on Bun
```

Install `hc` through Herdr.app or a herdr-core release. Verify that `hc --version`
reports at least `min_version` of `src/core/terminal/herdr-core-pin.json` in the installed package.
Persistent review hosting requires POSIX process groups; on Windows use WSL.
Missing, unusable or older hc blocks host readiness. Before upgrading from tmux,
drain existing reviewers using the previous version and explicitly rebind terminal
endpoints. See [runtime cutover](https://github.com/aimpact-inc/repo-harness/blob/archive/docs-researches-20261004/docs/researches/20260909-herdr-runtime-cutover.md).

### 2. Bootstrap the host runtime

```bash
rh install
```

Pi is an optional host under the default `--target both`. When `pi` is on
PATH, install and update register the installed repo-harness directory with
`pi install <package-directory>`. An existing user package entry is retained.
Missing Pi skips this step. Preview with `rh install --dry-run --json`.
The minimum Pi version is [MIN_PI_VERSION](../src/pi/compat.ts); there is no upper bound.
`rh setup check` and `rh update --check` report the version,
path resolver capability, package entry and skill projection.

Catalog skills use `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills` and the
same profile selection and ownership rules as the other hosts. Uninstall removes
only owned package entries and unchanged owned skills. Package commands use Pi's
CLI; repo-harness does not write Pi settings, credentials or trust files.
Pi covers session context, agent notices, edit/write, bash and Stop hooks.
It has no fleet roles or subagent hooks. PowerShell, `!`/`!!` user shell,
other extensions' file writes and third-party MCP writes are outside this coverage.

On Windows, keep Git for Windows on the install/update `PATH`. That explicit
ceremony validates and pins `git.exe`, its matching `bash.exe`/`usr/bin`, and
the install account's absolute `TEMP` directory plus native `System32` tools in the OS account's
`~/.repo-harness/config.json#protectedHelperRuntime`. Protected workflow
helpers do not rediscover tools from a caller's `PATH`; rerun
`rh update` after relocating or replacing Git for Windows.

The global bootstrap: installs the npm package as the global CLI, refreshes
repo-harness skill aliases, installs user-level hook adapters, and records the
plugin selection. With no flag it installs core and every plugin that the host
can run; `--plugins <ids>` selects exactly those plugins, and `--no-plugins`
installs core only. It is idempotent and does not apply repo-local workflow
files to the current directory. `--dry-run --json` lists the plugins to install,
keep, remove and skip first. Plugins, the retired install-state protocols
and their bridge releases, native Codex delegation authority, refresh commands, and the read-only `setup check`
audit:
[`install-profiles.md`](reference-configs/install-profiles.md).

### 3. Preview the repo-local contract

```bash
rh init --dry-run
```

Run this from the target repository root. It reports the specs, task state,
helper runtime, hook adapter target, and verification files that would be created
or refreshed. It never creates an application stack; new projects and modules use
`repo-harness-setup`'s scaffold mode instead.

### 4. Apply and verify

```bash
rh init
bun test
```

### Success looks like this

Init writes repo-local files and one file under `HOME`: the repo registry
entry. It writes no install-managed host files. When the
required Herdr skill or the architecture projection preference is missing, init
reports a skipped step that names `rh update`. repo-harness supplies tools and evidence; the Bot
decides what to schedule.

Apply ends with `=== Migration Report ===`, naming where generated hook behavior
comes from, the user-level `~/.claude/settings.json` and `~/.codex/hooks.json`
adapter target, the repo-local surfaces created or refreshed, and an
`--- External Tooling ---` readiness block. Stable intent then lives in
`docs/spec.md` and `docs/prds/`, task and resume state in the GitHub issue,
its claim comments and the PR. If the dry run looks wrong, stop and
read
[`hook-operations.md`](reference-configs/hook-operations.md) first.


## Update, upgrade and remove

```bash
rh update          # reconcile CLI, mandatory deps, profile tooling, and CodeGraph
rh update --check  # read-only repair guidance, no writes
rh upgrade         # check retired leftovers; no writes
rh upgrade --apply # back up and remove only proven owned leftovers
rh upgrade decide --keep <path> # record an operator decision for a report-only project item
rh upgrade --registered # preview project refresh for every registered repo; no writes
rh uninstall --dry-run # preview owned user configuration cleanup
rh uninstall           # remove owned configuration; preserve user changes/history
```

`update` and `setup check` print one leftover count. `update` does not apply
cleanup. Run `upgrade --json` for ownership and proof per item. Use
`--scope project|global|all` to select the scan (default: `all`). Project scope
requires a Git repository. Check exits 1 when any leftover remains.

`upgrade --apply` also refreshes old owned copies of still-shipped skills from
this package. It refreshes the contract template only when an old ownership
hash matches. It keeps changed copies. It preserves legacy workflow-state
libraries.
Update continues to report counts only. This puts destructive changes and copy
replacement under the same explicit, backed-up transaction.

Old merge-gate state, v0.10.0 archives, and older backups are report-only by
default. Use `upgrade --apply --include-state-artifacts` to select these artifacts
for removal. This flag still requires ownership proof. Unknown artifacts stay.
The third-party Claude plugin and user rule lines in
`~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` are always report-only.
See [external tooling](reference-configs/external-tooling.md) for the plugin ID.

Project cleanup supports regular files and host hook entries. Project
directories and symlinks remain report-only. Global cleanup supports verified
owned directories and links.

Cleanup keeps changed and unowned files. It also keeps current global typed
hook adapters and user hook entries. It backs up each target before removal.
Apply exits 0 when all eligible operations succeed, even if report items remain.
A second apply with no eligible items changes no bytes. The command prints the
backup paths and records nonempty runs in
`~/.repo-harness/upgrade-cleanup.log.jsonl`.

For project rollback, use the printed `rh init rollback` command.
For global rollback, replace each target with its numbered snapshot at the
original path in the backup manifest. Do not overlay directory contents.
Restore symlinks verbatim. There is no `install --restore-transaction` command.
Keep the backup until you verify the cleanup. Homes from the older v3.x–v5.x
release line have no supported historical proof and remain report-only.

## Long-running product loops

For long-running product loops, keep discovery and engineering-plan judgment with
the parent agent before Codex loops on execution: `geju` opens the pre-contract
frame, the parent completes P1/P2/P3 and freezes the accepted direction into an
upper-layer PRD under `docs/prds/`, then orders GitHub issues through
`repo-harness-issue-flow`. The issue and PR are the durable execution queue, so a
resumed Goal session never reinterprets the original chat. See
[`agentic-development-flow.md`](reference-configs/agentic-development-flow.md).

## Work across sessions

Keep the issue, branch, verification result and next action in the handoff.
Re-read the issue and PR before continuing. Use the approved OAR and Herdr host
paths for an assigned agent. repo-harness has no PM or Engineer scheduling API.

### Board of a parent issue

```bash
rh board --parent <n> --json
```

The board reads the sub-issues, pull requests, plan block and hc seat terminals
of one parent issue. It does not claim work or create an Engineer binding.
Completion and cleanup helpers remain for existing records.

Use [repo-harness](../SKILL.md) for scope and worker ownership,
[repo-harness-product](../assets/skills/repo-harness-product/SKILL.md) for requested
PRD or Goal work, [repo-harness-issue-flow](../assets/skills/repo-harness-issue-flow/SKILL.md)
for issue backlog splitting and dispatch, and [repo-harness-check](../assets/skill-commands/repo-harness-check/SKILL.md)
for scope and recorded verification.

### Refactor recommendations

```bash
rh refactor recommendations [--import-node-limit <n>]   # measured suggestions with evidence
rh refactor decide <id> accept|defer|reject --reason "<text>" [--import-node-limit <n>]
```

ArchContext measures structural problems such as cycles and direction
violations. repo-harness shows each suggestion with its metrics, bounded evidence
and module statistics, and records the user decision. It never executes a refactor; an
accepted suggestion goes through the normal plan and pull request workflow.

## Persistent acceptance review

Before review, configure the repository's manual `external_sources` policy and
provide working provider access. The default policy is off; initialization does
not enable it. The trusted upstream Bot must authenticate the human, authorize
the scope, and supply the bound request. Its integration calls
`rh review admit --repo <execution-checkout> --request <authorized-request.json>`.
The request contains `{admission, approval, expectedRevision}`. Admission requires
an explicit `execution_mode`: `contract` or `inline`. The mode is part of the
approved admission digest; changing it requires new approval. Do not create an
approval from these examples: actor IDs and authorization references are binding
data, not authentication. Select the resulting active grant and policy digests
below, and supply the current immutable issue claim. A local plan or contract
file cannot grant permission. A user waiver requires a separate upstream-authorized
decision; waiver eligibility in an admission does not grant one.

See [the control Bot boundary](control-bot-boundary.md) for the integration contract.

```bash
rh review round --repository-id <repository-id> --issue-id <issue-id> --campaign-id <campaign-id> --grant-sha256 <approved-grant-sha256> --policy-sha256 <policy-sha256> --actor <actor-id> --reviewer-repo <linked-checkout> --herdr-endpoint <address.json> --verification <native-report> --claim-ref <claim-reference> --claim-revision <claim-sha256>
rh review status --repository-id <repository-id> --issue-id <issue-id> --campaign-id <campaign-id> --grant-sha256 <approved-grant-sha256> --policy-sha256 <policy-sha256> --actor <actor-id>
rh review close --repository-id <repository-id> --issue-id <issue-id> --campaign-id <campaign-id> --grant-sha256 <approved-grant-sha256> --policy-sha256 <policy-sha256> --actor <actor-id>
```

`review round`, `status`, `close` and `cancel` need the `peer-runtime` plugin,
including `--launch app-terminal`. Without it, they exit 1 before loading the
runner and print `install_plugin_unavailable` with the repair command.
For selection `all`, run `rh update`. For an explicit list, add
`peer-runtime` with `rh install --plugins <your plugins>,peer-runtime`.
No migration changes your selection. `review admit`, `revoke` and `publish`
stay in core.

In the Claude desktop app without Herdr, add `--launch app-terminal` and omit `--herdr-endpoint`. The first call prints the fixed host command. Claude runs it once in an app Terminal tab, then repeats the round. OAR, Seatbelt and the Receipt stay the same.

A dedicated linked checkout hosts one fleet `deep-reasoner` task-agent in the addressed Herdr session for at most three repair rounds. Default selection uses the owner’s opposite harness; `--harness` explicitly selects Claude or Codex. Only a missing executable before start allows a reported fallback. File Results pass domain binding/finding checks and the generic-review Receipt writer/verifier before close. Terminal history is observation. Claude uses an exact result-file allowlist plus mutation fingerprints; production OS write isolation and complete large-packet ingestion remain unverified.


## Bot merge

A local Herdr Bot runs `rh publication merge` in its shell. A cloud-only Bot runs the same command in a sandbox that has repo-harness, a working `gh auth` and a checkout. It merges only when `publication.acceptance_merge` is `on` in the policy on the PR base, and it needs strict required checks and enforce_admins on the default branch. A Bot record does not grant merge permission. See [the control Bot boundary](control-bot-boundary.md#bot-modes-and-merge).


## Hooks

The installed adapter binds 6 public hook routes: Claude installs 5 and Codex
installs 5. The route tuple `event + routeId + matcher` is
the stable contract; each tuple binds exactly one typed in-process handler. The
route table, with a Host column, is in
[`docs/reference-configs/hook-operations.md`](reference-configs/hook-operations.md#hook-authority-map).

`repo-harness-hook` and its typed handler registry are the host-event runtime;
`~/.claude/settings.json` and `~/.codex/hooks.json` are the user-level adapters,
and Codex must mark its file as trusted in Settings before those hooks run.
Repo-local `.claude/settings.json` and `.codex/hooks.json` are legacy config to
retire. Debug in order: adapter config -> `repo-harness-hook` -> route registry
-> typed handler.

When a hook blocks work, read the terminal output first: one `[<Guard>] <reason>`
line and one `Fix:` line. The durable record in
`.ai/harness/failures/latest.jsonl` carries `guard`, `reason`, `fix`,
`failure_class`, and `run_id`. `.ai/harness/runs/hook-events.jsonl` records
each hook event. The edit guards are `RepoScopeGuard` (a path outside the
repository), `ExternalReferenceGuard` (`_ref/`), `OpsPrivateGuard` (`_ops/`),
and `ApplyPatchScopeGuard` and `EditScopeGuard` (no parseable target path).
Full playbook:
[`docs/reference-configs/hook-operations.md`](reference-configs/hook-operations.md).

## Local operator console

Run the operator console on the same machine as the adopted repositories:

```bash
rh operator serve
```

The command binds to loopback only and prints the local URL. The console has
these pages: the development board with its task drawer, repositories, Agents,
Skills, Hooks, tools, architecture and system status. The theme follows the
system until you pick one. The language follows your saved choice, then the browser language.

A parent process that starts the server can make it stop with the parent: give the
server a dedicated stdin pipe that the parent holds, and add `--exit-on-stdin-close`.
With the flag, stdin from `/dev/null` ends at once and the server exits; a TTY keeps
it running until EOF.

`rh operator`, `rh worktrees` and `rh catch-up`
need the `operator` plugin. An `all` selection includes it. Add it to an
explicit list with `rh install --plugins <your plugins>,operator`.
Without the plugin, each command exits 1 and prints this repair, and no port is
bound. `rh seats`, `rh quota` and `rh bots` need
no plugin.

The approved design allows three bounded writes and nothing else. They open in
this order: local agent config in `~/.repo-harness/config.json`, docs sessions
that return changes as a Draft PR, and worktree cleanup. Green worktree cleanup
also has a terminal form:

```bash
rh worktrees list            # add --json for ids and selection digests
rh worktrees clean --ids <id,...> --expected-digest <digest>
rh worktrees path --repository <repo-id> --worktree <id>  # JSON line with the absolute path; the desktop shell uses it
```
 Each write passes an origin check, a write token and a
precondition check, and is audited before it runs. Host projection (install,
update, profile switch), registry cleanup and CLI uninstall stay commands that
you run in a terminal. The console does not send messages to coding sessions,
stop them or dispatch work; dispatch stays Bot → CLI → herdr. Browser payloads
do not contain secrets or absolute paths. Product scope:
[`docs/prds/20261026-2310-operator-console-uiux.prd.md`](prds/20261026-2310-operator-console-uiux.prd.md);
UX: [`docs/prds/DESIGN-operator-console-uiux.md`](prds/DESIGN-operator-console-uiux.md).

Read committed architecture facts or export a module review prompt:

```bash
rh module list --json
rh module review-prompt capability.runtime-harness.task-agent-host --json
```

The prompt uses HEAD content. It reports uncommitted paths and their content
hash separately. Its input budget comes from `.archcontext/manifest.yaml`
at `runtime.contextBudgetBytes`. If the prompt needs more than one shard, send
each shard to the same reviewer with `--shard <n>`. Start review after all
shards arrive. Diff mode requires both `--base <rev>` and `--head <rev>`.

## MCP connector

As an optional sidecar, `rh mcp serve` exposes workflow artifacts to a
local MCP client over stdio through the default `planner` profile or the
`executor` profile. The client reads real repo state and writes PRDs under
`docs/prds/`. It has no default source-code write access, no shell and no runner. The
task owner directs an explicitly addressed Herdr agent to execute the task goal.

```bash
rh mcp serve --repo . --profile planner
rh mcp doctor --repo .
```

Both commands need the `mcp` plugin. An `all` selection includes it. Add it to
an explicit list with `rh install --plugins <your plugins>,mcp`.
Without the plugin, each command exits 1 and prints this repair.
`rh mcp access set` needs no plugin.

General repo reader/writer tools, snapshot and index consistency, and server profiles:
[`general-repo-mcp.md`](reference-configs/general-repo-mcp.md).
Index-stale, CodeGraph-down, and rollback operations:
[`general-repo-mcp-codegraph.md`](../deploy/runbooks/general-repo-mcp-codegraph.md).

## Reviewing work

Execution facts and acceptance are separate authorities: a passing
`verify-contract` run proves a command ran, not that the work is accepted.
Acceptance is its own typed receipt.

Agents read source artifacts before derived summaries:

| Agent reads first | Human reviews first |
| --- | --- |
| Current user prompt and referenced files | PR description |
| `AGENTS.md` / `CLAUDE.md` | Changed files and diff |
| The GitHub issue and PR | Verification Plan execution records and run trace |
| Latest claim status comment on the issue | Residual risks and rollback |

If it disagrees with the issue, PR, checks, or handoff, the source artifacts win.

Runtime-heavy validators (Unity, browser E2E, mobile simulators, hardware rigs,
staging smoke tests) can publish external verification manifests under the
ignored run-evidence surface — a manual convention today, not an automatic
`repo-harness check` gate. See
[external tooling](reference-configs/external-tooling.md#external-verification-evidence).

## Skills

The manifest in `assets/skill-commands/manifest.json` owns skill names, source
paths, audiences, profiles and invocation policy. Bot skills select scope,
workers and acceptance decisions. Worker skills execute assigned steps.
Both hosts keep the same skill names. Load only the selected technical reference.
List the load groups with `bun scripts/skill-surface-select.ts audience-sources bot`
or `bun scripts/skill-surface-select.ts audience-sources worker`. These groups
control context loading. They do not add a host permission boundary.

| Skill | Group | Purpose |
| --- | --- | --- |
| `repo-harness` | Bot | Route explicit harness actions |
| `repo-harness-check` | Bot | Plan scoped work, review plans, assess recorded checks |
| `repo-harness-product` | Bot | Requested PRD drafting or Goal preparation |
| `repo-harness-issue-flow` | Bot | Issue and PR driven multi-agent development: split by module, dispatch workers, follow PRs and CI |
| `repo-harness-ship` | Bot | Explicit publication and cleanup decisions |
| `obsidian-memory` | Bot | Explicit memory recall or persistence |
| `repo-harness-cross-review` | Bot | Generic review; direct advisory runtime retired |
| `repo-harness-setup` | Worker | Assigned install, migration, repair or scaffold |
| `repo-harness-test` | Worker | Source tests and real fixtures |
| `repo-harness-architecture` | Worker | Assigned model, projection or diagram work |
| `repo-harness-archimap` | Worker | Draw or refresh the human-facing architecture map `docs/architecture/archimap.html` |
| `windows-python-first` | Worker | Native Windows file, text and shell work through Python |

Planning is merged into `repo-harness-check`. No separate planning alias remains.
`obsidian-memory` and `repo-harness-ship` stay installed for their
profiles. Both host switches prohibit implicit invocation.
External runtime skills remain user-owned. `think`, `check` and `geju` guide Bot
decisions. `hunt`, `health` and `mermaid` supply worker techniques. This change
does not vendor or edit them. The seven fleet personas remain separate from skills.
Ordinary tasks use a scoped brief and PR description. PRD/Sprint/Goal are optional
product workflows. `merge-gate` is a CLI judge and has no packaged SKILL.md.

`rh init` is for an existing repo; `repo-harness-setup`'s scaffold mode
creates a new project or module. `hooks-init`, `docs-init`, and
`create-project-dirs` are internal steps, not public commands. Per-mode routing
boundaries: [`agentic-development-flow.md`](reference-configs/agentic-development-flow.md)
and `rh docs show harness-overview`.

## Maintainer reference

Editing the package itself needs a source checkout:

```bash
git clone https://github.com/aimpact-inc/repo-harness.git ~/Projects/repo-harness
cd ~/Projects/repo-harness && bun src/cli/index.ts update
```

That checkout is the only editable source of truth; local Claude/Codex skill
paths are symlink-backed runtime entrypoints rebuilt by
`scripts/sync-codex-installed-copies.sh`.

`bun run check:ci` is the single CI-equivalent gate. `bun run check:release` adds
the npm unpublished-version preflight, then runs the `release` lane: the
expensive-gated tests and the tarball install smoke. It is not a second full
suite and not the CI gate; a release depends on green CI for the release SHA.
Runtime routing regressions stay in affected tests. The old routing eval gate is retired. The skill-routing aggregate in `evals/skill-routing/routing-aggregate.json` is advisory evidence, not a merge gate: the provider harness passes the raw corpus prompt with no routing preamble, so the run measures direct model answers, not skill discovery. The aggregate sets `advisory: true` and records the reason; its `overall_pass` and floors stay reported metrics. A follow-up will add the routing preamble and reconsider gating.

```bash
bun run check:ci                    # the whole gate
bun run check:context-map           # .ai/context drift against ArchContext nodes
rh docs list              # runtime reference docs, resolved from the package
rh docs show harness-overview
```

Hook handler changes go to `src/cli/hook/`. Operator helpers live in
`scripts/` and run through `rh run <helper>`. Reference docs are canonical under
`assets/reference-configs/` and projected into `docs/reference-configs/`;
`bun run check:reference-configs` verifies that projection.

## Optional strategic reflection

`rh strategy status|context|validate` exports project-local evidence
and validates inert proposals. It is off by default and never dispatches work.
The optional Skill needs an explicit `strategy install-skill` command. See
[Strategy and progressive memory](reference-configs/strategy.md).

## Acknowledgements and dependency shape

`repo-harness` is built around a small set of external skills, repos, and agent
runtimes that shaped the workflow contract. They are not ordinary bundled
dependencies.

| Tool or repo | Used for | Dependency shape |
| --- | --- | --- |
| [Hylarucoder](https://x.com/hylarucoder) / Geju | P1/P2/P3 due-diligence method and Geju practice that shaped the planning, tracing, and decision-rationale discipline in this workflow | Methodology contribution and acknowledgement; not a bundled dependency |
| Waza by [TW93](https://x.com/HiTw93), including `think`, `hunt`, `check`, and `health` | Daily planning, bug hunts, verification, health checks, and Codex-first skill sync | Installed through the skills CLI into host skill roots |
| `mermaid` | Authoring and readability review for Mermaid architecture and system-flow source | Runtime-referenced review skill, not vendored into generated repos and never an HTML artifact generator |
| [herdr](https://herdr.dev/) (`hc`, herdr-core) | Required peer-terminal runtime: notification dispatch, peer collaboration, and hosting the persistent acceptance reviewer | Externally installed `hc` binary, pinned in the package file `src/core/terminal/herdr-core-pin.json` (`min_version` floor and checksum-verified CI release asset); replaces the retired tmux runtime |
| CodeGraph (`@colbymchenry/codegraph`) | Symbol-aware navigation, impact tracing, and readiness checks for this self-host repo | Dev dependency in this repo; generated repos stay global-MCP-first unless policy opts in |
