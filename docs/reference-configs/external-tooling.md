# External Tooling

Generated repos route external tooling by host/runtime shape. Task-level
skill routing lives in `docs/reference-configs/agentic-development-flow.md`.

- `gstack` supplies `office-hours`, `plan-eng-review`, and `plan-design-review`
- `Waza` supplies `/think`, `/hunt`, and `/check` for daily small/medium work
- Codex automation requires `health`, `check`, and `mermaid` from `~/.codex/skills`
- `gbrain` supports knowledge capture, repo sync, and handoff retrieval
- `CodeGraph` is required agent readiness for code navigation and impact tracing

Waza is Codex-first in this contract. `~/.codex/skills` is the Codex runtime
source, while `~/.agents/skills` is only the skills CLI staging/cache path used
to receive upstream `tw93/Waza` updates before syncing verified copies into
Codex.

`repo-harness install` is allowed to bootstrap the workflow-owned global runtime
in one pass: the `repo-harness` CLI, repo-harness runtime aliases, user-level
Codex/Claude hook adapters, Waza (`think`, `hunt`, `check`, `health`), brain
root persistence, Mermaid, and CodeGraph CLI/MCP configuration.
`repo-harness init` remains a compatibility alias for existing automation. The
bootstrap path must not silently install unrelated toolchains or Claude
marketplace plugins.

`repo-harness uninstall` removes repo-harness managed Codex/Claude hook
adapters. It intentionally does not uninstall Waza, Mermaid, CodeGraph, gbrain,
brain config, package-manager globals, or user-authored sibling hook entries.

`repo-harness update` refreshes only the CLI and repo-harness-owned user-level
runtime by default. Third-party tooling and CodeGraph registration stay
readiness findings from `repo-harness setup check` unless the update command is
run with an explicit opt-in such as `--with-external-skills` or
`--configure-codegraph`.

The cross-review skills are **harness-owned and self-contained** — their source
lives in `assets/skills/<skill>/` and they wrap the peer CLI (`codex exec` /
`claude -p`) in a read-only sandbox with no gstack dependency, so installing them
is a workflow-owned runtime concern, not an unrelated toolchain. They install
host-aware during `repo-harness install`/`init` and explicit external-skill refreshes:
`codex-review` only into `~/.claude/skills` (a Claude session asking
Codex for an independent review) and `claude-review` only into `~/.codex/skills`
(a Codex session asking Claude). When gstack is present, its `/codex` and
`gstack-claude` skills are a more featureful superset; the harness skills are the
zero-dependency baseline that always ships with `init` and the peer acceptance
gate surface for `## External Acceptance Advice`.

The review scope is the current reviewable diff, not just committed branch
history: branch diff against the default base, staged changes, unstaged tracked
changes, and untracked files are all in scope. A timeout or missing peer CLI is
reported as unavailable review evidence, not as a pass.

The Codex automation profile is a runtime reference, not a vendored copy. It
requires Waza `health`, Waza `check`, and the standalone `mermaid` skill to
exist under `~/.codex/skills`; the skill bodies stay owned by their original
installations.

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

- `gstack setup`
- `npx skills check`
- `npx skills update`
- `gbrain serve`
- `gbrain sync`
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

### gstack

Claude Code:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup
```

Codex:

```bash
test -d ~/.claude/skills/gstack || git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --host codex
```

### Waza

Both hosts:

```bash
npx -y skills add tw93/Waza -g -a claude-code codex -s think hunt check health -y
```

Single host:

```bash
npx -y skills add tw93/Waza -g -a claude-code -s think hunt check health -y
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

### gbrain

```bash
bun install -g github:garrytan/gbrain
```

Do not install npm registry `gbrain`; that package is unrelated to the GBrain
CLI and does not ship the repo-harness advisory command.

`gbrain` is optional advisory tooling for knowledge sync and retrieval. `setup
check` may report its local state, but missing or stale `gbrain` must not
create Agent repair/update actions or change the setup readiness result.

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
execution base as separate `runtime.*` checks. Keep the boundary explicit:

| Capability | Owner | Required for |
|---|---|---|
| `bun` | repo-harness | repo-harness-owned global installs, local dependency install, tests, and runtime execution |
| `bash` | repo-harness | helper scripts, migration, setup checks, and contract verification wrappers |
| `npm` | npm registry | registry readbacks, publish gates, and opt-in update checks; not repo-harness-owned global install repair |
| `npx` / `skills_cli` | external Skills CLI | Waza and Mermaid skill bootstrap/update commands |
| `rsync` | platform filesystem | Waza staging-to-Codex sync and installed-copy runtime mirroring |
| `symlink` | platform filesystem | link-mode aliases; copy mode is the fallback |

The policy is Bun-first, not Bun-only. Repo-harness-owned install/repair commands
use `bun add -g` or `bun install`. Waza/Mermaid remain explicit external Skills
CLI dependencies until a separate plan replaces that integration. Missing
optional capabilities should degrade the named feature, not blur command
ownership.

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
    "version": "1.5.0"
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

### gstack

Claude Code:

```bash
cd ~/.claude/skills/gstack && git pull && ./setup
```

Codex:

```bash
cd ~/.claude/skills/gstack && git pull && ./setup --host codex
```

### Waza

```bash
npx -y skills update
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

### gbrain

```bash
gbrain check-update --json
gbrain upgrade
```

### CodeGraph

```bash
bun add -g @colbymchenry/codegraph@latest && codegraph sync . && codegraph status .
```

## Manual Knowledge Sync

`gbrain` stays advisory-first in this contract. Manual repo sync is allowed:

```bash
gbrain sync --repo <path>
```

## Default Brain Vault

Long-lived external knowledge should land in the default brain file vault before
or alongside `gbrain` import:

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
  "gbrain_slug": "decisions/project-decision-log",
  "sync": { "direction": "repo-to-brain" }
}
```

After that, PostEdit hooks sync only that source file. Manual sync and drift
checks are also available:

```bash
repo-harness run check-brain-manifest
repo-harness run sync-brain-docs --all
repo-harness run sync-brain-docs --check
```

## Why gbrain MCP Stays Off by Default

- `gbrain` is useful even when only the CLI is healthy.
- Missing `gbrain` CLI is not a setup dependency failure.
- Local MCP endpoints are more failure-prone than the CLI health path.
- The policy keeps `gbrain` as a candidate MCP entry, not a required runtime dependency.
- Re-enable MCP only after the local host config is explicitly updated and `gbrain doctor --json` is healthy enough for your workflow.
