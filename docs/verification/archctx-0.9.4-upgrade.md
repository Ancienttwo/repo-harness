# ArchContext 0.9.4 consumer upgrade verification

Baseline: `992138437` (`origin/main`).
Environment: Node v24.22.1, Bun 1.4.3, macOS arm64.

Both exact dependency pins move from 0.9.3 to 0.9.4. The provider derives its
required version from `package.json`; no separate version constant is added.

## Published package evidence

Release: https://github.com/Ancienttwo/arch-context/releases/tag/v0.9.4
Source: `1cd05cbd18cbc3899925fd201c8c347252dfba92`.

Installed with `bun add --exact archctx@0.9.4 archctx-contracts@0.9.4
--ignore-scripts` in a worktree. The script downloaded each published npm
tarball, compared every regular archive member with the installed file, and
recorded SHA-256 and SHA-512. Both SHA-512 values equal the `dist.integrity`
values from `npm view` and the two package entries in `bun.lock`. The raw output
is `archctx-0.9.4-installed-bytes.json`.

- `archctx@0.9.4`: 106 regular files match; SHA-256 `7f4915eec3c702dc77a7cca80263975c8c1ff18871d89053e37c349930bd6e4e`.
- `archctx-contracts@0.9.4`: 241 regular files match; SHA-256 `78bebfb718abc695142dcaa7b5f826869a6dce0ce93ecba2ebdb2a8fd49011e6`.

This checks installed bytes, not daemon behavior. The comparison does not count
extra installed files, compare modes, validate symlinks or execute package
entrypoints.

## Static capability readback

```sh
node node_modules/archctx/bin/archctx.mjs capabilities --json
```

Exit 0. The unedited output is `archctx-0.9.4-capabilities.json` (SHA-256
`065844a84f1e38ccedd52fc2cac1e99885e7afb75b30e268740f5604c8ac2694`). It reports
package 0.9.4, capabilities/v1, the same three protocol ids as 0.9.3
(projection request/v1, result/v2, refresh signal/v1), docs renderer/v6 and 39
features. It starts no daemon and opens no listener.

0.9.4 adds fields to the native export contract that this repository already
decodes through the published schema: `decisions` (id, title, status,
decidedAt, appliesTo, supersedes, path) and `model.layers`. A real
`readArchitectureNativeContext` call against this worktree decoded 107 nodes, 38
flows and 1 decision at profile `repo-harness/v1`. No local schema copy or
parser was added.

## Clean-room integration receipt

The committed receipt was regenerated with the repository's own script:

```sh
bun scripts/axr5-archctx-clean-room.ts --arch-context-root <local-arch-context-checkout> \
  --revision 1cd05cbd18cbc3899925fd201c8c347252dfba92 \
  --out docs/verification/axr5-archctx-clean-room-readback.json
```

It exited 0 and reports `status: verified`, both packages 0.9.4, `source.revision`
`1cd05cbd18cbc3899925fd201c8c347252dfba92`, unchanged authoritative node schema
`archcontext.node/v2` and unchanged digest. The projection returned
`human-action-required` with CodeGraph `unavailable`; the receipt proves the
packed provider contract, not a fully indexed projection. The script used a new
temporary HOME and state directory, confirmed daemon shutdown before cleanup,
and did not operate the global runtime.

## Checks

- `bun run check:type`: exit 0.
- `bun run test:files tests/architecture-projection-provider.test.ts tests/architecture-projection-e2e.test.ts tests/architecture-debt.test.ts tests/refactor-archctx-provider.test.ts --timeout 60000 --max-concurrency 1`: 87 pass, 1 fail before the receipt update, and 88 pass after it. The single failure was the packed-integration test at line 1524, which reads the committed receipt and expected 0.9.3; the regenerated receipt fixed it. The test assertion was not changed.

## Consumer text corrected with the bump (PR #1096)

Four map layers and reasons still asserted that the pinned archctx cannot
produce the fact. 0.9.4 does produce it, so the text now names the missing
consumer instead:

- `decisions_not_exported`: `export native` now exports `decisions[].appliesTo`; the collector does not read it.
- `change_impact_not_exported`: `archctx impact` now reports the flow steps a change reaches; the collector does not call it.
- `layer_order_not_released`: layer order is exported; the collector does not check imports against it yet.
- `flows_check_writes_index`: `flows check` now accepts `--no-sync`; the collector still runs neither form.

Reason codes, map schema and layer states are unchanged, so the operator UI
tests keep their assertions. Only comments, English and Chinese copy, and the
architecture module prose changed.

## Pin-bump limits (PR #1096)

The change selects the full affected lane (`package.json` and `bun.lock` are
global inputs), so the PR runs that lane rather than a narrow slice. No full
suite, release, deployment or main publication was run here. The 0.9.4
features for decisions, impact, layer order and `--no-sync` flow proofs are
reported by the package but not yet consumed; that is follow-up work, not part
of this pin bump.

## Architecture map integration (PR #1097)

PR #1097 builds on the dependency pair from PR #1096. Its package.json and
bun.lock match main after integration. The package evidence and checks above
belong to the pin bump.

- Today's changes and PR impact use `archctx impact`. The map no longer derives
  owners, dependents or model changes locally.
- Decisions use the native export. Flow proofs use `flows check --no-sync`.
- Ordered layers remain unavailable because this model declares no `model.layers`.
- The architecture worker records `ledger receipt --journal-id` after apply.
  The check reference compares the receipt paths and `bodyHash` values with
  changed model files.

The one-shot 0.9.3 coverage policy (`ARCHCTX_093_DIFF`, `isArchctx093Upgrade`
and `archctxConsumerPaths`) is removed. Dependency changes still select full
coverage. PR #1097 records its final integration checks in the PR description.
