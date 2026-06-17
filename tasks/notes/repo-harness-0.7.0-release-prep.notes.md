# repo-harness 0.7.0 Release Prep Notes

Prepare the npm/package release line `repo-harness@0.7.0` after merging the
ChatGPT browser engine PR.

## Decisions

| Decision | Rationale | Verification |
| --- | --- | --- |
| Use `0.7.0` | The merged PR adds a new public CLI/MCP browser-engine feature line, not a patch-only fix. | `package.json`, `assets/skill-version.json`, `.claude/.skill-version`, README release surfaces, changelog, and version tests move together to `0.7.0`. |
| Keep one package/template version line | The 0.4.0 release retired the separate generated-workflow compatibility line, and this release does not introduce a compatibility split. | Downstream generated stamps move together to `repo-harness@0.7.0+template@0.7.0`. |
| Keep browser tools opt-in | The browser engine can create real ChatGPT Web conversations and write repo-local session records. | MCP tools are exposed only with `--enable-chatgpt-browser`; cleanup defaults to dry-run; native provider fails closed for unsupported model/thinking selection. |
| Keep generated Goal prompts language-neutral | The ChatGPT Connector and installed skills can be used outside Chinese-language repos, while repo-local AGENTS/CLAUDE files may still require a language. | `/goal` prompt generation now tells agents to use the user's language unless repo-local instructions require otherwise. |
| Stop before publish/tag/release | The current request is release preparation. Publishing npm, creating `v0.7.0`, and creating the GitHub release are irreversible public actions. | Release checklist records the hold and the required readback path. |

## Preflight Evidence

- PR #5 merged to `main` at `45f2a0f`.
- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  reported current latest `0.6.0`.
- `npm view repo-harness@0.7.0 version --json --registry https://registry.npmjs.org/`
  returned `E404`, so the target version is available.
- `repo-harness setup check --target codex --check-updates --json` reported no
  agent actions after CodeGraph sync; the only remaining non-ok item is the
  optional external `skills_cli` timeout warning.

## Verification Evidence

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
  returned `840 pass`, `0 fail`, then completed workflow checks, repository
  inspection, package dry-run, tarball install smoke, and `[release] OK`.
- `npm pack --dry-run --json` returned `repo-harness-0.7.0.tgz`, package size
  `4774793`, unpacked size `6898999`, `325` files, and shasum
  `bbc8f22e4f9e4e7d3b3e39de91f530092fa1d872`.
- `bash scripts/check-tarball-install-smoke.sh` passed for
  `repo-harness-0.7.0.tgz`.

## Hold

- npm publish, `v0.7.0` tag push, and GitHub release creation are intentionally
  held until the explicit publish step.
