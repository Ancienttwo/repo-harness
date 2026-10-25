# ArchContext 0.9.3 consumer upgrade verification

Baseline: `2cee26d888af9dd34ed52982e13df0c16db00681`.
Environment: Node 24.18.0, Bun 1.4.3, macOS arm64.

Both exact dependency pins move from 0.9.1 to 0.9.3. The existing provider
imports the upstream contracts and derives its required version from package.json.
No separate parser or version constant is added.

## Published package evidence

Release: https://github.com/Ancienttwo/arch-context/releases/tag/v0.9.3
Source: `0e08d30cb9e3daf87730a7126ca9b785d7663f72`.

Installed with `bun add --exact archctx@0.9.3 archctx-contracts@0.9.3 --ignore-scripts`
in an isolated worktree. Downloaded each published npm tarball, computed SHA-256
and SHA-512, and compared every regular archive member with the installed file.
Both SHA-256 values match the release metadata. Both SHA-512 values match the
registry and bun.lock. This checks installed bytes, not daemon behavior.

- `archctx@0.9.3`: 104 regular files match; SHA-256 `a5b2038b4580187519be0c3ec05a2d0db60038f5ca175d7f5671eea94ec900ea`.
- `archctx-contracts@0.9.3`: 236 regular files match; SHA-256 `5bd9a08fce79c8ad50db4e91dd62311ad64664eb95a75b7b017373a24205b610`.

## Checks and limits

- `bun run check:type`: pass.
- `bun run test:files tests/architecture-projection-e2e.test.ts --timeout 60000 --max-concurrency 1`: 8 pass, 356 assertions. Adds paired topology stamp acceptance and rejects unequal stamps, duplicate entity-summary stamps, and topology scale. Existing assertions stay intact.
- On the baseline with installed 0.9.1 contracts, the new paired topology acceptance test fails: unsupported target types, forbidden stamps, duplicate stamp. The same case passes with 0.9.3.
- Provider selection command below: 8 pass, 1 fail, 79 filtered. Version rejection, compatibility floors, handshake, daemon mismatch without recovery, and stamp-only render equivalence pass.
- Failure: `tracks the packed node/v2 integration proof without a stale node/v1 dependency`, line 1524, expects 0.9.3 but the committed clean-room receipt records 0.9.1. The unchanged test passes on baseline (1 pass, 87 filtered). This is an upgrade verification blocker, not an existing baseline failure. The test and receipt remain unchanged.

```sh
bun run test:files tests/architecture-projection-provider.test.ts --test-name-pattern 'tracks the packed|daemon lifecycle mismatch|healthy and stopped|render equivalence|resolves only the package-local|fails closed when the provider reports|handshakes capabilities|a renderer floor|a floor the installed' --timeout 60000 --max-concurrency 1
```

The clean-room script rewrites source package versions before build and starts a
daemon. It was not run under the current service restriction. Its historical
0.9.1 receipt is not evidence for this upgrade. No model or generated projection
was changed. No topology output was published. Other deployed readers must be
upgraded before anchored topology output is committed.

No full suite or CI was run. The current CI selector selects every test for
package.json or bun.lock changes. The commit uses `[skip ci]` to honor the user's
explicit ban on full CI. Required checks remain unsatisfied; this is a Draft,
not merge-ready. A supported bounded verification route and current clean-room
integration evidence are still required. Independent Astra review is pending.
