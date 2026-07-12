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
only package-owned surfaces. Unknown user-authored skills and config siblings
are preserved.

Migration from the old broad discovery surface is one-shot and fail closed:
the sync removes only a package-target symlink, an ownership-marked copy, or a
copy whose `SKILL.md` exactly matches the package source. There is no runtime
fallback to the old install default.

The state file carries a component-level ownership manifest. Switch and rollback
remove or rewrite only repo-harness-managed routes, exact package copies, and
package-owned links; pre-existing or modified external Skills remain untouched
and are not claimed as active profile components. Repository changes remain
under the normal adoption transaction and Git rollback boundaries; secrets and
provider state are never included.
