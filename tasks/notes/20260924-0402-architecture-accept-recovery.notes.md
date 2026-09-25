# Implementation Notes: architecture-accept-recovery

> **Status**: Active
> **Plan**: plans/plan-20260924-0402-architecture-accept-recovery.md
> **Contract**: tasks/contracts/20260924-0402-architecture-accept-recovery.contract.md
> **Review**: tasks/reviews/20260924-0402-architecture-accept-recovery.review.md
> **Last Updated**: 2026-09-24
> **Lifecycle**: notes

## Design Decisions

- `projection-acceptance.ts:175-208` keeps the provider result only in memory until refresh completes. A refresh exception loses that consumer copy; retry attempts apply again.
- The installed runtime is `archctx@0.5.10`. Its public `projection recover --request-json` takes lookupKey/applyId and returns proof plus first-delivery signals, not the original full result.
- Source audit in `Ancienttwo/arch-context` at `4fb7b7d5748cb59095c7cb0f0e43c5e2d3988bb3` (referenced source files clean; unrelated documentation WIP preserved): `packages/surfaces/cli/src/main.ts:1446-1465` shows normal apply consumes recovery delivery before returning; `:1620-1624` omits signals on repeat. `packages/contracts/src/projection.ts:592-594` forbids repeated signals on already-delivered results.
- `packages/local-runtime/runtime-daemon/src/index.ts:2985-2994` returns stored proof immediately for already-delivered receipts, so it is not fresh verification. The private daemon SDK is not a supported downstream substitute for a missing public CLI interface.

## Deviations From Plan Or Spec

- A repo-harness-only wrapper cannot safely recover the existing 03c state. The approved prerequisite is a versioned, read-only public archctx receipt lookup that returns the original provider result/signals and revalidates current fixed point on every read, without consuming delivery state.
- After that prerequisite, the consumer records intent before provider invocation and the original result before refresh; existing per-action checkpoints support retry. Do not claim strict exactly-once shell action execution.
- Original 03c was inspected read-only: eight generated docs modified, three unresolved candidates, zero consumer acceptance receipts and no invalid artifacts. No original files, candidate data or provider receipts were edited.

## Tradeoffs Considered

| Option | Decision | Reason |
|---|---|---|
| Pending result plus current recover | Incomplete | Misses provider commit before response/pending write, and cannot rescue the existing receipt. |
| Rebuild result/signals from candidate or proof | Reject | These do not carry the original provider semantic evidence. |
| Public repeatable receipt read with fresh proof plus consumer pending | Required | Preserves provider authority and closes both interruption windows. |

## Open Questions

- User approved two-repository source repair on 2026-09-24. Release remains separately authorized.
- The original approval reference is reusable only for its exact candidate and verified committed output. Stale-candidate retirement remains separate.

## Evidence Links

- `.ai/harness/runs/accept-recovery/pre-fix.log`: actual provider regression run, 30 pass / 1 fail, `PRE_FIX_EXIT=1`.
- Regression guard: `tests/architecture-projection-provider.test.ts`. Provider commit then refresh failure, followed by same-approval retry, reproduces the reported precondition failure.
- `bun run check:type` and diff whitespace check passed in the diagnosis run. No production source changed.
- Canonical acceptance, PR, merge and release have not run. No approval or receipt is manufactured.

## Review correction: uncommitted intent

Source gate found that an intent written before provider invocation cannot require a committed receipt forever: a pre-call crash or launch failure may leave no provider receipt. The public protocol therefore includes exact-request `projection-apply-absence/v1`, checked against the current snapshot under provider writer ownership. Only an intent with no recorded result may retry normal apply on this typed evidence. Explicit recovery never applies. Provider apply rechecks committed receipt under the writer lock before side effects; generic failures never authorize replay. This correction stays within the approved crash recovery scope.

Local package integration uses unpublished source tarballs named 0.5.10 in an isolated node_modules. These are test artifacts, not a registry release; package.json and bun.lock remain registry pins. Downstream shipping and canonical acceptance must not treat this install as reproducible published dependencies.

## Source verification boundary

The implementation worker reports the final three focused files at 59 pass / 0 fail and `bun run check:type` pass using the isolated unpublished provider/contracts packages. All nine root integrity commands pass; task-sync binds this final substantive diff below. The same source gate rechecked its finding and returned PASS after reading the focused test and typecheck logs. Real packaged CLI apply/readback composition succeeded in a disposable fixture with fault-injected consumer refresh actions. `integration-artifact-check.log` confirms one final acceptance receipt and one refresh receipt; `isolated-daemon-stop.log` confirms running:false, the former PID absent, and no connection/lock files. The evidence lives in `.ai/harness/runs/accept-recovery/`. No canonical AcceptanceReceipt or release is claimed.

> **Substantive Change SHA256**: `sha256:7aecf51af853199de1bd4e3bb81962dc5fde4891b06becf0d06775cfbaae6f1c`

## Remaining delivery boundary

The two source diffs are staged, not committed or published. The consumer depends on new public exports absent from registry 0.5.10, so a clean frozen install cannot ship this patch yet. Publish the reviewed archctx/archctx-contracts source as a new version, then update the exact consumer pins through Bun and prepare canonical acceptance against that reproducible install. The native source gate does not create the contract-required codex-plugin AcceptanceReceipt. Shared daemon replacement and original 03c recovery remain unexecuted. Original 03c read-only status still reports 3 candidates, 0 receipts, 3 unresolved, 0 invalid.

## Approved publication boundary

The user approved archctx/archctx-contracts 0.5.11 publication and downstream canonical acceptance, then added repo-harness 0.19.3 publication and selected Web Auth. Both consumer version constants, active policy producers and fixtures use 0.5.11; helpers remain projections of scripts. The worktree was fast-forwarded to main `2c00d4da5d0d769223791791c01ae6b501ab2c5f` before the release metadata changes. Product/skill/template version consistency passes at 0.19.3.

A release now requires the existing full gate, so the Verification Plan uses one expensive `check:release` check instead of repeating its constituent focused tests and integrity lanes. Version consistency remains an explicit separate check. Run the full gate only after the registry lock is generated and the subject is frozen. The existing source review is not the final canonical AcceptanceReceipt.

The 0.19.2 public tarball contains both architecture helper paths. The original failed refresh selected an incomplete local source-root override; publishing does not repair persistent user shell configuration. Global install and shared daemon replacement remain separate operations.

## Published dependency integration

On 2026-09-24 both archctx packages were published as 0.5.11 using npm Web Auth. Registry metadata reports latest 0.5.11; downloaded archives match the tested artifacts byte for byte. A fresh registry install exposes the readback capability and contract validators without creating runtime state. Bun installed both exact registry dependencies and generated the lock changes; no unrelated resolution changed. The full 0.19.3 release gate and canonical acceptance remain pending.

## Release gate blocker outside the recovery scope

The first frozen `release-full` run failed `tests/characterization/repair-campaign-authority-freeze.test.ts` on macOS, and the same file fails on the main-equivalent tree. `scripts/heartbeat-triage.sh` fed `printf '%s\n' "$output"` into `awk 'NF { print; exit }'` under `pipefail`; awk exiting after the first line leaves the writer with SIGPIPE, so the helper exits 141. Linux CI never hit it. The summary now reads through a here-string, which has no writer to kill. This is the single directly blocking out-of-scope fix admitted to this slice; the contract scope was widened for the helper and its projection. The other failure, `tests/harness-benchmark-matrix.test.ts` "packs exactly one external immutable runtime artifact", is also pre-existing: with `REPO_HARNESS_TEST_EXPENSIVE=1` it times out on the main-equivalent tree without load, because `prepareBenchmarkRuntimeArtifact` measured 34.4 s (bsdtar, 388 MB staged) against a 30 s test budget. Main CI never runs the release lane. With owner approval the budget for that single release-lane case is 120 s; this is the second admitted out-of-scope fix.

## Rebased integration base

On 2026-09-25 the branch was rebased cleanly onto `7afcbc46d0b623442e98a92ca42d093619576e64` (PR #450). The release gate diff base follows it. archctx bug-fix PRs merged upstream after 0.5.11 remain unpublished; no newer archctx registry version exists, so the exact 0.5.11 pins stay. Publishing a new archctx version is not part of this authorization.

The ignored `.ai/harness/runs/accept-recovery/pre-fix.log` was lost with the removed original worktree. It was regenerated on 2026-09-25 by running the fix commit's regression case `recovers an accepted apply when refresh fails after the provider commit` against the rebased pre-fix parent `db2be365`; it fails with `AC_PRECONDITION_FAILED` from `projection-acceptance.ts:178`, matching the recorded root cause. The log header records the source tree, the single removed fix-only import and the exact command.

## Release gate blocker: machine TMPDIR bloat (2026-09-25)

`verify-sprint --prepare-acceptance` now passes projection and contract evidence. The first run without a CodeGraph index produced a false `verified-flow-proof-changed` candidate; after `codegraph init` it was retired through `architecture-projection reconcile` (deterministic proof, result `noop`, no human approval used). The worktree-local archctx daemon was a 0.5.10 process started from the global install; it is now 0.5.11 (worktree-scoped lock only; global install and other daemons untouched).

Two checks still fail on this machine only. `release-full` stopped earlier on that stale candidate. The regression guard file fails `bounds a real provider process tree whose descendant keeps captured pipes open` and `charges Node runtime selection to the caller deadline` with ETIMEDOUT. The same case fails on main `7afcbc46`, so the candidate did not introduce it. Measured root cause: `$TMPDIR` holds about 713k entries, mostly leaked `byok-*` test directories from another repository. Starting `src/effects/process-supervisor.ts` with cwd under `$TMPDIR` takes about 10.7 s versus 71 ms from the repository, because the fixture processes resolve through that directory. No test budget was raised and no product code changed. Clearing the stale temporary entries is a machine-level operator decision; rerun the frozen gate afterwards.

Update: with a clean empty `TMPDIR` for the gate run (no deletion of the machine temp directory), the regression guard passes 35/0 and the forced `release-full` rerun completes its test lanes. Six cases failed in that run. Three files (`tests/cli/global-runtime-init.test.ts`, `tests/effects/brc10-lifecycle.test.ts`, `tests/verify-contract.test.ts`) pass 43/0, 13/0 and 38/0 when rerun alone, so they are load timeouts (load average about 8.6 during the gate). `tests/auto-campaign-skill.test.ts` fails deterministically on this candidate and on main `7afcbc46`: `scripts/sync-codex-installed-copies.sh` rsyncs the whole source root and its `common_excludes` omit `.codegraph/`. The release worktree copies a 120M index and exceeds the 60 s test timeout. The main checkout also holds `.codegraph/daemon.sock`, which macOS openrsync cannot recreate (`mkstempsock: Invalid argument`). Hosted CI has no CodeGraph index, so it never exercises this path. The minimal repair is `--exclude='.codegraph/'`, but that script is outside this contract's allowed paths. Admitting a third out-of-scope repair needs an owner decision.

Correction: `.codegraph/` is not the cause of the release-worktree timeout. With the index moved behind an out-of-tree symlink the case still stops at 60 s. The timeout comes from `write_owner_marker` in `scripts/sync-codex-installed-copies.sh`. It digests every copied file through a per-file shell loop (`printf` plus `cat`) for each of three installed copies of the roughly 5k-file source tree, `tasks/archive` included. At about 2.6 ms per process spawn on this machine, that exceeds the script's 60 s budget; hosted Linux CI stays under it. The missing `.codegraph/` exclude remains a separate defect: macOS openrsync fails on `.codegraph/daemon.sock` whenever a CodeGraph daemon runs in the source checkout. Both repairs are outside this contract's allowed paths.

## Third release-gate repair: installed-copy hashing (2026-09-25)

The owner approved both repairs for 0.19.3 on 2026-09-25 and the contract scope was widened for them. `managed_tree_hash()` in `scripts/sync-codex-installed-copies.sh` now calls `skill-surface-select.ts managed-tree-hash`, which prints the exported `hashManagedTree()` from `src/cli/installer/install-profile.ts`. That function already produced the identical stream for the TS installer, so owner-marker hashing now has one authority and one process per copy instead of one per file; a failed call exits non-zero with a clear message. The marker JSON format is unchanged. A parity test in `tests/installed-copy-sync.test.ts` runs the retired shell body against the new subcommand over a tree with binary/NUL bytes, nested directories, a symlink and nested owner markers, so markers written by existing installs still verify. `common_excludes` now also skips `.codegraph/`. The fixture seed copies all of `src/` because the subcommand loads the installer module lazily.

After the installed-copy hash repair, the frozen gate's only failures were 14 timeouts (20-60 s) across eight files. All eight pass together when rerun alone (100 pass, 0 fail) with the same clean `TMPDIR`. The machine carries a steady load of about 8.5 on 12 cores from unrelated processes, so the Verification Plan now runs the same full suite with `BUN_TEST_JOBS=2` instead of 4. Coverage, isolation and per-file concurrency are unchanged.


## Codex acceptance review findings (2026-09-25)

P2 (apply intent blocked adoption) reproduced: `an approved adoption plan proceeds after an apply intent that the provider proves absent` failed with `recovery does not support adoption` from `projection-acceptance.ts:199`. An adopt request over an existing intent now reads the pending apply journal, requires the same approval, no recorded result and the exact apply counterpart of the current request, then asks the provider readback for that apply request. Only a validated `projection-apply-absence/v1` bound to the current snapshot lets the approved adoption run; a recorded result or a committed readback refuses the switch, readback errors propagate, and `--recover` with adoption still refuses. The pending apply intent stays in place as history. Guards: the uncertain/recorded/foreign-approval unit case and the provider case where a committed apply readback refuses adoption with one semantic call.

P1 (refresh-owned snapshot mutation strands recovery) reproduced with a real `scripts/architecture-event.ts sync-context-map` write during the default refresh sequence followed by a failing `capability-context-request`: the retry failed `refresh signal is stale` at `projection-acceptance.ts:180`, before the pending-request and readback snapshot checks that would also reject it. The archctx 0.5.11 readback invariant requires the current worktree digest to equal the approval snapshot, so a fresh provider readback cannot be the resume proof after such a mutation. With owner approval the contract scope was widened to `refresh-consumer.ts`. `consumeArchitectureRefreshSignals` now calls an optional observer after every durable progress checkpoint and final refresh receipt, and `architectureRefreshEvidenceDigest` digests that evidence (receipt, else progress) per signal. Apply-mode acceptance uses the observer to record, in the pending journal next to the persisted provider result, the snapshot captured right after the checkpoint plus the evidence digest. A retry whose current snapshot differs from the approval snapshot resumes from the pending request and result, without readback or apply, only when the current snapshot equals the last recorded one exactly, the evidence digest still matches and the same approval is used. Partial writes from the failed, uncheckpointed action, unrelated edits and altered progress evidence fail closed. A crash between a checkpoint write and its journal record also fails closed; that window is accepted rather than tolerated. Guards: the resume regression plus the partial-write and unrelated-edit/evidence cases in `tests/architecture-projection-provider.test.ts`.
