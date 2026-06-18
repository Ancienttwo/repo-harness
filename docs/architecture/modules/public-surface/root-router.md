# Architecture Module: public-surface/root-router

> **Capability ID**: `public-surface-root-router`
> **Matched Prefixes**: `SKILL.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/spec.md`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

The root router is the human and agent entrypoint for this plugin. `SKILL.md`
defines when the skill is used, compatibility aliases, and the four core paths:
initialize, migrate, audit, and repair. `README.md` owns first-run operator
guidance. `AGENTS.md` and `CLAUDE.md` define the self-hosted repo workflow for
both Codex and Claude. `docs/spec.md` owns the stable product outcome.

Strong dependencies:

- `scripts/inspect-project-state.ts` for state classification.
- `assets/workflow-contract.v1.json` for the machine-readable contract.
- `docs/reference-configs/agentic-development-flow.md` for routing detail that should not bloat root docs.

Weak dependencies:

- Compatibility name `repo-harness-skill`.
- `repo-harness install` owns first-run global bootstrap: install the CLI, install user-level hook adapters, configure Waza, persist the brain root, and configure CodeGraph MCP. `repo-harness init` remains a compatibility alias.
- `repo-harness uninstall` removes repo-harness managed host adapters without deleting sibling hooks or third-party tools.
- `repo-harness adopt` owns repo-local harness adoption and refresh.
- gstack/gbrain policy references remain advisory; this self-host repo vendors CodeGraph as a dev dependency while downstream generated repos keep global MCP setup explicit unless policy opts in.

Out of scope:

- Runtime hook implementation.
- Migration internals.
- Product scaffold details after initial harness attachment.

## P2 Trace

Concrete route: user asks for first-run host setup -> root `README.md` selects
`repo-harness install` -> the command installs the current package as the global
CLI, refreshes repo-harness skill aliases, installs user-level hook adapters,
configures Waza `think`/`hunt`/`check`/`health`, writes the selected brain root
to `~/.repo-harness/config.json`, and configures CodeGraph MCP for the selected
host target.

Concrete route: user asks for an existing repo install -> root `SKILL.md`
selects `repo-harness-init` semantics -> that action routes to
`repo-harness adopt` or `migrate-project-template.sh --repo <repo> --apply` ->
the command runs `inspect-project-state.ts --repo <repo> --format text` -> if no
legacy state is found, `migrate-project-template.sh --repo <repo> --apply`
installs or refreshes the workflow -> repo-local checks verify the target repo.

For global bootstrap, the input source of truth is the selected host target and
brain root, not the current directory. For repo-local adoption, the source of
truth is the target repo path, not the user's wording. The first repo-local type
transformation is repo filesystem state into `mode`,
`legacy_contract_version`, `drift_signals`, `required_decisions`, and
`upgrade_plan`. The final output is either a configured host runtime or a
file-backed harness plus verification report.

Error paths:

- Missing cwd/repo path stops before mutation.
- Legacy docs route to migration before template refresh.
- Missing JSON runtime fails strict workflow verification.

## P3 Decision

The root router is intentionally thin because the workflow has too many
machine-checked invariants to keep correct in prose. The invariant is that
policy lives in contracts, scripts, and tests; root docs only route and orient.

At 10x command count, this layer would fail first through discoverability and
duplicate wording. The current action-command split keeps root `SKILL.md`
stable while letting new public commands stay independently reviewable.

## Optimization Backlog

- Keep root `SKILL.md` under the existing line budget.
- If another public command is added, update `assets/skill-commands/manifest.json`, README, and `tests/action-command-skills.test.ts` in the same slice.
