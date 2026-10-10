# External Tooling

## External Source Intake P0

`.ai/harness/policy.json#external_sources` is absent by default and is equivalent to the only default, `{ "version": 1, "mode": "off" }`. Refresh never auto-enables from a repository URL, installed `gh`, labels, or registry access mode.

To enable one manual GitHub evidence refresh, use one exact closed selection shape. Every limit is positive. A label scan requires sorted non-empty `labels_all` and accepts a sorted optional `assignees_any` restriction. Unknown fields and provider values fail closed.

```json
{
  "external_sources": {
    "version": 1,
    "mode": "manual",
    "github": {
      "enabled": true,
      "repository": "owner/repository",
      "selection": {
        "kind": "labels",
        "labels_all": ["ready"],
        "assignees_any": []
      },
      "limits": {
        "max_pages": 5,
        "max_issues": 500,
        "max_body_bytes": 65536,
        "max_total_bytes": 1048576,
        "deadline_ms": 30000
      }
    }
  }
}
```

For an explicitly reviewed one-shot batch, select exact Issue numbers instead of requiring provider labels or scanning the whole repository:

```json
{
  "external_sources": {
    "version": 1,
    "mode": "manual",
    "github": {
      "enabled": true,
      "repository": "Ancienttwo/byok-sdk",
      "selection": {
        "kind": "issue_numbers",
        "issue_numbers": [102, 103, 104, 105, 106, 107, 108, 109, 110, 111]
      },
      "limits": {
        "max_pages": 1,
        "max_issues": 10,
        "max_body_bytes": 65536,
        "max_total_bytes": 1048576,
        "deadline_ms": 30000
      }
    }
  }
}
```

Exact-batch refresh resolves only those Issue endpoints and fails the whole attempt if any selected Issue is missing, malformed, a pull request, or exceeds a limit. GitHub assignees, labels, and open/closed state are evidence only: they do not prove whether local work has already been dispatched. Dispatch deduplication belongs to an authenticated binding against canonical repo-harness task identity.

`repo-harness external-source refresh --repo <registered-repo-id>` invokes the locally authenticated `gh` client once and records immutable observations plus an attempt receipt under the repository Git common directory. `list` performs no provider call. These records are inert evidence: they do not create or change TaskOffer, priority, Claim, Lease, WorkEnvelope, collaboration, or Agent Runtime state.

## External Source Binding WP2

After planning has produced a canonical pending sprint row and its exact Approved work-package plan/contract, run `repo-harness external-source bind --repo <id> --source-revision <digest> --sprint <path> --task-id <id> --target-ref <ref>`. The command requires a strict `read_write` registry grant and persists one immutable provenance edge with exact observation, authorization, canonical task, and plan/contract revisions.

`external-source bindings` reports source/canonical/authorization drift without mutating work. `external-source context` is the sole provider-content renderer and wraps canonical JSON in `[ExternalSourceUntrusted]`. The unchanged execution path remains canonical row + Approved plan/contract → TaskOffer → acquire → Claim/Lease → WorkEnvelope. Human acceptance stays at PR merge; only a true `installation_blocker` may pause earlier.

Generated repos route external tooling by host/runtime shape. Task-level
skill routing lives in `docs/reference-configs/agentic-development-flow.md`.

- `Waza` supplies `/think`, `/hunt`, and `/check` for daily small/medium work
- `reverse-skill-router` is an explicit-only recommended router for independently authorized reverse-engineering and security work
- `hai-stack` supplies `geju` for live, pre-contract exploration; only its frozen output enters a contract
- Codex automation requires `health`, `check`, and `mermaid` from `~/.codex/skills`
- `CodeGraph` is required agent readiness for code navigation and impact tracing
- repo-harness's packaged `agent_fleet` supplies the delegation loop's global agent definitions (`explorer`, `deep-reasoner`, `fast-worker`, `gatekeeper`, `root-cause-prover`, `harness-evaluator`) for both hosts

Waza is Codex-first in this contract. `~/.codex/skills` is the Codex runtime
source, while `~/.agents/skills` is only the skills CLI staging/cache path used
to receive upstream `tw93/Waza` updates before syncing verified copies into
Codex.

`hai-stack` is Codex-first in this contract too. `~/.codex/skills` is the
Codex runtime source for `geju`, while `~/.agents/skills` is only the skills
CLI staging/cache path used to receive upstream `hylarucoder/hai-stack`
updates before syncing verified copies into Codex. `geju` is pre-contract
exploration only — live judgment that produces a thesis, direction, and
falsifier; once that output is frozen into a task contract's `## Why` and
`## Falsifier` sections, the contract is authoritative and `geju` is not
consulted again for that task.

`repo-harness install` is allowed to bootstrap the workflow-owned global runtime
in one pass: the `repo-harness` CLI, repo-harness runtime aliases, user-level
Codex/Claude hook adapters, Waza (`think`, `hunt`, `check`, `health`), brain
root persistence, Mermaid, and CodeGraph CLI/MCP configuration.
`repo-harness init` remains a compatibility alias for existing automation. The
bootstrap path must not silently install unrelated toolchains or Claude
marketplace plugins. User-managed plugins remain outside repo-harness installation.

`repo-harness uninstall --dry-run` previews user-level cleanup without writing
configuration, locks or receipts. `repo-harness uninstall` applies it; `--json`
returns `status`, `exitCode`, `dryRun` and per-path actions. `--target codex|claude`
limits host cleanup; shared brain/profile surfaces are retired on `--target both`
(the default). `--location local` retains its narrower Claude adapter-only scope.

Cleanup removes tagged hook commands and global working-rule blocks, unchanged
profile-owned skills/rules/agents/links, proven CodeGraph registrations, and the
product's brain/helper configuration fields. Sibling hooks, configuration keys,
user-edited surfaces and vault contents remain. Newly recorded Codex request-input
and CodeGraph configuration changes restore their original values when the current
fragment still matches the installation receipt. The private
`~/.repo-harness/configuration-restore.json` is static installation history, retained
for repeated uninstall and reinstall provenance; restored entries become inactive,
and a no-op reinstall cannot reacquire ownership from history. It does not activate
a runtime.

Unproven old configuration, malformed configuration and changed owned surfaces are
reported as `unresolved`; the command exits nonzero with `status: partial` and keeps
remaining ownership evidence. Opaque Codex hook trust entries cannot yet be mapped
to commands and are reported for manual resolution. A preserved shared/pre-existing
third-party installation is not claimed as repo-harness-owned.

Standalone CodeGraph configuration and global install/update share one host lock.
Before external mutation, a private pending receipt records only selected configuration
fragments. Interrupted setup blocks ordinary mutation and cleanup; use
`repo-harness uninstall --recover-interrupted --dry-run` to preview restoration,
then `repo-harness uninstall --recover-interrupted` to apply it. This explicit
recovery restores the recorded fragments even if they were edited after interruption;
sibling fields remain. The target must include every affected host.

Package-manager globals, the official Codex plugin, independent MCP setup/workspaces,
archives and runtime history remain. Repository unadoption and package removal are
separate operations; this command does not enumerate other repositories or remove
third-party packages. Remove the CLI package only after configuration cleanup.

`repo-harness update` is a reconciliation command, not a best-effort package
install. It verifies the installed package's exact `archctx` and
`archctx-contracts` dependencies, package-local CodeGraph, compatible ArchContext
Node runtime, and capability handshake. A stale Bun global dependency tree is
reported with explicit remove/install recovery commands; update does not remove
a working CLI before a replacement is known-good. The global CodeGraph CLI/MCP
is refreshed at the exact shipped compatibility version. Mutable third-party
Waza and Mermaid providers remain behind explicit `--with-external-skills`;
`--no-codegraph` disables the CodeGraph refresh.
Repo-local workflow refresh stays on `repo-harness init`; `setup check
--check-updates` remains the read-only advisory surface.

`repo-harness upgrade` checks retired files in the current Git repository and
home. It writes nothing by default. `--json` lists each item with ownership and
proof. `--scope project|global|all` limits the check. Check exits 1 when it finds
leftovers. `setup check`, `update --check`, and a successful `update` print one
count and the upgrade command. Update does not run cleanup.

`upgrade --apply` also refreshes old owned copies of still-shipped skills from
this package. It refreshes the contract template only when an old ownership
hash matches. It keeps changed copies. It preserves legacy workflow-state
libraries.
Update continues to report counts only. This puts destructive changes and copy
replacement under the same explicit, backed-up transaction.

Old merge-gate state, v0.10.0 archives, and older backups are report-only by
default. Use `upgrade --apply --include-state-artifacts` to select these artifacts
for removal. This flag still requires ownership proof. Unknown artifacts stay.
The third-party `codex@openai-codex` Claude plugin and user rule lines in
`~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` are always report-only.

`upgrade --apply` backs up eligible targets and checks ownership again before
removal. It keeps current global typed adapters, sibling user hooks, changed
files, and files without proof. Apply exits 1 on failure and restores its target
snapshots. Backup manifests list original paths. Project transactions use
`repo-harness init rollback`; global backups require manual target replacement from each snapshot.
Do not overlay directory contents. Restore symlinks verbatim.

Global upgrade backups stay in `~/.repo-harness/transactions/install-*`.
The upgrade transaction uses `beginInstallHostTransaction(..., { retainBackup: true })`.
It keeps these backups after success or rollback. The tool never deletes these
retained backups. The user must remove old backups when they are no longer needed.

The cross-review skill is **harness-owned**; its routing source lives in
`assets/skills/repo-harness-cross-review/`. Explicit independent review uses
the persistent fleet deep-reasoner task-agent and existing OAR host in Herdr.
The full profile installs this Skill on both hosts; generic-review file Result
and typed Receipt own acceptance. The direct advisory runtime is retired.
Plugin install/discovery/readiness is not a repo-harness runtime dependency;
user-managed plugins remain untouched. Plan consultation uses persistent
task-agent collaborators in Herdr. Review Markdown remains projection only.

Reverse Skill is registered from `zhaoxuya520/reverse-skill` as the recommended
but explicit-only `reverse-skill-router`. It is not part of either install
profile because the upstream pack requires agents to read
`field-journal/precedent-auth.md`, which treats merely mentioning a target as
authorization. That assumption cannot replace a real scope or RoE boundary.
The catalog pins upstream commit
`539899ddc7608d63dc66e08e794d572e080f1a55` and the selected tree digest
`sha256:7aafee6c0dec684d410af6864ab77da4d88b9d442142c0efb91b235ce9793dda`;
repo-harness verifies the full staged tree before projecting it into either
host root.
After independent review, install it explicitly:

```bash
repo-harness install --with-reverse-skill
repo-harness update --with-reverse-skill
```

Add `--no-external-skills` to the install command when Reverse Skill should be
the only marketplace Skill added. The Skills CLI copies the router pack into
the selected host Skill roots; repo-harness does not execute its workflows or
bootstrap its optional analysis/security toolchains during install.

The review scope is the current reviewable diff, not just committed branch
history: branch diff against the default base, staged changes, unstaged tracked
changes, and untracked files are all in scope. A timeout or missing peer CLI is
reported as unavailable review evidence, not as a pass.

The Codex automation profile is a runtime reference, not a vendored copy. It
requires Waza `health`, Waza `check`, and the standalone `mermaid` skill to
exist under `~/.codex/skills`; the skill bodies stay owned by their original
installations.

The official Obsidian skills are runtime-referenced too, not vendored. The
repo-owned `obsidian-memory` facade (source in `assets/skills/obsidian-memory/`,
projected into both host skill roots) owns only the judgment layer — what to
recall, what is worth persisting, and how the project sub-vault is organized —
and delegates every Obsidian-specific format and runtime action to the official
skills: `obsidian-markdown` for authoring or rewriting vault notes, and
`obsidian-cli` for searching, opening, or operating on a running vault. Both
must exist under `~/.claude/skills` and `~/.codex/skills`;
`bash scripts/check-agent-tooling.sh --host both` probes both roots and reports
a missing skill as a gap in the `obsidian_runtime_skills` section. The gap is
advisory for the environment check and fail-closed at skill runtime:
`obsidian-memory` stops and reports rather than hand-writing its own Markdown
dialect. This repo does not vendor either skill body.

## Herdr Dispatch

For Bot and human notification setup, see [Herdr notify](herdr-notify.md).

- Default task worktrees use `/tmp/<repo>-wt-<slug>` on POSIX. Native Windows uses `os.tmpdir()` as the root. The stored default is `{{system_tmp}}/{{repo}}-wt-{{slug}}`. Runtime code resolves the temp token. Explicit stored templates stay unchanged. Commit or push work before a reboot or age-based tmp cleanup, such as `systemd-tmpfiles`. These cleaners can remove checkouts. Missing entries are pruned. The sweep saves missing registration identities before global prune. Later batches finish deferred branch cleanup. Unmerged branches remain.
- Closeout removes a merged, clean checkout and its branch. It releases only that checkout's own canonical marker after merge proof under the topology lock. The sweep keeps dirty, locked, marked or leased worktrees. It keeps branch reflogs without a commit-creation message and missing or unreadable reflogs. Fast-forward, target-only automatic merges, reset and rebase-finish messages do not count. Dispatch must establish an unmerged commit or keep the worktree dirty, marked or leased. A merged, clean, unowned branch with its own commits can be swept.
- `start` recovers only a real target directory registered by this clone on the expected branch, under the topology lock, with no lock or other owner. Recovery requires a current-user-owned checkout directory without group or other write access, a regular owned Git pointer, its matching admin backpointer, and the original directory identity saved by start. Git metadata can be group-writable but must not be other-writable. Start still creates a checkout when uid is unavailable; recovery then refuses. Exact removal retires the identity after Git readback. Missing identity or a replacement directory blocks recovery. Files, symlinks, unregistered paths and other branches are refused. Cleanup refuses a registered worktree whose branch is missing. MCP cleanup also refuses active markers and retained native verification evidence. Sweep reports name processed paths. Deferred entries are reported as counts. `kept` excludes deferred entries. A command timeout sends SIGTERM to the direct child only. A grandchild can briefly extend the deadline. No detached cleanup process starts. Herdr notifications accept registered default task worktrees and paths inside them. Other temporary paths and `rh-herdr-` labels stay filtered.

- GitHub operations (PRs, reviews, merges, labels, releases, comments) go only through the gh/git CLI or the GitHub API. Never use simulated browser clicks on github.com: the account can be banned.
- Suggested model split: when both are available, Claude (deep tier) drafts the architecture and Codex executes against the agreed plan; with only one, that model does both (plan first, then execute).
- Route all cross-model dispatch and review through herdr panes (OAR runs the worker, herdr owns panes and visibility); never start direct subprocesses or hand-written CLI calls.
- When a PR changes both test assertions and implementation code, dispatch its read-only review to the other model via herdr when available; otherwise run a read-only self-review in a separate same-model pane.
- Pane layout: put at most 3 panes side by side in one tab. Do not stack panes vertically. When the tab is full, open a new tab.

### Test and Review Rules

- Write a plan before cross-module changes, architecture changes, and dependency upgrades. Small changes do not need a plan.
- Rebase before the final full test run.
- The merge gate is typecheck plus affected tests. Run `bash scripts/check-ci.sh affected --base origin/main` locally.
- Run the full suite for dependency changes in `bun.lock` or `package.json`, large changes across modules, releases, and the daily run.
- Run `bun run test:full` once on the final rebased head when full coverage is required.
- `test:core` excludes the slow integration files. `test:integration` runs those files. `test:full` runs their complete union.
- Full runs use eight isolated file workers. Run files with shared ports or shared HOME writes in the serial tail.
- Tests with port 0 and an isolated HOME can run in parallel.
- For a baseline comparison, run only the test files that failed.
- Run long tasks in the background.
- Wait for the completion notice, or check at intervals of 5 to 10 minutes.
- Do not report each check.
- Use one cross-reviewer for each artifact.
- Limit each artifact to two review rounds.
- Ask the user to decide before a third review round.
- Before commit, remove debug writes to `/tmp` and other debug instrumentation.
- Get one cross-model read-only review when tests and implementation change together. The reviewer checks that assertions still test the required behavior.

Known flaky test: `tests/herdr-task-lifecycle.test.ts`, "MCP goals use visible persistent Herdr peers, redact history and clean success and timeout panes", can fail with `task_agent_ambiguous_launch`. Record this failure as known flaky. Do not skip the test or weaken its assertions. Do not treat this signature as a new failure.

## Detect Safely

Use `repo-harness run check-agent-tooling` for a read-only tooling report.
Init and migration reports run the detector without update checks by default;
set `REPO_HARNESS_CHECK_TOOLING_UPDATES=1` when that advisory pass should
also compare upstream versions.

Supported flags:

- `--host claude|codex|both`
- `--json`
- `--check-updates`
- `--strict-readiness`

The detector intentionally avoids side-effecting commands. It does not run:

- `npx skills check`
- `npx skills update`
- `codegraph init`
- `codegraph sync`
- `codegraph install`

With `--check-updates`, Waza update checks fetch upstream GitHub raw
`SKILL.md` and shared `rules/` files, then compare versions/hashes against each
host path. The detector also compares each host's Waza skill directories and
shared rules against the `~/.agents` staging cache so helper files under
`references/`, `scripts/`, `agents/`, and cross-skill `rules/` links cannot
silently drift. Network failures are reported as `unknown`; the detector never
updates skills.

## Install

### Waza

Both hosts:

```bash
bunx skills add tw93/Waza -g -a claude-code codex -s think hunt check health -y
```

Single host:

```bash
bunx skills add tw93/Waza -g -a claude-code -s think hunt check health -y
```

Replace `claude-code` with `codex` when installing for Codex only.

After installing or updating through the skills CLI, verify Codex has its own
runtime copy:

```bash
for d in think hunt check health; do
  rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/
done
mkdir -p ~/.codex/rules
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cp ~/.agents/rules/$f ~/.codex/rules/$f
done
for d in think hunt check health; do
  diff -qr ~/.agents/skills/$d ~/.codex/skills/$d
done
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cmp -s ~/.agents/rules/$f ~/.codex/rules/$f
done
```

### hai-stack

Both hosts:

```bash
bunx skills add hylarucoder/hai-stack -g -a claude-code codex -s geju -y
```

Single host:

```bash
bunx skills add hylarucoder/hai-stack -g -a claude-code -s geju -y
```

Replace `claude-code` with `codex` when installing for Codex only.

After installing or updating through the skills CLI, verify Codex has its own
runtime copy:

```bash
rsync -a --delete ~/.agents/skills/geju/ ~/.codex/skills/geju/
diff -qr ~/.agents/skills/geju ~/.codex/skills/geju
```

### CodeGraph

`CodeGraph` is required readiness for agent code navigation. It speeds up
Codex and Claude exploration for indexed TypeScript and other supported languages, but it
does not replace `.ai/context/capabilities.json`, workflow checks, tests,
architecture drift events, or shell-script review.

This self-host repo vendors CodeGraph as a dev dependency so `bun install`
materializes `node_modules/.bin/codegraph`; its source-only
`scripts/ensure-codegraph.sh` can manage the local index. Generated downstream
repos keep the global MCP installer default and should use the `codegraph`
command directly unless local policy explicitly opts into vendoring.

### Runtime Ownership Boundary

`repo-harness setup check --target <host> --check-updates --json` reports the
execution base as separate `runtime.*` checks and reports repo-local adoption
refresh as `repo.init-refresh` when the current repo has opted in. Keep the
boundary explicit:

| Capability | Owner | Required for |
|---|---|---|
| `herdr` | user install (herdr.dev) | required at the version pinned in `.ai/harness/policy.json#external_tooling.herdr`; peer terminals and persistent task reviewer hosting |
| `bun` | repo-harness | repo-harness-owned global installs, local dependency install, tests, and runtime execution |
| `bash` | repo-harness | helper scripts, migration, setup checks, and contract verification wrappers; Git-for-Windows Bash is the Windows platform contract |
| `npm` | npm registry | registry readbacks, publish gates, and opt-in update checks; not repo-harness-owned global install repair |
| `npx` / `skills_cli` | external Skills CLI | Waza and Mermaid skill bootstrap/update commands |
| `rsync` | platform filesystem | Waza staging-to-Codex sync and installed-copy runtime mirroring |
| `symlink` | platform filesystem | link-mode aliases; copy mode is the fallback |

`.ai/harness/policy.json#external_tooling.herdr` is the single herdr pin: it owns
the `min_version` floor and the checksum-verified `release_assets` entry that CI
installs. Install herdr through its official installer or platform package manager
and verify `herdr --version` reports at least that pinned `min_version`.
`check-agent-tooling.sh --strict-readiness` reads the same key and fails if herdr is
missing, unusable, or older than the pin; `setup check` projects `runtime.herdr`. Repo-harness does not install it or edit user Herdr config.
The root `repo-harness` skill requires the `herdr` skill on Codex and Claude.
`repo-harness install` and `repo-harness update` copy the release-matched
skill text from `herdr --skill` into each selected host skill root. They refuse
to replace a user-edited or unowned copy. Strict readiness compares each
installed copy with `herdr --skill` and fails when a copy is absent or differs.
The skill only controls Herdr from a real Herdr pane with `HERDR_ENV=1`.
The persistent reviewer still requires POSIX process groups: use macOS/Linux or
WSL. Native Windows review lifecycle support is not implied by Herdr support.
Drain old tmux reviewers with the previous repo-harness version before upgrading.
Rebind endpoints explicitly as `herdr-cli-agent`; old adapter policy, capabilities
and live session metadata are not translated. The self-host runtime remains off.
No runtime or collaboration path automatically falls back to tmux.
The native protected-helper tool contract below remains a separate boundary.

The policy is Bun-first, not Bun-only. Repo-harness-owned install/repair commands
use `bun add -g` or `bun install`. Waza/Mermaid remain explicit external Skills
CLI dependencies until a separate plan replaces that integration. Missing
optional capabilities should degrade the named feature, not blur command
ownership.

On Windows, `repo-harness install` and `repo-harness update` are the only
protected-helper tool discovery ceremonies. They resolve `git.exe` and
`taskkill.exe` from that invocation's `PATH`, require the latter to match
`SystemRoot\\System32\\taskkill.exe`, require Git, Bash, and `usr/bin` to
resolve under one non-symlink Git-for-Windows root, require the ceremony's
`TEMP` to be an absolute non-symlink directory, probe the executables, and
atomically persist protocol 1 under the OS account's
`~/.repo-harness/config.json#protectedHelperRuntime`. Existing sibling config
fields are preserved.

Normal `acceptance-receipt`, `merge-gate`, `contract-worktree`, and
`ship-worktrees` dispatch reads that exact contract. The protected child gets
the platform `PATH` delimiter, account home, pinned temp/SystemRoot values,
pinned Bun/Git/Bash, the Git-for-Windows POSIX directories, and the exact
`taskkill.exe` passed to both supervisor termination paths; caller binary overrides, `HOME`, shell
startup hooks, and general `PATH` entries are discarded. A missing, malformed,
relocated, symlinked, cross-root, or incomplete contract fails before helper
execution and instructs the operator to rerun install/update. There is no
runtime discovery fallback. The protected TypeScript entrypoints re-resolve the
same host contract themselves when invoked directly, so their Git and temp
authority does not depend on dispatcher-only environment variables. Optional
feature dependencies such as `jq` and `gh` remain separately operator-owned
and are not installed by this contract; the required merge-gate path does not
depend on `jq`.

Installed-copy sync has two explicit modes. `AGENTIC_DEV_LINK_INSTALLED_COPIES=1`
uses symlinks and does not require `rsync`; if symlink creation fails, the
script reports unsupported link-mode and tells the caller to use copy-mode.
`AGENTIC_DEV_LINK_INSTALLED_COPIES=0` uses copy-mode and requires `rsync`; if
`rsync` is missing, the script reports unsupported copy-mode instead of a
generic command failure.

Read-only check:

```bash
codegraph status .
```

Local index mutation:

```bash
codegraph init -i .
codegraph sync .
```

Do not ask users to copy MCP TOML or Claude JSON by hand. The user-facing path
is one terminal command, or explicit authorization for their agent to run the
same command:

```bash
bun add -g @colbymchenry/codegraph && repo-harness tools configure codegraph --target codex --location global
```

This delegates host-specific MCP config to CodeGraph's target adapters for
Codex and Claude, so do not run CodeGraph setup automatically from
`repo-harness init`, `migrate`, or `upgrade`. Restart Codex after the installer
finishes so the MCP server is discovered; Claude Code should pick up its config
according to its own settings reload behavior. If a launch environment still
cannot find `codegraph`, an authorized agent should diagnose `PATH` and the
`~/.local/bin/codegraph` shim. Do not make the user hand-edit MCP config as the
fallback.

For troubleshooting only, inspect host config snippets without writing:

```bash
codegraph install --print-config codex
codegraph install --print-config claude
```

Project-local indexes are ignored runtime state:

```bash
codegraph init -i .
codegraph status .
```

Before non-trivial code work, agents should sync the local index and use it for
P1/P2 discovery:

```bash
codegraph sync .
codegraph context "<task>"
codegraph query <symbol> --json
codegraph callers <symbol> --json
codegraph callees <symbol> --json
codegraph impact <symbol> --json
```

For this repo, do not treat `codegraph affected` as an authoritative test
selector. Many tests execute scripts by path or subprocess rather than import
edges, so run the repo verification commands instead.

### Bash Output Evidence and RTK

`repo-harness` treats Bash output as runtime evidence, not durable task state.
`PostToolUse:Bash` records command metadata in `.ai/harness/checks/` and stores
large or failed command output under ignored `.ai/harness/runs/bash-output/` with
the byte count, SHA-256 digest, and relative evidence path.

RTK can be useful as a user-level compression tool for noisy successful shell
commands, but it is optional and advisory-only. Hooks may suggest `rtk` when it
is already on `PATH`, the command is broad, and the command succeeded; hooks must
not rewrite Bash commands, require RTK, or suggest compression for failed
commands. Failed command output stays raw so test, build, and review evidence is
not hidden by a compressor.

## External Verification Evidence

Runtime-heavy projects often prove work outside normal source files and unit
test output. Unity, browser E2E, mobile simulators, hardware rigs, and staging
smoke tests can all produce logs, screenshots, traces, or device output that
belongs in the harness review flow without making `repo-harness` run those
tools directly.

Today this is a convention only: `repo-harness` does not automatically discover,
summarize, or gate on these manifests yet.

For the CLI/npm release surface, `runtime-evidence-receipt.ts verify` is the
bounded exception: it records a separate `RuntimeEvidenceReceipt v1` only when
a registry readback binds the published tarball and a clean install returns the
expected CLI version and `repo-harness-state-snapshot` hook contract. The
installed package manifest must declare `repo-harness` and `repo-harness-hook`
bin targets; supplied executable paths resolve to those in-package targets
(including `.bin` symlinks), and the installed manifest plus both bin contents
must byte-match their published tarball members. This is
release-side runtime evidence, not an `AcceptanceReceipt`, task-review oracle,
scheduler, or service-auth readback; missing any observation fails closed.
Installed CLI/hook commands run with the current trusted Bun executable
directory plus `/usr/bin:/bin`, which is the minimum PATH supporting their real
`#!/usr/bin/env bun` shebang without inheriting the caller environment.

The recommended v1 convention is evidence ingestion, not provider invocation.
It is not yet an automatic `repo-harness check` gate:

- external validators run under the project's own tooling and trust boundary
- providers publish a small manifest plus artifact references
- reviewers can cite these manifests from check/review/handoff artifacts
- automatic manifest discovery and summarization are follow-up implementation
  work
- missing, skipped, or partial external evidence should be recorded as
  validation gaps, not treated as implicit passes

Recommended runtime layout:

```text
.ai/harness/runs/external/<task-id>/<run-id>/manifest.json
.ai/harness/runs/external/<task-id>/<run-id>/artifacts/...
```

This uses the existing ignored run-evidence surface. Durable conclusions should
be promoted into `tasks/reviews/<task>.review.md`, `tasks/contracts/`,
`tasks/notes/`, or project documentation instead of committing raw provider
artifacts by default.

Minimal manifest shape:

```json
{
  "schema_version": "repo-harness.external-evidence.v1",
  "task_id": "20260629-runtime-heavy-ui",
  "run_id": "20260629T023507Z-aibridge-screenshot",
  "provider": {
    "name": "aibridge",
    "version": "1.6.1"
  },
  "subject": {
    "task_type": "unity.ui",
    "branch": "feat/example",
    "commit": "26eff6fc70b2c24cc3a00616204d3611f61df18e",
    "worktree_dirty": true
  },
  "operations": [
    {
      "kind": "unity.compile",
      "command_display": "AIBridgeCLI compile unity",
      "started_at": "2026-06-29T02:35:07Z",
      "ended_at": "2026-06-29T02:36:10Z",
      "exit_code": 0,
      "outcome": "pass"
    }
  ],
  "artifacts": [
    {
      "type": "log",
      "path": "artifacts/compile.log",
      "summary": "Unity compile passed with no Console errors",
      "sha256": "b6e3f4a6a1c2d5e8f0b9c7d6a4e3f2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5",
      "redacted": true
    }
  ],
  "outcome": {
    "status": "pass",
    "summary": "Compile and Console validation passed"
  },
  "validation_gaps": [
    {
      "severity": "medium",
      "description": "No PlayMode scenario was run"
    }
  ],
  "safety": {
    "side_effects": "writes_ignored_runtime_state",
    "privacy_reviewed": true
  }
}
```

Manifest locations are repo-relative when cited from durable reviews. Artifact
paths inside a manifest are relative to the manifest directory unless explicitly
documented otherwise. Providers should prefer summaries over absolute local
paths, mark whether artifacts are redacted, avoid storing secrets or private
payloads in durable summaries, and record skipped validation explicitly so
reviewers can see what was not exercised.

Use `read_only` only when the provider did not mutate project files, runtime
caches, devices, external services, or build outputs.

Global agent skills that wrap external validators should be project-gated:
activate only when the current repo has an explicit local marker or CLI, no-op
outside that repo, and keep the repo's own AGENTS/CLAUDE/repo-harness routing in
control. Treat this as activation and DX isolation, not a complete security
boundary for untrusted repositories.

## Update

### Waza

```bash
bunx skills update
for d in think hunt check health; do
  rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/
done
mkdir -p ~/.codex/rules
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cp ~/.agents/rules/$f ~/.codex/rules/$f
done
for d in think hunt check health; do
  diff -qr ~/.agents/skills/$d ~/.codex/skills/$d
done
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cmp -s ~/.agents/rules/$f ~/.codex/rules/$f
done
```

### hai-stack

```bash
bunx skills update
rsync -a --delete ~/.agents/skills/geju/ ~/.codex/skills/geju/
diff -qr ~/.agents/skills/geju ~/.codex/skills/geju
```

### CodeGraph

```bash
bun add -g @colbymchenry/codegraph@1.6.1 && codegraph sync . && codegraph status .
```

## Agent Fleet

`agent_fleet` is a repo-harness-owned package surface declared in
`.ai/harness/policy.json` under `external_tooling.agent_fleet` and detected by
`check-agent-tooling.sh`. The single authored source is
`package:agents/fleet`; it ships inside the npm package and never requires a
network fetch. The managed list is `explorer`, `deep-reasoner`, `fast-worker`,
`deep-worker`, `gatekeeper`, `root-cause-prover`, and `harness-evaluator`.

### Two targets, one source

- Claude Code: `~/.claude/agents/<agent>.md` — the packaged source `.md` file
  is installed byte-for-byte.
- Codex: `~/.codex/agents/<agent>.toml` — generated deterministically from the
  same packaged `.md`; there is no second authored copy for Codex.

### `.md` -> `.toml` mapping

The generator is fail-closed: it asserts `name`, `description`, `model`, and
`effort` are present in the packaged frontmatter, and only recognizes the
family/effort pairs below. Any other combination is an error, not a guessed
mapping.

| Source `model` | Codex `model` | Source `effort` | Codex `model_reasoning_effort` |
|---|---|---|---|
| `opus` | `gpt-6-astra` | `low`, `medium`, `high`, `xhigh`, `max` | same string, unchanged |
| `sonnet`, `haiku` | `gpt-6-luna` | `low`, `medium`, `high`, `xhigh`, `max` | same string, unchanged |
| `fable` | `gpt-6.1-sol` | `low`, `medium`, `high`, `xhigh`, `max` | same string, unchanged |

Seven per-agent target overrides are applied after tuple validation, on top of
the family row above, and are the only model/effort remaps in the generator:
`explorer` (`sonnet`/`medium`) targets `gpt-6-luna` at `high` reasoning;
`deep-reasoner` (`opus`/`xhigh`) targets `gpt-6-astra` at `high` reasoning;
`fast-worker` (`sonnet`/`high`) targets `gpt-6.1-sol` at `medium` reasoning;
`deep-worker` (`opus`/`high`) targets `gpt-6.1-sol` at `high` reasoning;
`gatekeeper` (`opus`/`high`) targets `gpt-6-astra` at `medium` reasoning;
`root-cause-prover` (`opus`/`xhigh`) targets `gpt-6-astra` at `high` reasoning;
`harness-evaluator` (`opus`/`high`) targets `gpt-6-astra` at `medium` reasoning.

`fast-worker`, `deep-worker`, `root-cause-prover`, and `harness-evaluator`
receive `sandbox_mode = "workspace-write"`; every other role receives
`sandbox_mode = "read-only"`. Current assignments are explorer
(`sonnet/medium`), deep-reasoner (`opus/xhigh`), fast-worker (`sonnet/high`),
deep-worker (`opus/high`), gatekeeper (`opus/high`), root-cause-prover
(`opus/xhigh`), and harness-evaluator (`opus/high`). Root-cause-prover's prompt further limits
writes to bugfix evidence inside the active contract's allowed paths;
harness-evaluator runs existing skill/adoption surfaces only when both repo and
HOME pass the runner's disposable boundary: skills uses `--require-disposable`,
while adoption uses one `--run-adoption-profile` invocation that injects the
validated repo/HOME into inspector and init dry-run. Guarded skills overrides
the ordinary sibling workspace default with a repo-internal workspace, and both
profiles scrub inherited repo-harness source/helper overrides. The guard rejects source
checkout and real HOME in either argument position; the role returns BLOCKED
when the guard fails and must fail closed on requests for the retired `evals/bdd2/**` corpus. The opus
family projects to Terra by default with effort carried through unchanged; the only effort
remaps are the three explicit per-agent overrides above, and any unmapped model/effort
combination remains a hard error.

The Codex generator also rewrites the exact upstream provider label in the
description (for example, `Opus at max effort` or `Sonnet at high effort`) to the
mapped GPT-5.6 model and reasoning level. A missing label fails closed so the
installed metadata cannot claim a different model from the TOML settings.

These files define the desired installed role configuration for Codex native
MultiAgent `agent_type` selection. On Codex CLI 0.147, the supported repository
fleet roots use the live v2 native spawn surface. `agent_type` is the only fleet
identity/lifecycle authority, and a repository fleet dispatch packet must also
pass `fork_turns="none"` and remain self-contained. If the live schema cannot
accept the requested installed `agent_type` and v2 packet shape, the fleet
dispatch fails closed instead of translating fields or selecting an App thread,
`codex-exec`, a generic subagent, or the main thread.

The native multi-agent tool surface is routed per root model by the Codex model
catalog (`models_cache.json#multi_agent_version`, verified on CLI 0.147.0):
`gpt-5.6-sol`/`sol-wm`/`terra` roots get v2 with `task_name`, `fork_turns`,
`list_agents`, and `send_message`; `gpt-5.6-luna` and `codex-auto-review` roots
get the v1 namespace. V1 still discovers configured custom agent TOMLs and
accepts `agent_type`, but uses `fork_context=false`, `send_input`,
`resume_agent`, `close_agent`, and `wait`; its tools may be deferred behind
`tool_search`. A V1 root is outside this repository's v2 fleet packet contract,
so dispatch from that surface fails closed as repository policy, not because
Codex V1 can only create a generic built-in subagent.

`features.multi_agent_v2 = true` is a global override that forces every root
model onto v2. It is not a prerequisite for fleet dispatch from a sol/terra root
and must not be enabled as a "fix" for a dispatch that failed to pass
`agent_type`/`fork_turns`. The v2 `list_agents` tool enumerates live agent
threads in the current task tree, not the installed role registry. Luna's v1
marking has no official rationale (open upstream issue openai/codex#35097) and
is treated as catalog state, not a model-capability claim.

Installed files do not by themselves prove that Codex honored the configured
model. Runtime selection claims stay behind official `SubagentStart`
`agent_type`/`model` evidence. `SubagentStart` does not expose reasoning effort,
so that field remains `configured_unverified` and is never promoted to a runtime
claim.

A 2026-08-11 Codex CLI 0.147 canary recorded `explorer` on its configured
`gpt-5.6-luna` model and `deep-reasoner` on its configured `gpt-5.6-terra`
model in one session. The strict tooling check aggregated both official
observations as `verified`. This closes the older flat-V2 limitation for the
versioned native surface; it does not turn missing future `agent_type` or model
readback into a compatibility fallback.

### Local merge gate

The local merge gate is provider-free. Semantic authority lives only in the
host-owned AcceptanceReceipt created from the reviewer frozen in the task
contract, or from a typed user waiver when that contract allows it.
`merge-gate.ts` verifies the receipt and seals the exact base SHA, head SHA,
full binary diff, receipt bytes, and installed helper bytes. It never owns
provider credentials or starts a reviewer.

The exact target base commit enables the local gate in
`.ai/harness/policy.json#merge_gate`; the candidate cannot disable that base
requirement. Runtime setup installs no merge-gate skill, agent, or provider
runtime. Caller `HOME`, helper-source, and runner environment overrides are ignored for
the protected ship/gate helpers. The official runner pins Bash, Git, and Bun;
where a fixed trusted host `gh` is present it pins that executable too, and it
replaces caller `PATH` with the minimal host runtime path. The host state directories, AcceptanceReceipt, and
seal must be owned by the OS account and not group/world writable. After
`contract-worktree finish` creates the candidate commit, the installed helper
binds the seal to repository root, target base ref/SHA, candidate head SHA,
binary diff fingerprint, AcceptanceReceipt fingerprint, and installed helper
fingerprint. `contract-worktree` and
`ship-worktrees` revalidate the exact SHA immediately before merge or push;
PR mode fetches the remote base first and pushes an explicit SHA refspec.

The receipt and seal live outside the candidate workspace at
`~/.repo-harness/gates/<repo-id>/acceptance.latest.json` and
`merge-seal.latest.json`. A missing/rejected/stale receipt, direct
candidate-helper execution, dirty worktree, semantic subject change,
overlapping target movement, moved HEAD, or mismatched seal blocks the side
effect. Non-overlapping target movement recomputes only the local seal.

This is a same-user local control for bounded agents, not a defense against the
machine owner or an unrestricted same-user process. Hosted branch protection
and CI remain the remote merge authority.

For Codex, repo-harness keeps configuration readiness and runtime routing
readiness separate:

- `UserPromptSubmit.delegation` is an explicit command adapter only: `/delegate`
  or `/parallel` injects the bounded dispatch contract. Natural-language prompt
  classification and SessionStart standing authorization are not authorities.
- `SubagentStart.context` consumes Codex's official `agent_type` and `model`
  fields plus `turn_id` and `agent_id`. It enumerates project custom-agent TOML
  files first, then user files, parses them with `Bun.TOML.parse`, selects by
  the schema-authoritative `name`, and writes one atomic observation per child
  under the event-scoped directory referenced by
  `.ai/harness/delegation/native-role-routing.json`, even when no prompt advisor
  state exists. It does not read Codex transcripts. The filename is only a
  convention; an unrelated valid profile may inherit its model, while the selected profile
  must pin one before repo-harness can verify model routing.
- `check-agent-tooling.sh` deterministically aggregates the current native
  event scope only; it never revives a historical scope. The hook retains at
  most 32 observations in that scope and removes older managed scope evidence
  under a dedicated native-evidence lock. Each verified or mismatched
  observation carries the selected TOML SHA-256, so later config drift
  invalidates stale evidence. `--strict-readiness` fails after `unverified`,
  `unavailable`, `mismatch`, `invalid`, structurally malformed evidence, an
  empty current scope, or a missing current pointer target.

The official [Codex Subagents documentation](https://developers.openai.com/codex/subagents)
documents `model_reasoning_effort` in each agent file, and the official
[Configuration Reference](https://developers.openai.com/codex/config-reference)
also documents `agents.default_subagent_reasoning_effort` plus explicit spawn
effort precedence. `SubagentStart` does not expose the effective
`model_reasoning_effort`, so repo-harness records `reasoning_effort_status =
"configured_unverified"` and never promotes a configured or requested value to
runtime proof. A missing, default,
mismatched, invalid, or unverified native observation blocks a role-routing
claim and authorizes no alternate fleet runner. repo-harness must not scrape
rollout JSONL or SQLite as a compatibility path.

`developer_instructions` is the packaged `.md` role body only. Generated
personas carry no EXECUTION_BOUNDARY anti-extras clause, and neither does the
Codex delegation advisor hook: on the native-child path `SubagentStart.context`
is the single injection owner, so the clause appears exactly once in each
rendered task packet under the marker
`[repo-harness:execution-boundary/v1]`. The hook renders it only when both
halves of the scope decision are known — a resolved active contract and a child
whose selected profile declares `sandbox_mode = "workspace-write"`; a
`read-only` child gets the inverse note, and an unresolved contract or
unverified routing gets neither.

`sandbox_mode` is therefore required in every custom-agent TOML and validated
fail-closed. Writability is read from the selected profile, never inferred from
the agent name and never defaulted: a profile missing `sandbox_mode`, or
declaring anything other than `read-only` or `workspace-write`, routes the child
to native-role-routing `invalid` and receives no implementation boundary.

### `install_mode`: self-host vs. downstream

`install_mode` has the same self-host/downstream split as `codegraph`'s
`install_mode`:

- This repo's own `.ai/harness/policy.json` sets
  `"install_mode": "auto-install-on-init"` — `init` and `migrate --apply`
  install the fleet automatically.
- Generated downstream repos default to `"install_mode": "advisory"` — `init`
  and `migrate` only print a one-line reminder naming
  `repo-harness run install-agent-fleet`; nothing is written automatically.

`migrate --dry-run` never installs the fleet regardless of `install_mode`;
dry-run makes no writes to the global agent-fleet directories at all.

### Install / update

```bash
repo-harness run install-agent-fleet
```

The installer resolves `agents/fleet` from its authoritative helper source path,
not from the target repository's current working directory. There is no source
override, curl path, remote fallback, or alternate authority. It validates all
six source files before mutating any target; a missing, malformed, mismatched,
or unmapped source makes the whole run fail closed and leaves installed files
untouched.

The installer requires Bun >= 1.4.0, matching repo-harness's package runtime
contract and its verified subprocess environment-inheritance behavior.
The CLI entry rejects older or unparseable Bun runtimes before command dispatch.
The top-level Unix and Windows bootstrap installers upgrade an older detected
Bun before installing repo-harness, rather than relying on package-engine
metadata that older Bun releases do not enforce.
The shared global runtime setup used by mutating `repo-harness install`, `init`,
and `update` binds every Bun subprocess to the exact executable it probes. It
runs and verifies `bun upgrade` only for Bun self-installer-owned binaries;
older Homebrew, Scoop, npm, or other package-manager-owned binaries fail closed
with an actionable manager upgrade command. This covers direct
`bunx`/`bun add`/`npx` entrypoints without overwriting manager-owned files;
read-only update checks bypass this mutation.
Installed Codex identity checks use `Bun.TOML.parse` rather than text matching,
so quoted keys, tables, and multiline strings retain TOML semantics before any
stale managed target can be deactivated.

The installer is **never-clobber by default**: an existing target file that
differs from the newly resolved content is reported as `drift` and left
untouched. Pass `--force` to overwrite drifted files.

An operator who intentionally owns a customized, complete fleet can acknowledge
the current bytes once:

```bash
repo-harness run install-agent-fleet --accept-user-managed
```

The acknowledgement validates all twelve target files before writing
`~/.repo-harness/agent-fleet-user-managed.json`. Claude files must have
well-formed frontmatter with the target role identity, model, effort, and body;
Codex files must be valid TOML with a pinned model, supported reasoning effort,
and developer instructions. Symlinks, missing files, malformed files, or
role-name mismatches fail closed without changing the receipt.

Only customized files are recorded, by absolute path and SHA-256. Later
installer and full-profile runs report those exact bytes as `user-managed`
and do not claim transaction ownership over them. Any subsequent byte change
invalidates the acknowledgement and returns to `drift` until the operator
reviews and accepts the new content. `--force` restores packaged content and
removes the user-managed receipt. Re-running with no packaged-source changes
reports packaged files as `up-to-date`.

### Readiness

`repo-harness run check-agent-tooling --host both --strict-readiness` reports
`agent_fleet` alongside `codegraph`. With `--check-updates`, it compares each
installed Claude-side `.md` against the packaged source hash without network
access. When a file differs from that source, it consults the
`--accept-user-managed` receipt (`~/.repo-harness/agent-fleet-user-managed.json`):
an entry whose SHA-256 still matches the file's current installed content
reports `user-managed` on its own report line instead of drift, while a
missing or malformed receipt, an absent entry for that path, or a stale hash
still reports `drift`, fail-closed. The per-host rollup is `up-to-date` once
nothing is left in drift. The Codex `.toml` side is a generated artifact and
is checked for presence; installer golden tests prove the deterministic
generation.

### Uninstall

There is no uninstall command. Removing the fleet means deleting the twelve
managed files by hand:

```text
~/.claude/agents/explorer.md
~/.claude/agents/deep-reasoner.md
~/.claude/agents/fast-worker.md
~/.claude/agents/gatekeeper.md
~/.claude/agents/root-cause-prover.md
~/.claude/agents/harness-evaluator.md
~/.codex/agents/explorer.toml
~/.codex/agents/deep-reasoner.toml
~/.codex/agents/fast-worker.toml
~/.codex/agents/gatekeeper.toml
~/.codex/agents/root-cause-prover.toml
~/.codex/agents/harness-evaluator.toml
```

## ArchContext Capability Source

`.ai/harness/policy.json#context.capability_source` selects the single capability
authority for a repo:

| Value | Authority | Read path |
|---|---|---|
| `registry` (default) | `.ai/context/capabilities.json` | JSON capability registry |
| `archcontext` | `.archcontext/model/nodes/*.yaml` | `archcontext.node/v2` capability nodes |

Exactly one source is read. There is no dual-read, no merge, and no fallback in
either direction: under `archcontext` a missing model directory fails instead of
falling back to the JSON registry, and under `registry` a present model
directory is never consulted. Under `archcontext` the JSON registry is not
writable, so `repo-harness run capability-config add` refuses and points at the
node files.

Capability authority does not require the `archctx` CLI: node files are read
directly with Bun's native YAML parser, so selecting `capability_source` never
spawns a daemon or external process. Bun older than 1.3 has no `Bun.YAML`; that
fails closed with upgrade guidance and only when `capability_source` is
`archcontext`.

Architecture projection execution is user-level configuration in
`~/.repo-harness/config.json#architecture`. `repo-harness install` and
`repo-harness update` initialize it once with `projection_provider: "archctx"`,
`projection_apply: "manual"`, and `projection_timeout_ms: 120000`. Repeated
setup preserves an explicit global choice, including disabled. Setup migrates a
section from the retired automatic queue once: `automatic` becomes `manual` and
`projection_failure_gate` is removed. Until then, readers refuse that section
and name the migration command. Malformed or partial settings fail closed without
rewriting the file; unrelated user settings are preserved. The exact provider
version is owned by the packaged release contract, not a configurable repo pin.

`repo-harness init` remains a repository-only transaction. Standard/self-host adoption
removes retired `architecture.projection_*` execution keys from repo policy and
reports global provider readiness, without writing user configuration or
inventing the project's model. Minimal adoption does not author a policy.
Runtime does not read or merge retired repo execution settings. Capability
identity, model files, documentation ownership and project freshness gates
remain repository-local. Missing model/adoption evidence still blocks apply;
the global apply mode does not authorize ownership adoption or semantic acceptance.

Use `repo-harness architecture-projection policy --json` to inspect the global
source path, initialization state and effective execution settings without a
provider process. `repo-harness architecture-projection status --json` adds the
exact package capability handshake and project apply readiness. The running
repo-harness package owns the `archctx` executable and exact dependency version;
its dependency tree is refreshed by the global update transaction. A target
repository's `node_modules/archctx` never overrides that runtime dependency.
Source-checkout execution uses that checkout's repo-harness dependencies, and
candidate verification may explicitly select the candidate package root.
Missing or mismatching runtime dependencies still fail closed with no target-repo
fallback. repo-harness captures the expected worktree snapshot. ArchContext
checks it and owns the result contract. repo-harness decodes each result with
the published `archctx-contracts` schema and invariants and keeps no local copy
of the wire contract. The exact archctx version pin is the compatibility check.

No hook runs architecture projection or records architecture drift. The pull
request is the update unit. When a change alters a capability's
responsibilities, entrypoints, relations or flows, the Agent uses the
`repo-harness-architecture` skill, writes the model change through an archctx
ChangeSet, and runs `repo-harness architecture-projection apply --json` in the
same branch. `check` and `plan` show the effect without writes. The projected
`docs/architecture/` files are committed with the change.

`apply` accepts a major change in the same call. When ArchContext returns an
unresolved-major signal, `apply` copies its reason codes and affected node ids
into `acceptedChange` and applies again. The Agent that runs `apply` owns the
decision; the pull request review is the human gate. If the provider response
of a committed accepted apply is lost, `apply` reads the committed result back
through `projection-apply-readback-v1` and does not apply twice. No local
candidate, receipt or approval store exists.

Managed install/update also verifies `daemon status --json` through the same
exact package-local CLI and compatible Node runtime after static capabilities.
A running daemon must prove RPC and product-version compatibility; upstream
`versionUnsupported` diagnostics (including a replaced entrypoint) fail the
strict installed-runtime verifier with an explicit user-authorization reminder.
Install/update reports daemon readiness as pending (`skipped`) separately from
verified package installation, retaining the candidate so a daemon mismatch
cannot trigger package rollback and strand newer hoisted dependencies.
An upstream `staleConnection:true` response is unhealthy, not cleanly stopped. A stopped daemon needs no
replacement and this check never starts it. Upstream status may recover stale
control files; the check never upgrades the daemon or creates/clears indexes.

Runtime failures with the typed `AC_RUNTIME_VERSION_UNSUPPORTED` code and
`upgrade-archctx-runtime` action preserve the reminder beyond the ordinary
300-character process-error preview, including projection/refactor callers.
The Agent presents the reported discrepancy and asks for user authorization
before running `daemon upgrade` through the same managed CLI and Node runtime.
Explain that replacing a shared daemon interrupts other clients. After authorized
replacement, verify daemon compatibility and inspect this repository's configured
CodeGraph index. Request authorization to rebuild only when its authoritative
status reports it missing or stale; verify readiness before retrying the blocked
operation. CLI upgrade alone does not prove that an index needs rebuilding.
Never delete the shared database or all repository indexes as recovery.
The runtime snapshot excludes `.ai/harness/**`, so concurrent harness receipts
and traces cannot invalidate a provider snapshot.

Managed host adapters give only `Stop.default` 150 seconds for its bounded
deferred work. Every other managed route remains at 30 seconds, and installer
refresh replaces only repo-harness-owned entries while preserving sibling user
hooks.

### `source.include` grammar

Upstream matches an include glob against the whole repo-relative path, so a
wildcard-free literal addresses one file, not a directory subtree. To keep the
two authorities from disagreeing about what a boundary covers, only two shapes
are accepted:

| Include | Capability prefix |
|---|---|
| `src/core/adoption/**` | `src/core/adoption` |
| `AGENTS.md` (wildcard-free, not an existing directory) | `AGENTS.md` |

Everything else fails closed. A wildcard-free literal that names an existing
directory is rejected as ambiguous with guidance to write `<dir>/**`.
`source.exclude` is not supported, because capability prefixes have no exclusion
form. Include order is preserved as prefix order.

### Required node fields

| Capability field | Node source | Rule |
|---|---|---|
| `domain` / `name` | `id` segments 2 and 3 | `id` must be exactly `capability.<domain>.<name>`, with no `namespace::` prefix |
| display `name` | `name` | required non-empty node/v2 field; validated but not translated into registry identity |
| `summary` | `summary` | required non-empty node/v2 field; validated but not translated into registry semantics |
| `responsibilities` | `responsibilities` | required non-empty string array; validated but not translated into registry semantics |
| `id` | derived | `<domain>-<name>` |
| `architecture_module` | derived | `docs/architecture/modules/<domain>/<name>.md` |
| `workstream_dir` | derived | `tasks/workstreams/<domain>/<name>` |
| `prefixes` | `source.include` | include grammar above |
| `contract_files` | `extensions.contractFiles.agents` / `.claude` | declared, never derived: root-facing capabilities deliberately do not follow their prefix |
| `lsp_profile` | `extensions.lspProfile` | required |
| `verification_hints` | `extensions.verification` | required array; explicit `[]` is allowed |

Nodes whose `kind` is not `capability`, or whose `status` is not `active`, are
skipped and claim no prefixes. Required node/v2 descriptive fields are validated
even when they are not translated. Optional fields this bridge does not consume —
`source.entrypoints`, `ownership`, `interfaces`,
`criticality`, `riskDomains`, `notes`, `parent` — are ignored rather than
translated into local semantics.

### Fail-closed conditions

Source-selection failures exit `2`:

| Condition | Behavior |
|---|---|
| unknown `capability_source` value | error naming the policy key and legal values |
| unreadable `.ai/harness/policy.json` | error naming the policy file |
| missing `.archcontext/model/nodes` under `archcontext` | error; never falls back to the JSON registry |
| subdirectory or non-`.yaml`/`.yml` entry in the model directory | error naming the entry |
| unparseable node YAML | error naming the node file |
| `Bun.YAML` unavailable | error with the Bun upgrade path |

Node-shape failures surface as `ARCHCONTEXT_*` registry diagnostics and make
`capability-resolver validate` exit `1` with no stdout; missing/empty node/v2
`name`, `summary`, or `responsibilities` is a structural error and never yields a
partial registry. Derived registries then go through the same
validation as the JSON registry, so duplicate ids, duplicate prefixes, and
invalid paths keep their existing diagnostic codes.

### Node/v2 export round-trip

`repo-harness run capability-resolver export --format archcontext-nodes-v2`
emits complete `archcontext.node/v2` capability nodes. Existing directory
prefixes become explicit `<dir>/**` selectors, while file prefixes remain exact.
The exported `extensions.contractFiles`, `lspProfile`, and `verification` fields
round-trip through the canonical node/v2 reader without deriving missing
semantics. The retired `archcontext-boundaries-v1` format is rejected.

## Manual Brain Vault Export

Long-lived external knowledge may be exported to a brain file vault only through
an explicit operator command:

```text
brain/<project>/*
```

For this repo, use:

```text
brain/repo-harness/*
```

The legacy repo-harness-skill and project-initializer paths have been fully
removed; no tooling recognizes, syncs, or cleans them up. Do not use them as
sync targets.

Keep runtime contracts, hooks, scripts, checks, evidence, and migration state in
the repo. The default brain stores reusable explanations, runbooks, decisions,
and patterns only.

Repo stubs that point to default brain pages are indexed in
`.ai/harness/brain-manifest.json`. Valuable repo-authored docs can opt into
one-way mirroring by adding a manifest entry with:

```json
{
  "id": "project-decision-log",
  "repo_path": "docs/decisions.md",
  "brain_path": "brain/<project>/decisions/project-decision-log.md",
  "sync": { "direction": "repo-to-brain" }
}
```

Hooks and workflow verification do not read, write, or gate on external vault
state. Operators can run these commands when they intentionally want to inspect
or export registered entries:

```bash
repo-harness run check-brain-manifest
repo-harness run sync-brain-docs --all
repo-harness run sync-brain-docs --check
```

## Proactive refactor recommendations

`~/.repo-harness/config.json#refactor_recommendations` contains `{ "enabled": true }`
by default. Global install/update initializes the setting once and preserves an
explicit disabled choice. Repositories do not need another enable switch.

At normal Stop, repo-harness scans for ArchContext structural observations when
a project model is present. The scan has at most thirty seconds of Stop's work
budget. When open suggestions exist, Stop prints one line with their count and
kinds. An unavailable provider prints nothing. Incomplete code facts print a
`proof_required` line that asks for `codegraph init`. The observer never creates
an index, a model, a plan or a code edit.

Review and decide with:

```bash
repo-harness refactor recommendations [--json]
repo-harness refactor decide <recommendation-id> accept|defer|reject --reason "<text>"
```

`recommendations` shows each open suggestion with its explanation, the metrics
of its observation and the statistics of every affected module (files, lines,
fan-in, fan-out, cycles, instability, direction violations, test files,
unresolved imports). `decide` records the scan in ArchContext when needed and
then stores the decision. Suggestions with a recorded decision are not shown
again. repo-harness keeps no local delivery state; ArchContext owns the
recommendation lifecycle. Execution of an accepted suggestion uses the normal
plan and pull request workflow.
