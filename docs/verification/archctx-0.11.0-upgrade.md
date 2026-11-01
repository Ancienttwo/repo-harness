# ArchContext 0.11.0 consumer upgrade verification

Baseline: `1d76d4b0e` (`origin/main`).
Environment: Node v24.22.1, Bun 1.4.3, macOS arm64.

Both exact dependency pins move from 0.10.0 to 0.11.0. The provider derives its
required version from `package.json`; there is no separate version constant.

## Published package evidence

Source: `Ancienttwo/arch-context` `04b4c1084d78f7c2fa805f4cebd64a84bee84924`,
the merge of arch-context PR #441 (`release/0.11.0`). Release:
<https://github.com/Ancienttwo/arch-context/releases/tag/v0.11.0>, published
2026-11-01T12:35:16Z. Its annotated tag `v0.11.0` (tag object
`b83f3702be52292b3542ebe3602f8d2d67f106ec`, tagger date 12:35:08Z) points to
that commit. The tag is unsigned. The npm registry published
`archctx-contracts@0.11.0` at 12:21:24Z and `archctx@0.11.0` at 12:23:00Z, and
reported `latest` 0.11.0 for both. Neither registry manifest has a `gitHead`
field. The registry `dist.integrity` values are:

- `archctx@0.11.0`: `sha512-tTQlK5/QZwdIi4g921OfpBG//ZrnAlsKJtuw/fZeCpeAu6Y0jVsweVqyvFGxx+nh7B5rW74vf+7i+sm/ykW/CQ==`.
- `archctx-contracts@0.11.0`: `sha512-NECt6puJ0d32AHdVXQ0YwjvN6OycAHITe1L2z18n5paweh8QTanvgASzHncShVbB0h5XAgC3Ku0L3y8Rh5U/hw==`.

The Release has three assets: `archctx-0.11.0.tgz`, `archctx-contracts-0.11.0.tgz`
and `SHA256SUMS`. Each tarball asset is byte-identical (`cmp`) to the registry
tarball, so its SHA-512 equals the `dist.integrity` above. Both `SHA256SUMS`
lines equal the SHA-256 values below, and `shasum -a 256 -c SHA256SUMS` passes.

Supporting evidence: a clean-room pack of `04b4c108` gives an
`archctx-contracts` tarball whose SHA-512 equals the registry `dist.integrity`.
Its `archctx` tarball has the same 106 members as the registry tarball. Only
`bin/archctx.mjs` differs, and only in bundler comment lines that record the
absolute path of linked build dependencies. After those comment paths are
normalized, the bundles are identical.

Installed with `bun add --exact archctx@0.11.0 archctx-contracts@0.11.0`. The
script downloaded each published npm tarball, compared every regular archive
member with the installed file, and recorded SHA-256 and SHA-512. Both SHA-512
values equal the registry `dist.integrity` values and the two package entries
in `bun.lock`. The same script reproduces `archctx-0.10.0-installed-bytes.json`
byte for byte against a 0.10.0 install. The raw output is
`archctx-0.11.0-installed-bytes.json`.

- `archctx@0.11.0`: 106 regular files match; SHA-256 `48cf81f252ff0815b1404190d23db28a36275b07153be971a0ca52ba2e87555c`.
- `archctx-contracts@0.11.0`: 242 regular files match; SHA-256 `90019a2a0b836fa967a2cc9bc732eeb92a257565a05605934d2dde4ea645db49`.

This checks installed bytes, not daemon behavior. The comparison does not count
extra installed files, compare modes, validate symlinks or execute package
entrypoints.

## Static capability readback

```sh
node node_modules/archctx/bin/archctx.mjs capabilities --json
```

Exit 0. The unedited output is `archctx-0.11.0-capabilities.json` (SHA-256
`3eaec1d9259970eb2c190b0c0c1b20a6eac2c3effd5328432e4b0e7e431705b7`). It starts
no daemon and opens no listener. Compared with `archctx-0.10.0-capabilities.json`,
the only difference is `package.version`.

## Differences from 0.10.0

| Surface | 0.10.0 | 0.11.0 |
| --- | --- | --- |
| Capabilities schema | `archcontext.capabilities/v1` | unchanged |
| Protocol ids | projection request/v1, result/v2, refresh signal/v1 | unchanged |
| Renderers | docs renderer/v6, agent context renderer/v1 | unchanged |
| Feature list | 39 features | unchanged (same 39) |
| Runtime RPC | `archcontext.runtime-rpc/v2` | unchanged |
| Authoritative node schema | `archcontext.node/v2`, digest `sha256:38f56056…cd421131` | unchanged (clean-room receipt) |
| `archctx` package files | 106 | 106; `schemas/` and `assets/profiles/` byte-identical |
| `archctx-contracts` package files | 241 | 242; adds `src/architecture-history.ts` |
| New contracts | none | `archcontext.architecture-history/v1`, `archcontext.architecture-history-mermaid/v1` |
| Failure reasons | — | adds `history-shallow-repository` (`AC_PRECONDITION_FAILED`, action `unshallow-repository`) |
| Git adapter operations | `rev-parse`, `ls-tree`, `ls-files`, `cat-file` | adds a fixed-argument `log --first-parent` over `.archcontext/model` and `rev-parse --is-shallow-repository` |
| CLI commands | — | adds `archctx history [--ref] [--format json\|mermaid] [--offset] [--limit]` |
| `projection publish` | writes the manifest targets | also writes `docs/architecture/history.md` (latest 20 milestones) |
| `projection verify-pr` | compares manifest targets and agent context | also compares a changed `history.md` with the head render |
| Practice catalog | `catalogDigest sha256:f82e50f2…` | `sha256:855b3458…` (digest input includes the product version) |

The other changes are version strings and bundler module order. After
bundler-generated numeric identifier suffixes are normalized, the CLI bundle
diff has no other changed hunk.

## Profile output

The `repo-harness/v1` and `default` documentation profiles are unchanged. The
profile assets are byte-identical, the docs renderer stays at v6, and the
bundle diff has no change in `docs plan`, `docs apply` or `docs drift`. The
manifest schema is unchanged.

The rolling writer output changes. `repo-harness architecture-projection
publish` runs `archctx projection publish`, so the first writer publish under
0.11.0 adds `docs/architecture/history.md` to the rolling PR. The writer owns
that file like the manifest. It is outside the projection manifest. Repository
CI classifies it as a documentation path (`docs/**.md`). History derivation
needs a complete Git history. A shallow writer checkout stops with
`history-shallow-repository` and no publish. No repository-harness code
enumerates writer-owned paths, so this change needs no product edit.

## Clean-room integration receipt

The committed receipt was regenerated with the repository's own script:

```sh
bun run check:archctx-integration --arch-context-root <local-arch-context-checkout> \
  --revision 04b4c1084d78f7c2fa805f4cebd64a84bee84924
```

It exited 0 and reports `status: verified`, both packages 0.11.0,
`source.revision` `04b4c1084d78f7c2fa805f4cebd64a84bee84924`, unchanged
authoritative node schema `archcontext.node/v2` and unchanged digest. The
projection returned `human-action-required` with CodeGraph `unavailable`; the
receipt proves the packed provider contract, not a fully indexed projection. The
script used a new temporary HOME and state directory, confirmed daemon shutdown
before cleanup, and did not operate the global runtime.

## Limits

No release or deployment ran. No projection apply ran. Running 0.10.0 daemons
report `AC_RUNTIME_VERSION_UNSUPPORTED` until `daemon upgrade` runs; the
provider fails closed instead of mixing versions. The rolling writer adds
`history.md` only after it runs a repo-harness build that carries these pins.
