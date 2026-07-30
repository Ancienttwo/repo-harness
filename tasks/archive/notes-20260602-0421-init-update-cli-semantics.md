# init/update CLI Semantics Notes

Public CLI semantics are split by lifecycle:

```bash
npx -y repo-harness init
npx -y repo-harness update
```

`init` is the first-run global bootstrap. It no longer wraps the legacy
`scripts/setup-plugins.sh` Claude plugin installer. The active path installs the
current package as the global CLI, refreshes repo-harness skill aliases, installs
user-level Codex/Claude hook adapters, configures Waza
`think`/`hunt`/`check`/`health`, persists the brain root in
`~/.repo-harness/config.json`, and configures CodeGraph MCP.

`update` owns existing repo-local harness installation and refresh. It reuses the
existing `runInit` implementation for workflow files, hook assets, host adapters,
skill aliases, CodeGraph readiness, brain manifest options, and verification.

Hook-side CodeGraph behavior remains advisory and non-blocking. When
`prompt-guard.sh` detects a structural code-navigation prompt and the repo has no
`.codegraph/codegraph.db`, it first runs `CODEGRAPH_NO_DAEMON=1 codegraph init
-i .` via a repo-local `node_modules/.bin/codegraph` or PATH-visible CodeGraph
binary. This initializes the index when CodeGraph is available, but it does not
run the heavier repo-harness readiness probe, install dependencies, or block the
prompt if CodeGraph is unavailable. Because current CodeGraph may also write a
Cursor rule during init, the hook removes `.cursor/rules/codegraph.mdc` only when
that file did not exist before the automatic init.

## Release Gate Stabilization

- Scoped synchronous CodeGraph auto-init to explicit structural navigation
  prompts. Generic bug/debug prompts still receive the CodeGraph route nudge, but
  do not run a potentially slow real `codegraph init` inside prompt submission.
- Isolated the recursive hook migration test from parent npm lifecycle
  environment variables so `npm publish` preflight cannot leak `npm_*` state into
  the target-repo migration fixture.
- Treated unreadable external brain-vault targets as advisory during
  `sync-brain-docs.sh --check` unless `--require-vault` is set. Repo source files
  remain hard failures; only local CloudDocs/TCC target read failures downgrade
  to warnings to keep release checks from crashing on machine-local vault locks.

## Publish Closeout

- The first publish attempt failed because the default npm auth state was not
  publish-capable. Using the local `_ops/env/npm.md` token through a temporary
  npmrc verified npmjs identity as `ancienttwo`.
- `npm publish --registry https://registry.npmjs.org/ --access public` reran the
  full release gate successfully and published `repo-harness@0.2.1`.
- Registry verification returned version `0.2.1`, tarball
  `https://registry.npmjs.org/repo-harness/-/repo-harness-0.2.1.tgz`, and
  npm `gitHead` `56a68b10192695c4ba49ec3df37276c0121672f9`.
- Clean-temp `npx -y --registry https://registry.npmjs.org/
  repo-harness@0.2.1 --version` printed `0.2.1`; clean-temp `init --help`
  printed the global init command help.
