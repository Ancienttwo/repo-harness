# Install Profiles

`repo-harness install --profile <profile>` is the host-runtime authority.
`--dry-run --json` lists components to install, skip, and remove. `--state
--json` reads `~/.repo-harness/install-state.json` together with drift status;
`--rollback` first reprojects the previous profile's managed Skills and host
routes, then commits the restored state only if that runtime transaction passes.

| Profile | Components |
|---|---|
| `minimal` | CLI, effective state, scope/worktree/check guards, handoff, host adapters |
| `standard` | minimal plus adaptive Lite/Standard workflow; CodeGraph remains conditional |
| `product-planning` | standard plus PRD/Sprint/Goal and planning integrations |
| `strict` | standard plus agent fleet, verifier, risk-triggered cross-model acceptance, release/deployment gates |

Non-interactive and blank interactive choices default to `minimal`; external
skills and CodeGraph are not implicitly installed. Profile switching removes
only package-owned surfaces. Unknown or modified canonical/facade directories
fail closed before mutation; user-authored content is preserved.

Migration from the old broad discovery surface is one-shot and fail closed:
the sync removes only an exact package-target symlink, a content-hash-verified
ownership-marked copy, or a byte-identical package directory. There is no runtime
fallback to the old install default.

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

Install and benchmark transactions must also bind `BUN_INSTALL` to the selected
host home. Setting `HOME` alone does not isolate Bun global installation when a
caller already exports `BUN_INSTALL`; an inherited real path would mutate the
operator's global package instead of the disposable profile runtime.
