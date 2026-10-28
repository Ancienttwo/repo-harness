# ArchContext 0.9.4 consumer upgrade verification

Baseline: `788548fed` (main before the pin commit `50f2f7793`).
Environment: Node and Bun as installed on the host, macOS arm64.

Both exact dependency pins move from 0.9.3 to 0.9.4 in package.json and bun.lock.
The provider derives its required version from package.json. No separate version
constant exists.

## Published package evidence

Release: https://github.com/Ancienttwo/arch-context/releases/tag/v0.9.4
Source: `1cd05cbd18cbc3899925fd201c8c347252dfba92` (merged main, PR 422).

Ran `npm pack archctx@0.9.4 archctx-contracts@0.9.4` in an isolated directory,
computed SHA-256 and SHA-512 of each tarball, and compared every regular archive
member with the file in `node_modules`. Both SHA-512 values equal `npm view <package>@0.9.4 dist.integrity`
and the bun.lock entry. This checks installed bytes, not daemon behavior.

| Package | Tarball bytes | Regular files matched | SHA-256 |
| --- | --- | --- | --- |
| `archctx@0.9.4` | 715090 | 106 | `7f4915eec3c702dc77a7cca80263975c8c1ff18871d89053e37c349930bd6e4e` |
| `archctx-contracts@0.9.4` | 219495 | 241 | `78bebfb718abc695142dcaa7b5f826869a6dce0ce93ecba2ebdb2a8fd49011e6` |

SHA-512 (base64):

- `archctx`: `jAFmUbEvkFE6U5QiVvoVAVVRu3Em5oLK32waTsFah9pZeuWOPlh7fd/oX7bpp3sKXootzN1qZvfNuXorDYw43g==`
- `archctx-contracts`: `pWiOzrcMp3cUDKwzr2V2U8sSf/3AvZ4AX7E/Kfc6GMuUdoyEXYLnz5fqnNqSocLJ+90fe6/kRp+swLJqLyfAuA==`

The comparison does not count extra installed files, compare modes or validate
symlinks. It does not run package entry points.

## Clean-room receipt

Command, run from the repo root:

```sh
bun run check:archctx-integration --arch-context-root <arch-context checkout> --revision 1cd05cbd18cbc3899925fd201c8c347252dfba92
```

It exited 0 and rewrote `docs/verification/axr5-archctx-clean-room-readback.json`:
status `verified`, source revision `1cd05cbd18cbc3899925fd201c8c347252dfba92`
(`git-archive`, `dirtySourceUsed: false`), both packages 0.9.4, consumer node
schema `archcontext.node/v2`. The projection returned `human-action-required`;
CodeGraph (1.6.2) was `unavailable`. The receipt proves the packed provider
contract, not a fully indexed projection. The script used a new temporary HOME
and state directory. Published tarball bytes are the separate evidence above.

## Removed CI policy

`ARCHCTX_093_DIFF`, `isArchctx093Upgrade`, `archctxConsumerPaths` and the `narrow`
branch in `scripts/select-ci-coverage.ts` are removed. They admitted only the
PR 951 diff for 0.9.1 to 0.9.3. A package.json or bun.lock change selects the full
suite again; `tests/check-ci-job-split.test.ts` asserts `fullReasons` for both files.

## Consumers updated in this branch

- Operator map: see the architecture map commits on this branch.
- Skill prose: `repo-harness-architecture/references/worker.md` uses
  `flows check --no-sync` (arch-context#421) and records `ledger receipt --journal-id`
  in the PR body after `apply` (arch-context#414). `repo-harness-check/references/architecture-evidence.md`
  compares the receipt `bodyHash` values with the changed model files.

No full suite or CI result is recorded here. The orchestrator runs
`bun run check:type` and the affected tests after integration.
