# Architecture Module: public-surface/root-router

> **Capability ID**: `public-surface-root-router`
> **Matched Prefixes**: `SKILL.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/spec.md`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

The root router is the human and agent entrypoint for this plugin. `SKILL.md`
defines when the skill is used and exactly five semantic actions: setup, plan,
execute, verify, and handoff. Its body is capped at 2KB. `README.md` owns first-run operator
guidance. `AGENTS.md` and `CLAUDE.md` define the self-hosted repo workflow for
both Codex and Claude. `docs/spec.md` owns the stable product outcome.

Strong dependencies:

- `scripts/inspect-project-state.ts` for state classification.
- `assets/workflow-contract.v1.json` for the machine-readable contract.
- `docs/reference-configs/agentic-development-flow.md` for routing detail that should not bloat root docs.

Weak dependencies:

- `repo-harness install --profile <profile>` owns first-run global bootstrap; optional ecosystems are profile-selected and default off.
- `repo-harness uninstall` removes repo-harness managed host adapters without deleting sibling hooks or third-party tools.
- `repo-harness adopt` owns repo-local harness adoption and refresh.
- `geju` is a pre-contract framing skill and gbrain remains advisory; this self-host repo vendors CodeGraph as a dev dependency while downstream generated repos keep global MCP setup explicit unless policy opts in.

Out of scope:

- Runtime hook implementation.
- Migration internals.
- Product scaffold details after initial harness attachment.

## P2 Trace

Concrete route: user explicitly asks for setup -> root `SKILL.md` selects setup
-> `repo-harness install --profile minimal` plans CLI, effective state, guards,
handoff, and adapters -> `--dry-run` lists install/skip/remove -> apply persists
`~/.repo-harness/install-state.json`. Product planning and strict profiles add
their explicit optional surfaces.

Concrete route: user asks for an existing repo install -> root `SKILL.md`
selects `repo-harness-init` semantics -> that action routes to
`repo-harness adopt --repo <repo>` ->
the command runs `inspect-project-state.ts --repo <repo> --format text` -> if no
legacy state is found, `repo-harness adopt --repo <repo>`
installs or refreshes the workflow -> repo-local checks verify the target repo.

Concrete route: user asks for product discovery or a complex/design architecture
plan -> the parent agent invokes `geju` before a contract exists -> the parent
completes P1 architecture mapping, P2 concrete tracing, and P3 design judgment
with its own repo/runtime capabilities -> it reconciles the evidence and freezes
the accepted thesis, falsifier, and execution boundary into the file-backed plan
and contract. The captured contract, not a live planning provider, owns execution.

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

Planning has one lifecycle owner: the parent agent. `geju` expands the design
space before capture, while P1/P2/P3 and the final plan remain parent-owned.
This removes a host-dependent external planning gate without weakening the
file-backed approval, scope, review, or verification boundaries.

At 10x command count, this layer fails first through discovery overload. The
five-action router and profile-bounded installed facades keep specialized CLI
commands available without making them default model context.

## Optimization Backlog

- Keep the root router body at or below 2KB and default installed discovery at five actions or fewer.
- If another public command is added, update `assets/skill-commands/manifest.json`, README, and `tests/action-command-skills.test.ts` in the same slice.
