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
| `minimal` | 7 | CLI, effective state, scope/worktree/check guards, handoff, adaptive workflow, conditional CodeGraph support, host adapters, root router, `repo-harness-plan`, and `repo-harness-check` |
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

Full always projects the package-bundled cross-review and `claude-plan` Skills
required by its provider surfaces. Marketplace Waza and Mermaid are selected
by full as well; minimal does not select them.

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
or was already package-owned. Minimal keeps CodeGraph conditional; full requires
the executable projection. Neither profile treats an unrelated pre-existing MCP
entry as package-owned.

Install and benchmark transactions must also bind `BUN_INSTALL` to the selected
host home. Setting `HOME` alone does not isolate Bun global installation when a
caller already exports `BUN_INSTALL`; an inherited real path would mutate the
operator's global package instead of the disposable profile runtime.
