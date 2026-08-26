# Install Profiles

`repo-harness install --profile <profile>` is the host-runtime authority. The
closed vocabulary is exactly `minimal|full`, and omitting `--profile` selects
`full`. `--dry-run --json` lists components to install, skip, and remove.
`--state --json` reads `~/.repo-harness/install-state.json` together with drift
status; `--rollback` first reprojects the previous protocol-2 profile's managed
Skills and host routes, then commits the restored state only if that runtime
transaction passes.

| Profile | Codex hooks | Components and discovery |
|---|---:|---|
| `minimal` | 7 | CLI, effective state, scope/worktree/check guards, handoff, adaptive workflow, conditional CodeGraph support, host adapters, root router, `repo-harness-plan`, `repo-harness-check`, and the repo-owned `obsidian-memory` facade |
| `full` | 11 | Everything in minimal plus PRD/Sprint/Goal planning integrations, agent fleet, verifier, cross-model acceptance, release/deployment gates, `repo-harness-product`, `repo-harness-ship`, host-aware `repo-harness-cross-review`, Codex-side `claude-plan`, Waza, and Mermaid |

Fresh global installs and adapter-only installs both default to `full`.
`minimal` is the explicit bounded choice; there is no 5-hook profile.
Profile switching removes only package-owned surfaces. Unknown or modified
canonical/facade directories fail closed before mutation; user-authored
content is preserved. ChatGPT remains an explicit setup surface and is not
implied by either profile.

`repo-harness update` reads the recorded protocol-2 profile and refreshes that
projection; when no state exists, its fallback is `full`. Adapter-only refresh
validates any recorded state before mutation but does not inherit its profile,
so pass `--profile minimal` explicitly when refreshing a deliberately minimal
host.

Update also reconciles the installed runtime dependency closure. It requires
exact package-local `archctx` and `archctx-contracts` versions, ArchContext's
exact package-local CodeGraph dependency, Node `>=22.22 <26`, and a successful
`archctx capabilities --json` handshake. Both profiles refresh the exact global
CodeGraph CLI/MCP by default. Waza and Mermaid remain mutable third-party
providers and refresh only with explicit `--with-external-skills`;
`--no-codegraph` is the bounded CodeGraph opt-out.

Full always projects the package-bundled cross-review and `claude-plan` Skills
required by its provider surfaces. Marketplace Waza and Mermaid are mutable
third-party providers and are selected only by an explicit install prompt or
`update --with-external-skills`, independent of the stored profile.

`reverse-skill-router` is a recommended but explicit-only dependency. Its
upstream pack tells agents to treat a mentioned target as authorized, which is
not a valid repo-harness authority boundary. It is therefore never selected by
`minimal` or `full`; install it only after independent scope review with
`repo-harness install --with-reverse-skill` or
`repo-harness update --with-reverse-skill`. The install copies the router pack;
its optional security toolchains remain on-demand. The catalog pins upstream
commit `539899ddc7608d63dc66e08e794d572e080f1a55` and verifies the selected
tree's SHA-256 before any host projection.

`obsidian-memory` declares `obsidian-markdown` and `obsidian-cli` as hard
companion Skill dependencies in the catalog, but both upstream Skills remain
explicit-only. Ordinary `minimal` and `full` installation does not download
them. Install or verify the bounded bundle with:

```bash
repo-harness install --with-obsidian-skills
repo-harness update --with-obsidian-skills
```

The catalog pins both subtrees from
`kepano/obsidian-skills@a1dc48e68138490d522c04cbf5822214c6eb1202`
and verifies a separate full-tree SHA-256 before projecting either Skill. A
successful install records the staging directories and host links in the
existing install transaction; subsequent drift is reported as managed drift,
and any later transaction failure restores all affected surfaces atomically.
This option installs Skills only. It does not install or require the
`obsidian` executable, Obsidian desktop App, or an npm Obsidian runtime.
`brainRoot` remains optional, and hooks, CI, workflow checks, and releases do
not read or write a vault.

Installed profile state is protocol 2. Protocol-1 state is never reinterpreted
in normal reads because its `minimal` name meant the retired 5-hook projection.
Normal `install`, `update`, `--state`, and status paths fail closed with an
explicit migration instruction. The only migration entrypoint is:

```bash
repo-harness install --migrate-profile-state --profile minimal
# or
repo-harness install --migrate-profile-state --profile full
```

Add `--dry-run --json` to inspect the one-shot mapping without mutation. The
operator invokes migration explicitly; omitting `--profile` selects `full`,
while `minimal` remains an explicit bounded target. No legacy profile name
remains as a steady-state alias. Migration validates the legacy component list
and ownership manifest, snapshots every host mutation path, removes only retired
transaction-owned surfaces, compensates on failure, and writes protocol 2 with
`previous: null`. Legacy rollback history is deliberately not imported.

The state file records each real managed surface with its absolute path, surface
type, content hash, explicit managed marker, and symlink target where relevant.
For shared host config files the hash covers only repo-harness-owned hook entries,
so user-owned sibling settings may change without creating false drift. `--state`
verifies those host surfaces instead of trusting component labels alone.
Switch and rollback remove or rewrite only repo-harness-managed routes, exact
package copies, and package-owned links; pre-existing or modified external Skills
remain untouched and are not claimed as active profile components. Repository changes remain
under the normal adoption transaction and Git rollback boundaries; secrets and
provider state are never included.

The host-runtime transaction snapshots both the profile state and the external
Skills registry (`.agents/.skill-lock.json`) before mutation. A failed component
probe, route projection, or state commit compensates every touched managed path
and restores both metadata files. Staging discovery and host discovery are
separate: a Skill present only under `.agents/skills` does not satisfy a Codex or
Claude host probe, and a host Skill must resolve to the selected staging entry.
Profile switching removes a registry entry only when this transaction owns the
staging surface; a user-owned registry or host Skill is preserved and drift
fails closed.

CodeGraph configuration is tracked as a projected host-config surface with its
owned-entry hash. Reinstall refreshes that ownership only when the entry is new
or was already package-owned. Minimal enables CodeGraph only on an explicit local
opt-in (`tooling.codegraph.enabled: true` in the target repo's
`.ai/harness/policy.json`); repo size never enables it. Full requires the
executable projection. Neither profile treats an unrelated pre-existing MCP entry
as package-owned.

Install and benchmark transactions must also bind `BUN_INSTALL` to the selected
host home. Setting `HOME` alone does not isolate Bun global installation when a
caller already exports `BUN_INSTALL`; an inherited real path would mutate the
operator's global package instead of the disposable profile runtime.

## Install Surfaces and Refresh Commands

`repo-harness install` is the first-run global bootstrap: it installs the current
npm package as the global CLI, refreshes repo-harness Skill aliases, installs the
user-level hook adapters, and records the explicit install profile. It never
applies repo-local workflow files to the current directory; that stays on
`repo-harness init`.

```bash
# Refresh the user-level CLI and runtime pieces after a package update.
repo-harness update

# Read-only repair guidance, no writes.
repo-harness update --check

# Remove managed host adapters without touching sibling or third-party hooks.
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
executes each one deliberately. `repo-harness init-hook` remains a compatibility
alias for the adapter-only install path.

## Codex Delegation Authority

Adapter installation has no delegation-mode prompt or config write. Codex fleet
delegation is explicit: `/delegate` or `/parallel` may inject a bounded dispatch
contract, while authorization can also come directly from the current user turn,
applicable `AGENTS.md`, or an explicitly invoked skill. Natural-language hook
classification and SessionStart standing authorization are not authorities.

At runtime, Codex uses native `spawn_agent` with the exact installed
`agent_type` and `fork_turns="none"`. Missing or mismatched native role/model
evidence fails closed without an App-thread, `codex-exec`, or main-thread fleet
fallback. Existing `delegation.mode` keys in user config are inert because the
runtime no longer reads them; no compatibility parser or migration shim is kept.
