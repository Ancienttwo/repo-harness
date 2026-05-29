# External Tooling

Generated repos route external tooling by host/runtime shape. Task-level
skill routing lives in `docs/reference-configs/agentic-development-flow.md`.

- `gstack` supplies `office-hours`, `plan-eng-review`, and `plan-design-review`
- `Waza` supplies `/think`, `/hunt`, and `/check` for daily small/medium work
- Codex automation requires `health`, `check`, and `diagram-design` from `~/.codex/skills`
- `gbrain` supports knowledge capture, repo sync, and handoff retrieval
- `CodeGraph` is required agent readiness for code navigation and impact tracing

Waza is Codex-first in this contract. `~/.codex/skills` is the Codex runtime
source, while `~/.agents/skills` is only the skills CLI staging/cache path used
to receive upstream `tw93/Waza` updates before syncing verified copies into
Codex.

`repo-harness init` is allowed to bootstrap the workflow-owned runtime skills in
one pass: Waza (`check`, `design`, `health`, `hunt`, `learn`, `read`, `think`,
`write`) plus `diagram-design` for Codex and/or Claude, plus the bundled
cross-review skills `codex-review` (Claude host) and `claude-review` (Codex host).
It must not silently install unrelated toolchains.

The cross-review skills are **harness-owned and self-contained** — their source
lives in `assets/skills/<skill>/` and they wrap the peer CLI (`codex exec` /
`claude -p`) in a read-only sandbox with no gstack dependency, so installing them
is a workflow-owned runtime concern, not an unrelated toolchain. They install
host-aware: `codex-review` only into `~/.claude/skills` (a Claude session asking
Codex for an independent review) and `claude-review` only into `~/.codex/skills`
(a Codex session asking Claude). When gstack is present, its `/codex` and
`gstack-claude` skills are a more featureful superset; the harness skills are the
zero-dependency baseline that always ships with `init`.

The review scope is the current reviewable diff, not just committed branch
history: branch diff against the default base, staged changes, unstaged tracked
changes, and untracked files are all in scope. A timeout or missing peer CLI is
reported as unavailable review evidence, not as a pass.

The Codex automation profile is a runtime reference, not a vendored copy. It
requires Waza `health`, Waza `check`, and the standalone `diagram-design` skill
to exist under `~/.codex/skills`; the skill bodies stay owned by their original
installations.

## Detect Safely

Use `bash scripts/check-agent-tooling.sh` for a read-only tooling report.
Init and migration reports run the detector without update checks by default;
set `AGENTIC_DEV_CHECK_TOOLING_UPDATES=1` when that advisory pass should
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
npx -y skills add tw93/Waza -g -a claude-code codex -s check design health hunt learn read think write -y
```

Single host:

```bash
npx -y skills add tw93/Waza -g -a claude-code -s check design health hunt learn read think write -y
```

Replace `claude-code` with `codex` when installing for Codex only.

After installing or updating through the skills CLI, verify Codex has its own
runtime copy:

```bash
for d in check design health hunt learn read think write; do
  rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/
done
mkdir -p ~/.codex/rules
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cp ~/.agents/rules/$f ~/.codex/rules/$f
done
for d in check design health hunt learn read think write; do
  diff -qr ~/.agents/skills/$d ~/.codex/skills/$d
done
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cmp -s ~/.agents/rules/$f ~/.codex/rules/$f
done
```

### gbrain

```bash
bun add -g gbrain
```

### CodeGraph

`CodeGraph` is required readiness for agent code navigation. It speeds up
Codex and Claude exploration for indexed TypeScript and other supported languages, but it
does not replace `.ai/context/capabilities.json`, workflow checks, tests,
architecture drift events, or shell-script review.

This self-host repo vendors CodeGraph as a dev dependency so `bun install`
materializes `node_modules/.bin/codegraph` and `scripts/ensure-codegraph.sh`
can manage the local index. Generated downstream repos keep the global MCP
installer default unless their local policy explicitly opts into vendoring.

Read-only check:

```bash
bash scripts/ensure-codegraph.sh --check --json
```

Local index mutation:

```bash
bash scripts/ensure-codegraph.sh --init
bash scripts/ensure-codegraph.sh --sync
```

Do not ask users to copy MCP TOML or Claude JSON by hand. The user-facing path
is one terminal command, or explicit authorization for their agent to run the
same command:

```bash
npm install -g @colbymchenry/codegraph && mkdir -p ~/.local/bin && ln -sfn "$(npm config get prefix)/bin/codegraph" ~/.local/bin/codegraph && PATH="$HOME/.local/bin:$PATH" repo-harness tools configure codegraph --target codex --location global
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
for d in check design health hunt learn read think write; do
  rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/
done
mkdir -p ~/.codex/rules
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cp ~/.agents/rules/$f ~/.codex/rules/$f
done
for d in check design health hunt learn read think write; do
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
npm install -g @colbymchenry/codegraph@latest && mkdir -p ~/.local/bin && ln -sfn "$(npm config get prefix)/bin/codegraph" ~/.local/bin/codegraph && PATH="$HOME/.local/bin:$PATH" codegraph sync . && PATH="$HOME/.local/bin:$PATH" codegraph status .
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
icloud/brain/<project>/*
```

For this repo, use:

```text
icloud/brain/repo-harness/*
```

`icloud/brain/repo-harness-skill/*` and `icloud/brain/project-initializer/*`
are legacy alias paths and should remain as redirects/indexes during the
compatibility window.

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
  "brain_path": "icloud/brain/<project>/decisions/project-decision-log.md",
  "gbrain_slug": "decisions/project-decision-log",
  "sync": { "direction": "repo-to-brain" }
}
```

After that, PostEdit hooks sync only that source file. Manual sync and drift
checks are also available:

```bash
bash scripts/check-brain-manifest.sh
bash scripts/sync-brain-docs.sh --all
bash scripts/sync-brain-docs.sh --check
```

## Why gbrain MCP Stays Off by Default

- `gbrain` is useful even when only the CLI is healthy.
- Local MCP endpoints are more failure-prone than the CLI health path.
- The policy keeps `gbrain` as a candidate MCP entry, not a required runtime dependency.
- Re-enable MCP only after the local host config is explicitly updated and `gbrain doctor --json` is healthy enough for your workflow.
