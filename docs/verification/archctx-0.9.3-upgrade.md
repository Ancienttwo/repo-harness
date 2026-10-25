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

## Evidence binding (recorded after the runs)

The tests and byte comparison ran in the dirty upgrade worktree before the first
commit. No tree digest was captured at test start. The resulting candidate is
`a0fa4516f582dcf7b4213911eb3b062caaff852e`, tree
`8e322cc315dc6131c23aa14e18b730e3436e09ed`.
The only file added after those runs and before that commit was this verification
note. The package pins, lock, tests and product sources were not edited between
the runs and that commit. This is author chronology, not a contemporaneous
commit-bound test receipt. A later read-only check found the worktree clean at
that candidate. The evidence-only follow-up changes this note and adds the raw
comparison output; it does not rerun or change the tested code.

The raw output is in `archctx-0.9.3-installed-bytes.json`. It is copied from the
original comparison output, not regenerated. The script exited 0. Each regular
file comparison uses an assertion; reaching the output means zero mismatches
among the 104 and 236 compared files. It does not count extra installed files,
compare modes, or validate symlinks. It does not execute package entrypoints.

### Actual comparison command

This command ran from the upgrade worktree. The temporary paths contain only
public npm artifacts and the comparison output. It can be reproduced from a
checkout with the paired dependencies installed. Do not treat a later run as the
original run.

```sh
mkdir -p /tmp/rh-archctx-093-evidence
curl -fLsS https://registry.npmjs.org/archctx/-/archctx-0.9.3.tgz -o /tmp/rh-archctx-093-evidence/archctx.tgz
curl -fLsS https://registry.npmjs.org/archctx-contracts/-/archctx-contracts-0.9.3.tgz -o /tmp/rh-archctx-093-evidence/contracts.tgz
python3 - <<'PYCOMPARE'
import tarfile,hashlib,json,pathlib,base64
out=[]
for name,file in [('archctx','archctx'),('archctx-contracts','contracts')]:
 p=pathlib.Path('/tmp/rh-archctx-093-evidence/'+file+'.tgz'); data=p.read_bytes(); count=0
 with tarfile.open(p) as t:
  for member in t.getmembers():
   if not member.isfile(): continue
   rel=pathlib.PurePosixPath(member.name).relative_to('package')
   assert '..' not in rel.parts
   assert t.extractfile(member).read()==(pathlib.Path('node_modules')/name/rel).read_bytes(), str(rel)
   count+=1
 out.append(dict(name=name,version=json.loads((pathlib.Path('node_modules')/name/'package.json').read_text())['version'],sha256=hashlib.sha256(data).hexdigest(),integrity='sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode(),installedRegularFilesCompared=count))
pathlib.Path('/tmp/rh-archctx-093-evidence/installed-bytes.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
PYCOMPARE
```

The URLs above are the `dist.tarball` values returned by `npm view` for the two
0.9.3 packages. Their `dist.integrity` values equal the SHA-512 values in the raw
output and the two package entries in bun.lock. This equality was inspected; the
comparison script itself does not read registry metadata or bun.lock.

Candidate Git blobs, read after commit:

| Path | Blob |
| --- | --- |
| package.json | `60ff292329fdcba945501cb727e60e73e48c7b4e` |
| bun.lock | `16d2b0050da97a42799593f5019c56b521bb7ad8` |
| tests/architecture-projection-e2e.test.ts | `3521418aebfddd8b22103e26f249193d8d2237a3` |
| tests/architecture-projection-provider.test.ts | `d7f1131312c39f31e53686730d776a904285ff90` |

## Installed CLI static capability readback

At candidate `cf820bbe8fce7c469ab5a6638166b55b44fc7db1` (tree
`eb0129e0044d1fafc94aa76fff90f378fdf5dfcd`), ran:

```sh
node node_modules/archctx/bin/archctx.mjs capabilities --json > /tmp/rh-archctx-093-evidence/capabilities.json
```

The command succeeded. Its unedited output is in
`archctx-0.9.3-capabilities.json`: package 0.9.3, capabilities/v1,
projection request/v1, result/v2, docs renderer/v6, and the advertised feature
list. The installed bundle's capabilities branch (lines 61795–61804 and
65633–65644) returns the static contract via runCapabilitiesCommand (61858),
before runtime creation. This is a real installed CLI execution, not a fake
provider test. It does not prove projection, daemon readiness, model migration,
or a clean-room integration pass. No daemon command or listen attempt ran.

The old clean-room script remains unrun. It records daemonRoot only after the
snapshot returns (lines 122–126); an exception during snapshot can skip cleanup.
Its final stop also lacks the startup environment and ignores the stop result.
These existing cleanup limits must be resolved or covered by an approved
isolated execution plan before using it as current integration evidence.

Raw capability output SHA-256: `849eb1a98e6eb9bd7e47e9e48b7ce238249c33b08533f4092e4eda4afc66a0d2`.

## Approved AXR5 cleanup repair (after the static capability readback)

The user approved repairing the verification script and preparing a bounded CI
route. The CI route is owned by a separate worker; this slice does not edit it.

AXR5 now assigns a private HOME and ARCHCONTEXT_STATE_DIR, removes an inherited
ARCHCONTEXT_LOCAL_STORE_PATH, and registers the daemon target before snapshot.
Snapshot, upgrade, projection and cleanup use the same runtime environment.
Cleanup checks the stop response and polls bounded status reads. It requires
`running: false` without a live lock owner or version-unsupported state. Failed
or malformed cleanup keeps the workspace. When both the operation and cleanup
fail, an AggregateError retains both failures. Receipt publication happens only
after successful cleanup. The historical readback is unchanged.

Validation on Node 24.18.0 / Bun 1.4.3:

- `bun run check:type`: pass.
- `bun run test:files tests/axr5-clean-room-runtime.test.ts --timeout 60000 --max-concurrency 1`: 10 pass, 40 assertions.
- An earlier development run had 9 pass / 38 assertions, before adding the malformed-status case and aligning the fake stop payload with upstream `stopping: true`. No failed run was replaced by a pass.

These tests inject commands and do not listen, run archctxd, or scan processes.
They cover contaminated environment variables, snapshot failure after cleanup
registration, stable cleanup environment, delayed shutdown/live lock, nonzero
exit, command timeout, malformed/failed envelopes, dual-error retention, and
unconfirmed shutdown. This is not an end-to-end execution of the build/install
script. No pre-fix executable RED receipt is claimed for the new extracted
helper. The old script's unsafe ordering and ignored stop were read directly.

Real clean-room integration is still blocked by the execution restriction;
there was no attempt to retry the earlier listen EPERM or choose another port.
The unchanged provider test for the old 0.9.1 receipt remains unresolved.
Required CI and independent review of this implementation delta are pending.
