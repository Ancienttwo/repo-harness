# Install State and Plugin Selection

`repo-harness install` is the host-runtime authority. It installs core and a
selection of plugins, and records both in `~/.repo-harness/install-state.json`
(install state protocol 3). Core is always installed. A plugin is installed
only when the selection includes it.

## Core and Plugins

`src/core/skill-surface/plugin-manifest.ts` owns the plugin ids. Each skill
package in `assets/skill-commands/manifest.json` names one `owner`: `core` or a
plugin id. The installer maps the other surfaces through
`ownerForInstallPath`.

| Owner | Surfaces |
|---|---|
| `core` | The CLI, the Claude and Codex hook adapters with every hook route, the agent fleet files, the root router `repo-harness`, `repo-harness-check`, `repo-harness-test`, `repo-harness-issue-flow`, `repo-harness-ship`, the Herdr skill, Waza (`think`, `hunt`, `check`, `health` and the Waza rules files), and Mermaid. `repo-harness-setup`, `merge-gate`, `herdr` and `reverse-skill-router` are explicit-only. |
| `architecture` | `repo-harness-architecture`, `repo-harness-archimap`, and the CodeGraph CLI and MCP projection. |
| `cross-review` | `repo-harness-cross-review`. |
| `peer-runtime` | `repo-harness-herdr-portal` (Claude host only). |
| `pi` | The Pi package registration and the Pi skill root (`~/.pi/agent/skills/`), for `--target both` only. |
| `platform` | `windows-python-first`. |
| `product` | `repo-harness-product`. |
| `strategy-memory` | `obsidian-memory`, `repo-harness-strategy`, the explicit-only companions `obsidian-markdown` and `obsidian-cli`, and the brain root. |

Every hook route is core. `src/cli/hook/route-registry.ts` is the authority:
Claude gets six routes and Codex gets five. Cross-review skills sync when the
selection includes `cross-review` or `peer-runtime`. The brain root is
configured when the selection includes `strategy-memory` or the command has
`--brain-root`.

A plugin is unavailable on this host in three cases:

- Its host program is absent. `pi` is a host plugin, and repo-harness does
  not install its host program. The program is absent when `pi` is not on
  `PATH`. Any other read error fails closed.
- The target has no host for its skills: none of the plugin's owned skills
  lists a host in `--target`. For example, `peer-runtime` with
  `--target codex` gives `--target codex has no host for its skills`.
- `pi` with `--target claude` or `--target codex` gives
  `--target <target> does not include the Pi host`.

`windows-python-first` is a package-owned toolbox Skill for native Windows file
and text operations. It prefers Python with explicit encoding and keeps simple
shell commands. It does not apply Windows shell rules to macOS, Linux, or WSL.
It installs the Skill only. It does not install Python or change PowerShell
settings.

## Selection

| Command | Recorded `selection` | Installed plugins |
|---|---|---|
| `repo-harness install` | `"all"` | Every plugin that the host can run. |
| `repo-harness install --plugins <ids>` | the sorted list, for example `["platform","product"]` | Exactly the listed ids. |
| `repo-harness install --no-plugins` | `[]` | None (core only). |

With no flag, `install` skips each unavailable plugin and prints one line for
it. A missing host program gives:

```text
[plugins] skipped pi: pi is not on PATH; to add it later, install the host program, then run: repo-harness update
```

A target without the host gives:

```text
[plugins] skipped peer-runtime: --target codex has no host for its skills; to add it later, run: repo-harness install --target both
```

`--plugins <ids>` takes a comma-separated list of known ids. An unknown id
fails with `install_plugin_unknown`. An unavailable plugin in an explicit list
fails closed with `install_plugin_unavailable` before any write. `--plugins`
and `--no-plugins` cannot be combined with `--state`, `--rollback` or
`--location`.

A selection change removes only package-owned surfaces of the dropped plugins.
Unknown or changed canonical or facade directories fail closed before any
write. User content is kept.

Inspect and restore:

```bash
repo-harness install --dry-run --json   # the plan: requested and current plugins, install, keep, remove, skipped, selection
repo-harness install --state --json     # the recorded state with its probes and drift status
repo-harness install --rollback         # restore the previous state and its selection
```

The dry-run text starts with `[plugins] selection=<all|ids|(core only)>`.
`repo-harness status` prints the same value in its `Install state:` section as
`selection: ...`, beside `core:` and `plugins:`.

`--rollback` restores the previous plugin set and its `selection`, and records
`previous: null`, so a second rollback has nothing to restore. It first
projects the previous state's managed Skills and host routes. It commits the
restored state only when that runtime transaction passes and every owner
probe finds its surfaces. Otherwise it fails with
`rollback projection is incomplete: missing=<owner>(<checks>); surface_drift=<paths>`,
which names each missing owner.

## Update

`repo-harness update` takes no selection. It reads the recorded selection.

- `"all"`: update installs every plugin that this version ships and that
  the host can run. A plugin that is new in this version is added. A host
  plugin is added when its host program is now present. An unavailable plugin
  that the state does not record gets a skip line.
- An explicit list never grows. An unavailable plugin in the list fails closed
  with `install_plugin_unavailable`.
- Under `"all"`, a recorded plugin that becomes unavailable (its host program
  disappears, or the target has no host for it) stays in the record. Update
  does not run its setup and prints:

  ```text
  [plugins] kept pi: pi is not on PATH; update keeps the recorded plugin; to remove it, run: repo-harness install --plugins <the other plugins>
  ```

  Only an explicit selection or `uninstall` removes a plugin.
- A partial refresh (`update --no-sync-skill` or `update --no-hooks`) never
  grows the set. It records only the recorded plugins and prints, for each
  plugin that a full update would add:

  ```text
  [plugins] not added <id> in a partial refresh; run: repo-harness update
  ```

When the set to record changes, update commits a new state, with the old
state as `previous`, under the same install transaction. A failure restores
every byte. An install or update that changes nothing writes nothing: the
state bytes and `previous` stay, so `--rollback` still restores the last real
change.

With no install state, update fails before any write with
`install_state_missing`. Run `repo-harness install` first. Adapter-only
`install --location` validates any recorded state before it writes. It does
not change the selection.

CodeGraph follows the `architecture` plugin. `--no-codegraph` is the opt-out.
A repository whose `.ai/harness/policy.json` sets
`tooling.codegraph.enabled: true` while the selection has no `architecture`
fails with `install_plugin_unavailable`, and the error names the install
command that adds `architecture`. `--with-obsidian-skills` needs
`strategy-memory`.

Update also reconciles the installed runtime dependency closure. It requires
exact package-local `archctx` and `archctx-contracts` versions, ArchContext's
exact package-local CodeGraph dependency, Node `>=22.22 <26`, and a successful
`archctx capabilities --json` handshake. With `architecture`, update refreshes
the exact global CodeGraph CLI and MCP. Waza and Mermaid are mutable
third-party providers: `install` fetches them by default
(`--no-external-skills` opts out), and `update` refreshes them only with
`--with-external-skills`.

The installed candidate verifies its own dependency and daemon contracts before
it writes host surfaces. The parent owns the transaction and restores the prior
CLI and host state when candidate verification fails. Registry installs ignore
Bun's manifest cache. Package channels resolve to an exact version first.

The candidate request is protocol 2 and has no `profile` field. A candidate
refuses a protocol 1 request from an older parent before any write with
`candidate_request_protocol_retired`, and prints the bootstrap
`bun add -g repo-harness@<version> --no-cache && repo-harness update`. An old
parent re-reads the install state after the candidate returns and cannot read
protocol 3, so the cutover cannot run under it.

The published 0.21.2 updater checks new dependencies in the old process and
rejects the 0.22.x renderer. Bootstrap once with a direct install, then run the
installed CLI:

```bash
bun add -g repo-harness@latest --no-cache
repo-harness update
```

## Explicit-Only Skills

`reverse-skill-router` is a recommended but explicit-only dependency. Its
upstream pack tells agents to treat a mentioned target as authorized, which is
not a valid repo-harness authority boundary. No selection installs it. Install
it only after independent scope review with
`repo-harness install --with-reverse-skill` or
`repo-harness update --with-reverse-skill`. The install copies the router pack;
its optional security toolchains stay on demand. The catalog pins upstream
commit `539899ddc7608d63dc66e08e794d572e080f1a55` and verifies the selected
tree's SHA-256 before any host projection.

`obsidian-memory` declares `obsidian-markdown` and `obsidian-cli` as hard
companion Skill dependencies. Both upstream Skills are explicit-only, and an
ordinary install does not download them. With `strategy-memory` selected,
install or verify the bundle with:

```bash
repo-harness install --with-obsidian-skills
repo-harness update --with-obsidian-skills
```

The catalog pins both subtrees from
`kepano/obsidian-skills#a1dc48e68138490d522c04cbf5822214c6eb1202`
and verifies a separate full-tree SHA-256 before it projects either Skill. A
successful install records the staging directories and host links in the
install transaction. Later drift is managed drift, and a later transaction
failure restores all affected surfaces. This option installs Skills only. It
does not install or require the `obsidian` executable, the Obsidian desktop
App, or an npm Obsidian runtime. `brainRoot` stays optional, and hooks, CI,
workflow checks and releases do not read or write a vault.

## Global Working Rules

`install` and `update` refresh the managed Global Working Rules block in
`~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md`. The block records its
reporting language, so later runs need no input. Repo-harness rules are
replaced: the managed block and any unmarked `# Global Working Rules` copy with
the sections that repo-harness shipped. All other sections are user rules and
stay unchanged. A file without a recorded language needs the language once:

```bash
repo-harness update --report-language zh-CN   # or follow, en
```

Without it, the run continues. The file is not written, and the rules step
reports it as `skipped` with this command. An older CLI that updates to this
version has no flag, so the first update reports the file; the next
`repo-harness update --report-language <follow|zh-CN|en>` refreshes it. A file
with unbalanced markers, a symlink, or a file that is not a regular file is
also skipped with the next action. A file without rules is written only when
the flag is given. The files are part of the install transaction backup.
`repo-harness update --check` reports `ok` only when the block matches the
current template.

## State File

```json
{
  "protocol": 3,
  "core": { "version": "0.25.4" },
  "plugins": [{ "id": "architecture", "version": "0.25.4" }],
  "selection": "all",
  "transaction_id": "…",
  "applied_at": "…",
  "ownership_manifest": [
    { "owner": "core", "path": "…", "type": "managed-file", "authority": "repo-harness-install-transaction",
      "removal": "managed-surfaces-only", "content_hash": "…", "managed_marker": "…", "symlink_target": null }
  ],
  "previous": null
}
```

The reader is strict. `plugins` holds the enabled plugins only, sorted and
unique. Each plugin version equals the core version. `selection` is required:
`"all"`, or a sorted list that equals the `plugins` ids. Each ledger entry has
exactly one `owner`, which is `core` or an enabled plugin. Any other shape
fails with `install_state_invalid` or `install_state_invalid_ownership`.

Each ledger entry records a real managed surface: its absolute path, surface
type, content hash, managed marker, and symlink target where relevant. For a
shared host config file, the hash covers only the repo-harness-owned hook
entries, so user sibling settings can change without false drift. `--state`
verifies those host surfaces. A selection change and a rollback remove or
rewrite only repo-harness-managed routes, exact package copies and
package-owned links. Pre-existing or changed external Skills stay untouched.
Repository changes stay under the adoption transaction and Git rollback.
Secrets and provider state are never included.

The host-runtime transaction snapshots the install state and the external
Skills registry before any write. The registry path follows the Skills CLI
rule: `$XDG_STATE_HOME/skills/.skill-lock.json` when `XDG_STATE_HOME` is set,
else `~/.agents/.skill-lock.json`. A failed owner probe, route projection or
state commit restores every touched managed path and both metadata files.
Staging discovery and host discovery are separate: a Skill only under
`.agents/skills` does not satisfy a Codex or Claude host probe, and a host
Skill must resolve to the selected staging entry. A selection change removes a
registry entry only when this transaction owns the staging surface.

CodeGraph configuration is a projected host-config surface with its
owned-entry hash, owned by `architecture`. Reinstall refreshes that ownership
only when the entry is new or already package-owned. An unrelated
pre-existing MCP entry is never package-owned. A selection that drops
`architecture` removes only the owned CodeGraph entries from
`~/.codex/config.toml`, `~/.claude.json` and `~/.claude/settings.json`; the
rest of each file stays. The ledger never records a shared config file as a
whole file.

Install and benchmark transactions must bind `BUN_INSTALL` to the selected
host home. `HOME` alone does not isolate the Bun global install when the
caller exports `BUN_INSTALL`; the inherited path changes the operator's real
global package.

## Typed Errors

| Code | Cause | Next step |
|---|---|---|
| `install_state_missing` | `update` found no install state. | `repo-harness install` |
| `install_state_migration_required` | A reader other than `update` found protocol 2. | `repo-harness update` |
| `install_state_protocol_retired` | The state is protocol 1. | The 0.25.3 bridge (see below). |
| `install_state_invalid` | Malformed state, unknown plugin id, wrong version, or invalid `selection`. | `repo-harness install --state` |
| `install_state_invalid_ownership` | A ledger entry has an unknown path, a malformed shape, or an owner that is not enabled. | `repo-harness install --state` |
| `install_plugin_unknown` | `--plugins` names an unknown id. | Use an id from the table above. |
| `install_plugin_unavailable` | An explicit plugin is unavailable (no host program, or no host for its skills in the target), a CodeGraph policy without `architecture`, or a minimal protocol 2 state with a Pi package and no `pi`. | Install the host program, choose a target with its host, or drop the plugin. |
| `candidate_request_protocol_retired` | An older parent sent a protocol 1 candidate request. | `bun add -g repo-harness@<version> --no-cache && repo-harness update` |

## Protocol 2 to 3 Migration

The protocol 2 to 3 migration is a one-shot step in `repo-harness update`. It
is the only reader of protocol 2. Issue #1607 deletes it in the 0.26.0 release;
after that, protocol 2 gets `install_state_protocol_retired`, which names the
0.25.x bridge.

A 0.25.3 CLI cannot run the cutover. Bootstrap the new CLI directly:

```bash
bun add -g repo-harness@0.25.4 --no-cache
repo-harness update
```

`repo-harness update --check` prints the mapping and writes nothing. The
migration runs under the global runtime lock and inside the host transaction.
It validates the protocol 2 state, its previous state and the user-managed
fleet receipt before any host change. It commits protocol 3 by atomic rename
with `previous: null`. When the refresh in the same update changes the state,
it records the migrated state as `previous`; a refresh that changes nothing
leaves `previous: null`. A later failure restores the protocol 2 file and every
deleted byte.

| Protocol 2 profile | Protocol 3 selection |
|---|---|
| `full` | `"all"`: every plugin, and `pi` only when `pi` is on `PATH`. |
| `minimal` | The explicit list `platform`, `strategy-memory`, plus the owners of the recorded ledger surfaces. |

Each ledger entry gets its owner from its path through the protocol 3 manifest:

- A Pi package registration (`pi-package`) adds `pi`.
- A CodeGraph projection adds `architecture`, so a former minimal install
  with a CodeGraph surface also gains the architecture skills.
- A herdr-portal skill adds `peer-runtime`.
- An entry with an empty component list gets `core`.

A `minimal` state that records a Pi package maps to an explicit list with
`pi`. When `pi` is not on `PATH`, the migration refuses before any write with
`install_plugin_unavailable`. The message names two ways out: install Pi, then
run `repo-harness update`; or roll back to 0.25.3 (see below). A `full` state
never refuses for this reason, because `"all"` skips an absent `pi`.

Pi skill-root copies do not add `pi`. When `pi` is not selected, the migration
deletes each owned, unchanged Pi skill-root copy, keeps and reports each
changed one, and drops them from the ledger. A `--target both` install without
Pi loses these unused copies. Install Pi and run `repo-harness update` to
bring them back, because a migrated `full` state records `"all"`.

The migration also removes the retired orchestrator fleet file
`~/.claude/agents/orchestrator.md`. It deletes an owned, unchanged file. It
keeps and reports a changed file. It drops the file from the state and from
the user-managed fleet receipt. A former minimal install gains the core
surfaces: the core facades, the agent fleet files, the
`PreToolUse.subagent` (Claude) and `SubagentStart.context` (Codex) routes, and
Waza and Mermaid at the next `repo-harness install`. The plan lists each one.

A protocol 1 state fails with `install_state_protocol_retired`. Migrate it with
the 0.25.3 bridge first: `bun add -g repo-harness@0.25.3 --no-cache`, run its
protocol 1 migration, then run the bootstrap above.

### Rollback and Downgrade

A source `git revert` does not restore a user's ledger. To go back to 0.25.3
after a committed migration:

1. `bun add -g repo-harness@0.25.3 --no-cache`
2. Delete `~/.repo-harness/install-state.json`.
3. Run the 0.25.3 install command with the old profile name. `docs/CHANGELOG.md`
   (`[Unreleased]`, Upgrade) gives the exact command.

The fleet and CodeGraph files stay as user-managed files.

## Install Surfaces and Refresh Commands

`repo-harness install` is the first-run global bootstrap. It installs the
current npm package as the global CLI, refreshes repo-harness Skill aliases,
installs the user-level hook adapters, and records the plugin selection. It
never applies repo-local workflow files to the current directory; that stays
on `repo-harness init`.

```bash
# Refresh the user-level CLI and runtime pieces after a package update.
repo-harness update

# Read-only repair guidance, no writes.
repo-harness update --check

# Preview and remove owned user configuration; preserve user edits and history.
repo-harness uninstall --dry-run
repo-harness uninstall

# Install only the host hook adapters (adapter-only surface).
repo-harness install --target both --location global

# Refresh repo-local workflow files in an adopted repository.
repo-harness init --repo /path/to/repo
```

## Read-Only Bootstrap Audit

`repo-harness setup check --json` is the Agent-owned, read-only bootstrap audit;
add `--check-updates` for version and adopted-repo refresh advisories. It is not
a runtime hook: it does not write user-level files, install updates, run `init`,
or register adapters. It emits `agent_actions` entries carrying the reason, risk,
target files, an optional command, and the verification surface, so the Agent
executes each one deliberately. A protocol 2 state gives the action
`install-state.migrate` with the command `repo-harness update`; an unreadable
state gives `install-state.repair`. `repo-harness init-hook` remains a
compatibility alias for the adapter-only install path.

## Codex Delegation Authority

Adapter installation has no delegation-mode prompt or config write. Codex fleet
delegation is explicit. Authorization comes from the current user turn,
applicable `AGENTS.md`, or an explicitly invoked skill. No hook answers
`/delegate` or `/parallel`. Hook prompt classification and SessionStart
standing authorization are not authorities.

At runtime, Codex uses native `spawn_agent` with the exact installed
`agent_type` and `fork_turns="none"`. Missing or mismatched native role/model
evidence fails closed without an App-thread, `codex-exec`, or main-thread fleet
fallback. Existing `delegation.mode` keys in user config are inert because the
runtime no longer reads them; no compatibility parser or migration shim is kept.
