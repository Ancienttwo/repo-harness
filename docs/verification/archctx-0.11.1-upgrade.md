# ArchContext 0.11.1 consumer upgrade verification

Baseline: `a5595b15d` (`origin/main`).
Environment: Node v24.22.1, Bun 1.4.3, macOS arm64.

Both exact dependency pins move from 0.11.0 to 0.11.1. The provider derives its
required version from `package.json`; there is no separate version constant.
0.11.1 fixes Ancienttwo/arch-context#445: a workspace `package.json` whose
`exports` subpath is a condition object (`{types, default}`) crashed `archctx
deps` and the debt read of `projection check` and `plan` with
`AC_UNCLASSIFIED_FAILURE` (`TypeError: target.replace is not a function`).

## Published package evidence

Source: `Ancienttwo/arch-context` `b3e185a049766c236df29a664e652939642654bd`,
the merge of arch-context PR #453 (`release/0.11.1`). It contains the #445 fix
(PR #448), the snapshot alternate-object read (#450) and the snapshot hook
isolation (#452). At verification time the repository has no `v0.11.1` tag and
no GitHub Release, so no Release asset comparison ran. The npm registry
published `archctx@0.11.1` at 2026-11-02T14:11:57Z and `archctx-contracts@0.11.1`
at 16:54:09Z, and reports `latest` 0.11.1 for both. The registry manifests have
no `gitHead` field. The registry `dist.integrity` values are:

- `archctx@0.11.1`: `sha512-i/nn1FD3fwTeVB+x1WxsB00Ju2EYyOLoHpeRejp/EnbRc8DlUFMqtW6gy+vBu1lLp79eW+2zsqEGhCAFHvL3fg==`.
- `archctx-contracts@0.11.1`: `sha512-YuZ8jzr/9Z2VsSRUGm2N1bqanq/TbPdNX26H0tj4gB8yFYPhMaAluIkmUhD8rwgLHB6/igcTjeJPdw5hxuywaQ==`.

Source binding: the 241 `src/`, `fixtures/` and `schemas/` members of the
registry `archctx-contracts` tarball are byte-identical to the same paths at
`b3e185a0` (`packages/contracts/src`, `packages/contracts/fixtures`,
`schemas`). The other member is the generated `package.json`.

Installed with `bun add --exact archctx@0.11.1 archctx-contracts@0.11.1`; only
the two pin lines of `package.json` changed. The script downloaded each
published npm tarball, compared every regular archive member with the
installed file, and recorded SHA-256 and SHA-512. Both SHA-512 values equal
the registry `dist.integrity` values and the two package entries in
`bun.lock`. The same script reproduces `archctx-0.11.0-installed-bytes.json`
byte for byte against a 0.11.0 install. The raw output is
`archctx-0.11.1-installed-bytes.json`.

- `archctx@0.11.1`: 106 regular files match; SHA-256 `cd56a5ed4540d6144908c5a728dd9f82bf9a55a3468927b574d70158c256f5bc`.
- `archctx-contracts@0.11.1`: 242 regular files match; SHA-256 `c25da621b2cca4838ff4563289d2021cc2c1409b285965cc3229ba30c5cb6218`.

This checks installed bytes, not daemon behavior. The comparison does not count
extra installed files, compare modes, validate symlinks or execute package
entrypoints.

## Static capability readback

```sh
node node_modules/archctx/bin/archctx.mjs capabilities --json
```

Exit 0. The unedited output is `archctx-0.11.1-capabilities.json` (SHA-256
`11c7bdb7dba140d37c6af8918b117f2336af04b5612884074831f3ca49ec4173`). It starts
no daemon and opens no listener. Compared with `archctx-0.11.0-capabilities.json`,
the only difference is `package.version`.

## Differences from 0.11.0

| Surface | 0.11.0 | 0.11.1 |
| --- | --- | --- |
| Capabilities, protocol ids, renderers, 39 features | — | unchanged |
| `archctx-contracts` schemas | — | unchanged; `src/` changes only `failure.ts` and `product-version.ts` |
| Failure reasons | — | adds `workspace-exports-unsupported` (`AC_SCHEMA_INVALID`, facts `manifestPath`, `subpath`) |
| `code-facts-snapshot-limit-exceeded` | no facts | facts name the exceeded limit and the source, Git and index sizes |
| Workspace `exports` read | casts the field to a string map | one normalizer: a condition object takes the first of `types`, `import`, `default`, `require`; another shape fails with `workspace-exports-unsupported` |
| `archctx deps` | relabels every workspace read error as `deps-workspace-invalid` | keeps a classified workspace failure |
| CodeGraph snapshot | copies Git objects; repository hooks can run | reads Git objects through an alternate; runs no repository hook |
| `archctx` package files | 106 | 106; only `package.json`, `assets/catalog.yaml` (digest) and `bin/archctx.mjs` differ |
| Practice catalog digest | `sha256:855b3458…` | `sha256:3a92b394…` (digest input includes the product version) |

repo-harness maps no changed reason code. The provider decodes
`workspace-exports-unsupported` as an ordinary typed archctx error, so no
product change is necessary.

## Clean-room integration receipt

The clean room now builds the fixture's CodeGraph index with the package-local
CodeGraph, and the fixture capability imports a workspace package whose
`exports` is `{".": {types, default}}`. archctx reads import edges only from a
ready index, so the earlier receipt (`codeGraphStatus: unavailable`) could not
reach the #445 code path. The script now stops when the index is not ready.

```sh
bun run check:archctx-integration --arch-context-root <local-arch-context-checkout> \
  --revision <revision>
```

- At `v0.11.0`: exit 1. `runArchitectureProjection` fails with
  `AC_UNCLASSIFIED_FAILURE`, `reasonCode: failure-unclassified`,
  `errorClass: TypeError`.
- At `b3e185a049766c236df29a664e652939642654bd`: exit 0, `status: verified`,
  both packages 0.11.1, unchanged authoritative node schema
  `archcontext.node/v2` and digest. The projection returns
  `human-action-required` with `codeGraphStatus: ready`. The committed receipt
  is this run.

The script used a new temporary HOME and state directory, confirmed daemon
shutdown before cleanup, and did not operate the global runtime.

## Limits

No release or deployment ran. No projection apply ran. Running 0.11.0 daemons
report `AC_RUNTIME_VERSION_UNSUPPORTED` until `daemon upgrade` runs; the
provider fails closed instead of mixing versions. Consumers get the fix only
after a repo-harness release that carries these pins.
