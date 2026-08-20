> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Implementation Notes: cli-hooks-retirement-audit

## Boundary

`repo-harness` has moved from a scaffold/skill-configuration-first product shape
to a CLI+hooks automation plugin. The active mainline is:

- `repo-harness init`: global CLI, hook adapters, repo-harness runtime aliases,
  Waza `think`/`hunt`/`check`/`health`, Mermaid, brain root, and CodeGraph MCP.
- `repo-harness update`: existing-repo workflow install/refresh.
- `repo-harness-scaffold`: branch command for new project/module creation.

`scripts/setup-plugins.sh` is now only a compatibility shim. It must not install
Claude marketplace plugins, Superpowers, feature-dev/frontend-design/
code-simplifier/hookify, or LSP bundles.

## Decisions

- Kept `mermaid` as the retained diagram skill and removed active
  `diagram-design` guidance from current architecture requests and active
  reference surfaces.
- Kept scaffold generation scripts because they still back the branch command;
  they are not the existing-repo adoption path.
- Collapsed `references/plugins-core.md` into a retired reference so old Claude
  plugin recommendations cannot be mistaken for current install guidance.
- Preserved compatibility aliases such as `repo-harness-skill` and historical
  `project-initializer` markers where tests and migration paths still need them.

## Verification

- `bun test tests/cli/global-runtime-init.test.ts tests/cli/init.test.ts tests/setup-plugins-structure.test.ts tests/bootstrap-files.test.ts tests/action-command-skills.test.ts tests/check-agent-tooling.test.ts tests/workflow-contract.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts`
- `npm run check:release` passed for `repo-harness@0.2.3` after the release
  gate was given a publish-specific shell-test timeout/concurrency budget.
- `npm publish --registry https://registry.npmjs.org/ --access public`
  published `repo-harness@0.2.3`; registry readback reported `latest =
  '0.2.3'` and `gitHead = '3e87b0295c88464cd9b9d2557e63d101c4bdce59'`.
- Clean-room `npx -y --registry https://registry.npmjs.org/
  repo-harness@0.2.3 --version` printed `0.2.3`, and clean-room `init --help`
  exposed the current CLI+hooks/Waza/Mermaid/brain/CodeGraph flags without a
  Superpowers option.
