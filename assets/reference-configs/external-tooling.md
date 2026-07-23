# External Tooling

Generated repos route external tooling by host/runtime shape. Task-level
skill routing lives in `docs/reference-configs/agentic-development-flow.md`.

- `Waza` supplies `/think`, `/hunt`, and `/check` for daily small/medium work
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
marketplace plugins.

`repo-harness uninstall` removes repo-harness managed Codex/Claude hook
adapters. It intentionally does not uninstall Waza, Mermaid, CodeGraph,
brain config, package-manager globals, or user-authored sibling hook entries.

`repo-harness update` refreshes only the CLI and repo-harness-owned user-level
runtime by default. Third-party tooling and CodeGraph registration stay
readiness findings from `repo-harness setup check` unless the update command is
run with an explicit opt-in such as `--with-external-skills` or
`--configure-codegraph`. Repo-local workflow refresh stays on
`repo-harness adopt`; `setup check --check-updates` reports an Agent action when
the current adopted repo's dry-run adoption plan has pending operations.

The cross-review skill is **harness-owned and self-contained** — its source
lives in `assets/skills/repo-harness-cross-review/` and it wraps the peer CLI
(`codex exec` / `claude -p`) in a read-only sandbox with no external
planning-provider runtime, so installing it is a workflow-owned runtime
concern, not an unrelated toolchain. `repo-harness-cross-review` installs
host-aware during `repo-harness install`/`init` and explicit external-skill
refreshes: it installs into **both** `~/.claude/skills` (a Claude session
asking Codex for an independent review, via its Codex provider mode) and
`~/.codex/skills` (a Codex session asking Claude for a review, via its Claude
provider mode) for the strict profile. `claude-plan` installs only into
`~/.codex/skills` (a Codex session using Claude's headless plan mode for a
plan consult on a mid-execution design fork) and is unaffected by this
package's host-aware installation. The harness skills are the self-contained
baseline that always ships with `init` and the peer acceptance gate surface for
the typed `AcceptanceReceipt`; its review section is projection only.

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
refresh as `repo.adopt-refresh` when the current repo has opted in. Keep the
boundary explicit:

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
bun add -g @colbymchenry/codegraph@latest && codegraph sync . && codegraph status .
```

## Agent Fleet

`agent_fleet` is a repo-harness-owned package surface declared in
`.ai/harness/policy.json` under `external_tooling.agent_fleet` and detected by
`check-agent-tooling.sh`. The single authored source is
`package:agents/fleet`; it ships inside the npm package and never requires a
network fetch. The managed list is `explorer`, `deep-reasoner`, `fast-worker`,
`gatekeeper`, `root-cause-prover`, and `harness-evaluator`.

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
| `opus` | `gpt-5.6-sol` | `low`, `medium`, `high`, `xhigh`, `max` | same string, unchanged |
| `sonnet`, `haiku` | `gpt-5.6-luna` | `low`, `medium`, `high`, `xhigh`, `max` | same string, unchanged |

`fast-worker`, `root-cause-prover`, and `harness-evaluator` receive
`sandbox_mode = "workspace-write"`; every other role receives
`sandbox_mode = "read-only"`. Current assignments are explorer
(`sonnet/high`), deep-reasoner (`opus/max`), fast-worker (`sonnet/max`),
gatekeeper (`opus/high`), root-cause-prover (`opus/high`), and
harness-evaluator (`opus/high`). Root-cause-prover's prompt further limits
writes to bugfix evidence inside the active contract's allowed paths;
harness-evaluator runs existing skill/adoption surfaces only when both repo and
HOME pass the runner's disposable boundary: skills uses `--require-disposable`,
while adoption uses one `--run-adoption-profile` invocation that injects the
validated repo/HOME into inspector and adopt dry-run. Guarded skills overrides
the ordinary sibling workspace default with a repo-internal workspace, and both
profiles scrub inherited repo-harness source/helper overrides. The guard rejects source
checkout and real HOME in either argument position; the role returns BLOCKED
when the guard fails and must not access the independent `evals/bdd2/**` authority. There is no
Terra route and no implicit effort remap.

The Codex generator also rewrites the exact upstream provider label in the
description (for example, `Opus at max effort` or `Sonnet at high effort`) to the
mapped GPT-5.6 model and reasoning level. A missing label fails closed so the
installed metadata cannot claim a different model from the TOML settings.

These files define the desired installed role configuration. They do not by
themselves prove that every native MultiAgentV2 spawn surface selects a named
role instead of inheriting the parent model; keep runtime selection claims
behind a real subagent canary.

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
the protected ship/gate helpers. The official runner also pins Bash, Git, Bun,
and `gh` to installed host executables and replaces caller `PATH` with the
minimal host runtime path. The host state directories, AcceptanceReceipt, and
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

- `UserPromptSubmit.delegation` initializes
  `.ai/harness/delegation/latest.json` with
  `native_role_routing.status = "unverified"` and a repo-scoped evidence
  directory for that delegation.
- `SubagentStart.context` consumes Codex's official `agent_type` and `model`
  fields plus `turn_id` and `agent_id`. It enumerates project custom-agent TOML
  files first, then user files, parses them with `Bun.TOML.parse`, selects by
  the schema-authoritative `name`, and writes one atomic observation per child
  without reading Codex transcripts. The filename is only a convention; an
  unrelated valid profile may inherit its model, while the selected profile
  must pin one before repo-harness can verify model routing.
- `check-agent-tooling.sh` deterministically aggregates every child observation
  in the current delegation. An empty current delegation retains the latest
  completed canary instead of erasing negative evidence. Each verified or
  mismatched observation carries the selected TOML SHA-256, so later config
  drift invalidates stale evidence. `--strict-readiness`
  fails after `unavailable`, `mismatch`, `invalid`, or structurally malformed
  evidence; only a genuinely absent canary remains advisory `unverified`.

SubagentStart does not expose `model_reasoning_effort`, so repo-harness never
claims that per-role reasoning effort is verified from this gate.

`developer_instructions` is the packaged `.md` body plus the canonical
EXECUTION_BOUNDARY anti-extras clause, kept byte-identical to the
`EXECUTION_BOUNDARY` constant in `scripts/contract-run.ts` so every generated
Codex agent carries the same boundary as the Claude worker prompts, the MCP
`codex-goal` path, and the Codex delegation advisor hook.

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

The installer requires Bun >= 1.1.35, matching repo-harness's package runtime
contract and the first supported `Bun.TOML.parse` behavior for the generated
multiline agent files.
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
untouched. Pass `--force` to overwrite drifted files. Re-running with no
packaged-source changes reports every file as `up-to-date`.

### Readiness

`repo-harness run check-agent-tooling --host both --strict-readiness` reports
`agent_fleet` alongside `codegraph`. With `--check-updates`, it compares each
installed Claude-side `.md` against the packaged source hash and reports
`drift`/`synced` per agent without network access. The Codex `.toml` side is a
generated artifact and is checked for presence; installer golden tests prove
the deterministic generation.

### Uninstall

There is no uninstall command. Removing the fleet means deleting the eight
managed files by hand:

```text
~/.claude/agents/explorer.md
~/.claude/agents/deep-reasoner.md
~/.claude/agents/fast-worker.md
~/.claude/agents/gatekeeper.md
~/.codex/agents/explorer.toml
~/.codex/agents/deep-reasoner.toml
~/.codex/agents/fast-worker.toml
~/.codex/agents/gatekeeper.toml
```

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
