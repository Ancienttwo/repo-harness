# ArchContext 0.10.0 consumer upgrade verification

Baseline: `2be756a0f` (`origin/main`).
Environment: Node v24.22.1, Bun 1.4.3, macOS arm64.

Both exact dependency pins move from 0.9.4 to 0.10.0. The provider derives its
required version from `package.json`; there is no separate version constant.

## Published package evidence

Source: `Ancienttwo/arch-context` `origin/main`
`8dee040ad9bf5c343ad70956c1b0abb621fea327` (the merged `release/0.10.0`
branch). The npm registry reported `latest` 0.10.0 for both packages when this
note was written. The GitHub release page did not yet list `v0.10.0`; the source
revision above is the release candidate that the registry metadata belongs to.

Installed with `bun add --exact archctx@0.10.0 archctx-contracts@0.10.0`. The
script downloaded each published npm tarball, compared every regular archive
member with the installed file, and recorded SHA-256 and SHA-512. Both SHA-512
values equal the `dist.integrity` values from the registry and the two package
entries in `bun.lock`. The raw output is
`archctx-0.10.0-installed-bytes.json`.

- `archctx@0.10.0`: 106 regular files match; SHA-256 `761febd74c1b850e3c1ae93af3a99d03a897e335aef624ae06a0fcae2a0fd49c`.
- `archctx-contracts@0.10.0`: 241 regular files match; SHA-256 `5b64d6f7bc63b11def43990efd7eca269170a0197d38c6bde73a05ca0c9b1d81`.

This checks installed bytes, not daemon behavior. The comparison does not count
extra installed files, compare modes, validate symlinks or execute package
entrypoints.

## Static capability readback

```sh
node node_modules/archctx/bin/archctx.mjs capabilities --json
```

Exit 0. The unedited output is `archctx-0.10.0-capabilities.json` (SHA-256
`48c392ba7aba14187a4923af14a4379893ddba654b1dfa629cf23e8b61aac67c`). It reports
package 0.10.0, capabilities/v1, the same three protocol ids as 0.9.4
(projection request/v1, result/v2, refresh signal/v1), docs renderer/v6 and 39
features. The feature set is identical to 0.9.4. It starts no daemon and opens
no listener.

## Profile output change

0.10.0 changes the published output of the `repo-harness/v1` documentation
profile (#433). That profile now renders capability pages, the ADR-0049 runtime
topology pair when the model declares topology nodes, and the projection
manifest. It retires six whole-model files:
`architecture-index`, `architecture-changelog`, `decision-index`,
`diagram-mermaid`, `diagram-likec4` and `diagram-structurizr`. The `default`
profile output is unchanged.

The first `archctx docs apply --approved --profile repo-harness/v1` after the
upgrade deletes an intact retired file with its manifest row. A hand-edited
retired file stops the apply with `AC_PRECONDITION_FAILED` and
`projection-orphan-review-required` and stays in place.

This repository had one hand-edited retired file: `docs/architecture/index.md`.
It carried human prose outside its generated marker and linked to pages that no
longer exist. This change moves the still-current content to
`docs/architecture/overview.md`, deletes the retired page, updates the
repository-local required-document pointer and names both profile entry points
in the architecture worker guidance. The five intact retired files and all
generated regions remain for the archctx rolling writer; this change does not
run projection apply.

## Clean-room integration receipt

The committed receipt was regenerated with the repository's own script:

```sh
bun scripts/axr5-archctx-clean-room.ts --arch-context-root <local-arch-context-checkout> \
  --revision 8dee040ad9bf5c343ad70956c1b0abb621fea327 \
  --out docs/verification/axr5-archctx-clean-room-readback.json
```

It exited 0 and reports `status: verified`, both packages 0.10.0,
`source.revision` `8dee040ad9bf5c343ad70956c1b0abb621fea327`, unchanged
authoritative node schema `archcontext.node/v2` and unchanged digest. The
projection returned `human-action-required` with CodeGraph `unavailable`; the
receipt proves the packed provider contract, not a fully indexed projection. The
script used a new temporary HOME and state directory, confirmed daemon shutdown
before cleanup, and did not operate the global runtime.

## Checks

Checks run in this worktree at the final head. The dependency pin and
`bun.lock` are global CI inputs, so hosted CI selects the full affected lane;
no full suite, release, deployment or main publication ran here.

- `bun run check:type`: exit 0.
- `bun run test:files tests/architecture-projection-provider.test.ts tests/architecture-projection-e2e.test.ts tests/architecture-debt.test.ts tests/refactor-archctx-provider.test.ts tests/axr5-clean-room-runtime.test.ts tests/check-ci-job-split.test.ts tests/capability-archcontext-export.test.ts tests/unit/operator-architecture.test.ts tests/operator-web/operator-architecture.test.tsx tests/cli/operator-serve.test.ts --timeout 60000 --max-concurrency 1`: 88, 8, 17, 7, 13, 54, 3, 37, 29 and 51 pass; 0 fail; exit 0.
- `bun run check:reference-configs`: 26 docs, projection OK.
- `bun run check:helpers`: projection OK.
- `bun scripts/check-state-boundaries.ts`: 450 TypeScript files checked, OK.
- `bun run check:context-map`: OK.
- `bash scripts/check-context-files.sh`: SAFE.
- `bun scripts/check-protected-paths.ts --tracked`: exit 0.
- `bash scripts/check-deploy-sql-order.sh`: OK.
- `bash scripts/check-agent-tooling.sh`: managed CLI present at 0.10.0, contracts 0.10.0.
- `bun scripts/inspect-project-state.ts --repo . --format text` and `bun src/cli/index.ts init --repo . --dry-run`: exit 0.

## Limits

No release or deployment ran. The rolling writer still owns the retired
generated files, the stale module regions and the projection manifest. Until its
next publish, `archctx docs drift` reports those generated paths. The local
CodeGraph index is stale after the dependency change, so a local projection plan
stops at `AC_CODE_FACTS_NOT_READY`; hosted CI and the writer rebuild their own
indexes.
