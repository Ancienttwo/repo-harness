# Release Filing: repo-harness 0.7.0

Date: 2026-06-18
Status: Prepared; npm publish, Git tag, and GitHub release pending

## Scope

- Package target: `repo-harness@0.7.0`
- Base release: `v0.6.0`
- Release branch: `codex/release-0.7.0`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.7.0` as a minor release. The release adds the ChatGPT browser engine:
`repo-harness chatgpt browser-*`, repo-local browser session records, safe
prompt/file policy, an Oracle provider wrapper, a native installed-Chrome CDP
provider spike, optional MCP browser tools behind `--enable-chatgpt-browser`,
and hosted CI gate hardening.

This is a compatible addition. Browser tools are disabled by default in MCP,
native provider runs fail closed when model/thinking selection is requested, and
session cleanup remains dry-run unless `--force` is passed.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references, including localized READMEs
- `docs/CHANGELOG.md`
- ChatGPT Connector goal handoff and `repo-harness-goal` reporting language
  policy
- version expectation tests
- release checklist and task notes

## Preflight Evidence

- PR #5 was squash-merged to `main` as `45f2a0f`.
- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.6.0`.
- `npm view repo-harness@0.7.0 version --json --registry https://registry.npmjs.org/`
  returned `E404`, proving the target package is unpublished before publish.
- `gh release view v0.6.0 --repo Ancienttwo/repo-harness --json ...` returned
  the public `v0.6.0` release, non-draft, non-prerelease, with no assets.
- Tooling update advisory was executed. The release worktree has no CodeGraph
  index, so `ensure-codegraph --sync` was rerun against the indexed primary
  checkout. `repo-harness setup check --target codex --check-updates --json`
  then reported CodeGraph up to date, no agent actions, and one optional
  `skills_cli` timeout warning.

## Verification

- `bun src/cli/index.ts --version` returned `0.7.0`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.7.0` and `template=0.7.0`.
- Focused release/browser checks passed:
  `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/readme-dx.test.ts tests/cli/chatgpt-browser.test.ts tests/cli/mcp-tools.test.ts`
  returned `56 pass`, `0 fail`.
- Focused MCP/Skill language checks passed:
  `bun test tests/cli/mcp.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-setup.test.ts tests/action-command-skills.test.ts`
  returned `33 pass`, `0 fail`, and the old Chinese `/goal` tokens are absent
  from non-test release surfaces.
- Full release gate passed:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `840 pass`, `0 fail`, then completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed`.
- `npm pack --dry-run --json` returned:
  - filename: `repo-harness-0.7.0.tgz`
  - package size: `4774793`
  - unpacked size: `6898999`
  - total files: `325`
  - shasum: `bbc8f22e4f9e4e7d3b3e39de91f530092fa1d872`
  - integrity:
    `sha512-Gc6AiRtGgHfgYK2zdOA3MoMNzAKPBXVXcii6wyc+FImV/aO0ooUIk5E79rjOiBUA4wvUz8AZ/BVgWBxhJfbaLg==`
- The package dry-run includes
  `.agents/skills/repo-harness-chatgpt-browser/SKILL.md`,
  `docs/repo-harness-chatgpt-browser-engine.md`, and
  `src/cli/chatgpt-browser/*`.
- `bash scripts/check-tarball-install-smoke.sh` passed, proving the local
  packed tarball installs into a temporary project and starts the packaged
  `repo-harness` and `repo-harness-hook` bins.

## Publish Hold

- npm publish has not been run for this prep-only slice.
- Do not tag `v0.7.0` or create the GitHub release until npm publish and
  registry readback succeed.
