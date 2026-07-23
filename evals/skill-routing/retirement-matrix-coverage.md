# Retirement and Projection Matrix — Coverage Map

> **Slice**: SSD-07 phase A (D2)
> **Plan source**: `plans/plan-20260715-1140-skill-surface-discovery-convergence.md`, "Retirement and projection matrix" table (Verification Plan section)
> **Purpose**: for every dimension value in the plan's matrix — profile x host x projection x lifecycle x ownership x failure-injection — cite the existing test (file:line) that covers it, or the new probe added in this slice. Close only the cells found genuinely uncovered; do not duplicate what already exists.

## Methodology

The plan's table is a 4 x 2 x 2 x 5 x 3 x N cross product (240+ combinations before counting failure-injection sub-cases). No single test, and no realistic new probe, exercises the literal full cross product — nor does the existing test suite: every existing test proves one or more dimensions via a representative combination, the same way this map does. This document therefore:

1. Cites, per dimension, **every value** against at least one concrete test.
2. Cites a table of **representative combined scenarios** — the actual tests, each spanning several dimensions at once — matching how the suite is really organized.
3. Names the cells that investigation showed were **genuinely uncovered**, with the new probe that closes each one, and the cells that are **deliberately deferred** with the engineering reason.

Two source files own almost all of this evidence:

- `tests/install-profiles.test.ts` — the `install-profile.ts` transaction/ownership/rollback layer (CLI/hooks/effective-state/CodeGraph/agent-fleet component snapshotting; always operates on a fixture-materialized host projection, host-agnostic by construction since it snapshots whatever paths `installProfileHostMutationPaths()` returns for both `.codex` and `.claude`).
- `tests/installed-copy-sync.test.ts` — `scripts/sync-codex-installed-copies.sh`, the actual copy/link facade-projection mechanism (real subprocess invocations of the shell script, real rsync/symlink capability probing).

These are two genuinely different subsystems (confirmed by reading `src/cli/installer/install-profile.ts` in full: it contains zero `rsync`/copy-vs-link logic; that logic lives only in the shell script, invoked as a subprocess by `init.ts`/`global-runtime.ts`).

## Dimension: Profile (minimal / standard / product-planning / strict)

| Value | Covered by |
|---|---|
| `minimal` | `tests/install-profiles.test.ts:99` (dry-run plan), `:494` (upgrade-from baseline), `tests/installed-copy-sync.test.ts:152` (facade retirement), `:263` (4-profile loop) |
| `standard` | `tests/install-profiles.test.ts:106` (apply/idempotent), `:173` (discoverManagedSurfaces), `tests/installed-copy-sync.test.ts:307`/`:359` (downgrade target), `:263` |
| `product-planning` | `tests/install-profiles.test.ts:125` (state machine-readable), `:284` (planning probe), `:456` (downgrade source), `tests/installed-copy-sync.test.ts:307`/`:359` (bootstrap source), `:263` |
| `strict` | `tests/install-profiles.test.ts:116` (switch/rollback), `:366` (transaction-owned removal), `:401` (ownership-path rejection), `:432` (reinstall), `:494` (upgrade target), `tests/installed-copy-sync.test.ts:263` |

All four profile literals are additionally smoke-tested against the **packed npm tarball** (not the dev source tree) by the new probe `evals/skill-routing/packed-profile-discovery-probe.sh` (see "Genuinely uncovered cells" below).

## Dimension: Host (codex / claude)

| Value | Covered by |
|---|---|
| `codex` | `tests/install-profiles.test.ts` (all tests — `installProfileHostMutationPaths(env)` returns both `.codex` and `.claude` paths, e.g. `:299-306`); `tests/installed-copy-sync.test.ts:44` (`codexSkills` root), `tests/cli/init.test.ts:868` (`target=codex`) |
| `claude` | `tests/installed-copy-sync.test.ts:44` (same test also asserts on `claudeSkills` root, since `sync_command_facades()` runs identically per host with no host-specific branching — `evals/skill-routing/discovery-baseline.json`'s own `command_facade_matrix_note`); `tests/cli/init.test.ts:868` (`target=claude`) |
| Host-**aware** placement (provider-skill / cross-review packages differ by host, not just facades) | `tests/cli/init.test.ts:831` ("installs repo-harness-cross-review on both hosts; claude-plan stays Codex-only"), `:868` ("respects target=claude ... and target=codex ..."); `tests/cli/global-runtime-init.test.ts:366` ("strict installs bundled cross-review capability..."), `:398` ("product-planning marketplace skills do not install the Strict-only cross-review capability") |

## Dimension: Projection (copy / link)

| Value | Covered by |
|---|---|
| `copy` (rsync) | `tests/installed-copy-sync.test.ts:44` ("registers each command facade as a standalone skill in copy mode" — no `AGENTIC_DEV_LINK_INSTALLED_COPIES` override; per `scripts/sync-codex-installed-copies.sh:33-43`, unset + an explicit `CODEX_SKILLS_ROOT` override means the default resolves to **copy mode**, so this test exercises a real rsync invocation, not merely the missing-rsync error path); `:307` and `:359` (retirement/preservation, same real-rsync default) |
| `link` (symlink) | `tests/installed-copy-sync.test.ts:107` ("can maintain local skill roots as source-backed aliases", `AGENTIC_DEV_LINK_INSTALLED_COPIES=1`); `:152` (minimal-profile retirement in link mode); `tests/install-profiles.test.ts`'s whole fixture layer (`writeManagedHostSurfaces` always pre-materializes the canonical skill dir as a symlink) |
| copy-mode capability absence (rsync missing) | `tests/installed-copy-sync.test.ts:440` ("copy mode reports explicit unsupported mode when rsync is missing") |
| link-mode capability absence (symlink creation fails) | `tests/installed-copy-sync.test.ts:511` ("link mode reports explicit unsupported mode when symlink creation fails") |
| link-mode capability presence without rsync at all | `tests/installed-copy-sync.test.ts:475` ("link mode does not require rsync when symlinks are supported") |

**Finding**: "copy-mode rsync paths" (named as a *likely* gap in the dispatch) is already exercised with a real rsync binary for both installation (`:44`) and retirement (`:307`, `:359`) — not merely the "rsync absent" error-path tests. No new probe needed for this cell.

## Dimension: Lifecycle (fresh / reinstall / upgrade / downgrade / rollback)

| Value | Covered by |
|---|---|
| `fresh` | Every test's first `applyInstallProfile`/sync call against an empty disposable HOME, e.g. `tests/install-profiles.test.ts:106` (first half), `tests/installed-copy-sync.test.ts:44` |
| `reinstall` (same profile, re-applied) | `tests/install-profiles.test.ts:106` ("apply is idempotent" — same profile twice, transaction id/applied_at unchanged), `:432` ("reinstall refreshes ownership for an already-owned CodeGraph projection" — same profile twice, content hash refreshed) |
| `downgrade` (higher profile -> lower) | `tests/install-profiles.test.ts:116` (strict -> minimal), `:366` (strict -> minimal via transaction), `:456` (product-planning -> minimal); `tests/installed-copy-sync.test.ts:307` (product-planning -> standard, real rsync), `:359` (same, with a modified copy) |
| `upgrade` (lower profile -> higher) | **Genuinely uncovered before this slice** — see "Genuinely uncovered cells" below; closed by new test `tests/install-profiles.test.ts:494` |
| `rollback` | `tests/install-profiles.test.ts:116` (`rollbackInstallProfile(env).profile` restores `'strict'`), `:308` (`rollbackInstallHostTransaction` restores prior bytes and removes later mutations), `:494` (new upgrade test also exercises rollback back to `'minimal'`) |

**Finding**: every existing multi-call profile-transition test in `tests/install-profiles.test.ts` goes downgrade (higher -> lower) or reinstall (same profile); none goes ascending. This is a real gap, distinct from what the dispatch's own "likely" hint named (it flagged downgrade, which turned out to be well covered; the actual gap was the mirror-image direction). Closed by the new test below.

## Dimension: Ownership (pristine package-owned / modified package-owned / unowned)

| Value | Covered by |
|---|---|
| pristine package-owned (retire cleanly) | `tests/installed-copy-sync.test.ts:152` ("minimal profile removes an exact package-owned command facade"); `:307` ("retires an owner-marked facade once its canonical source and profile selection are both gone") |
| modified package-owned (drifted, must preserve + fail closed) | `tests/installed-copy-sync.test.ts:226` ("modified owner-marked canonical copy fails closed and is preserved"); `:359` ("preserves and reports a modified facade even after its canonical source is removed") |
| unowned (no valid owner marker, must preserve + fail closed) | `tests/installed-copy-sync.test.ts:186` ("unknown facade fails closed before changing any managed surface"); `:407` ("unknown canonical directory fails closed without rm -rf") |
| unowned at the `install-profile.ts` transaction layer (ownership path outside canonical managed surfaces) | `tests/install-profiles.test.ts:401` ("profile switch rejects ownership paths outside canonical managed surfaces") |
| unowned staging registry preserved across a profile change | `tests/install-profiles.test.ts:456` ("downgrade preserves a user-owned staging skill registry...") |

## Dimension: Failure injection (at host Skill mutation stages)

| Stage | Covered by |
|---|---|
| Mid-transaction process failure (real CLI subprocess, injected via a faked `bunx` exiting non-zero after a partial write) | `tests/install-profiles.test.ts:330` ("failed install compensates earlier host writes and never commits state") |
| Host transaction rollback restores prior bytes and removes later-created paths | `tests/install-profiles.test.ts:308` ("host transaction restores prior bytes and removes later mutations") |
| Commit discards only backups (no false restore after success) | `tests/install-profiles.test.ts:356` ("committing a host transaction only discards its backups") |
| Unowned/unknown destination present at mutation time | `tests/installed-copy-sync.test.ts:186`, `:407` |
| Modified/drifted destination present at mutation time | `tests/installed-copy-sync.test.ts:226`, `:359` |
| Missing copy-mode capability (rsync) at mutation time | `tests/installed-copy-sync.test.ts:440` |
| Missing link-mode capability (symlink) at mutation time | `tests/installed-copy-sync.test.ts:511` |
| Ownership manifest naming a path outside canonical managed surfaces | `tests/install-profiles.test.ts:401` |
| Malformed/legacy persisted state (component/profile mismatch, malformed rollback history) | `tests/install-profiles.test.ts:143`, `:156`, `:243` |

## Representative combined scenarios (as the suite actually organizes them)

| Test | File:Line | Profile(s) | Host(s) | Projection | Lifecycle | Ownership | Failure |
|---|---|---|---|---|---|---|---|
| apply is idempotent | `install-profiles.test.ts:106` | standard | both | link (fixture) | fresh, reinstall | pristine | — |
| switch lists removals and rollback restores the previous profile | `install-profiles.test.ts:116` | strict->minimal | both | link (fixture) | downgrade, rollback | pristine | — |
| host transaction restores prior bytes and removes later mutations | `install-profiles.test.ts:308` | minimal | both | link (fixture) | fresh | pristine | mid-transaction abort |
| failed install compensates earlier host writes | `install-profiles.test.ts:330` | product-planning | both | link (fixture) | fresh | pristine | injected process failure (bunx exit 19) |
| profile switch removes only transaction-owned optional surfaces | `install-profiles.test.ts:366` | strict->minimal | both | link (fixture) | downgrade | pristine + unowned (`user-skill` lock entry) | — |
| reinstall refreshes ownership for an already-owned CodeGraph projection | `install-profiles.test.ts:432` | strict, strict | both | link (fixture) | reinstall | pristine, modified-then-refreshed | — |
| downgrade preserves a user-owned staging skill registry | `install-profiles.test.ts:456` | product-planning->minimal | both | link (fixture) | downgrade | unowned staging registry preserved | — |
| **profile upgrade adds ownership for newly required components** (new) | `install-profiles.test.ts:494` | minimal->strict | both | link (fixture) | **upgrade**, rollback | pristine | — |
| registers each command facade as a standalone skill in copy mode | `installed-copy-sync.test.ts:44` | standard | both | **copy (real rsync)** | fresh | pristine | — |
| can maintain local skill roots as source-backed aliases | `installed-copy-sync.test.ts:107` | standard | both | link | fresh | pristine | — |
| minimal profile removes an exact package-owned command facade | `installed-copy-sync.test.ts:152` | minimal | codex | link | downgrade (retire) | pristine | — |
| unknown facade fails closed before changing any managed surface | `installed-copy-sync.test.ts:186` | minimal | codex | link | fresh | **unowned** | fail-closed before mutation |
| modified owner-marked canonical copy fails closed and is preserved | `installed-copy-sync.test.ts:226` | minimal | codex | **copy** | reinstall attempt | **modified** | fail-closed, drift detected |
| wires repo-harness-product / repo-harness-ship per profile | `installed-copy-sync.test.ts:263` | all 4 | codex | copy (default) | fresh x4 | pristine | — |
| retires an owner-marked facade once source+selection are gone | `installed-copy-sync.test.ts:307` | product-planning->standard | both | **copy (real rsync)** | downgrade (retire) | pristine | — |
| preserves and reports a modified facade after source removal | `installed-copy-sync.test.ts:359` | product-planning->standard | both | copy | downgrade attempt | **modified** | fail-closed, drift detected |
| unknown canonical directory fails closed without rm -rf | `installed-copy-sync.test.ts:407` | minimal | codex | link | fresh | **unowned** | fail-closed |
| copy mode reports explicit unsupported mode when rsync is missing | `installed-copy-sync.test.ts:440` | — | codex | copy | fresh | — | **missing rsync capability** |
| link mode does not require rsync when symlinks are supported | `installed-copy-sync.test.ts:475` | — | codex | link | fresh | pristine | — |
| link mode reports explicit unsupported mode when symlink creation fails | `installed-copy-sync.test.ts:511` | — | codex | link | fresh | — | **missing symlink capability** |

## Genuinely uncovered cells identified, and how each was closed

### 1. Profile upgrade direction (ascending lifecycle transition)

**Investigation finding**: every multi-call profile-transition test in `tests/install-profiles.test.ts` goes downgrade (`strict`/`product-planning` -> `minimal`) or reinstall (same profile twice). None goes ascending (e.g. `minimal` -> `strict`, adding components/ownership entries without a prior removal step). This is the actual gap the dispatch's speculative "downgrade" hint pointed near, but in the opposite direction from what it named — investigation showed downgrade itself is well covered (see the Lifecycle table above), while upgrade was not covered at all.

**Closed by**: new test `tests/install-profiles.test.ts:494` ("profile upgrade adds ownership for newly required components without disturbing prior ones") — applies `minimal`, then materializes the additional `strict`-only host surfaces on top (without removing anything), applies `strict`, and asserts: the new components (`agent-fleet`, `cross-model-acceptance`) are present; `plan.current_profile` reads back `'minimal'` and `plan.remove` is empty (a pure addition, not a switch); drift stays `'consistent'`; the prior minimal-profile projection (a file inside the canonical skill dir) is byte-unchanged after the upgrade; and rollback restores `'minimal'`.

**Verification**:
```
bun test tests/install-profiles.test.ts
 25 pass
 0 fail
 99 expect() calls
Ran 25 tests across 1 file. [2.04s]
```

### 2. Packed-tarball disposable-BUN_INSTALL install smoke across profiles

**Investigation finding**: `scripts/check-tarball-install-smoke.sh` (the repo's only existing packed-npm-tarball smoke) never calls `install`/`update` at all and never varies `--profile` — it exercises `adopt`, `status`, `state resolve`, the MCP bridge, `sprint-backlog`, hook probes, and `capability-resolver.ts`, all against one implicit default profile. Every profile-aware test in `tests/install-profiles.test.ts` and `tests/installed-copy-sync.test.ts` invokes the CLI from the **dev source tree** (`src/cli/index.ts` directly, or `AGENTIC_DEV_SOURCE_ROOT` pointing at a fixture tree) — never from an npm-packed, installed artifact. This is a real, distinct incremental risk: packaging (`package.json`'s `"files"` allowlist) could silently drop a file the profile/skill-surface discovery path needs, or the packed CLI binary could behave differently than the dev-tree invocation.

**Scope note (why this was not folded into `scripts/check-tarball-install-smoke.sh`)**: that script is the architecturally correct home for this check (it already does `npm pack` + disposable-root smoke, and D4 already runs it as a required final gate) — but it is **not** in this contract's `allowed_paths`. Per the contract's stop condition ("Stop and hand back to the parent if a required edit falls outside this contract's exact `allowed_paths`"), it was not edited. Instead, a new standalone script was added inside the already-allowed `evals/skill-routing/` directory. **Recommend the orchestrator decide** whether to fold this probe into `scripts/check-tarball-install-smoke.sh` via a contract amendment (matching the SSD-06 precedent of orchestrator-ratified scope widenings) so it becomes a permanent required gate rather than a standalone evidence script.

**Closed by**: new script `evals/skill-routing/packed-profile-discovery-probe.sh` — packs the current tree with `npm pack`, installs the tarball into a fresh disposable app dir with `bun add`, then for each of the four profile literals runs the packed `repo-harness install --profile <X> --dry-run --json` binary against its own disposable `HOME`/`BUN_INSTALL` root and asserts the returned plan is well-formed (`requested_profile` echoes back, `current_profile` is `null`, `install` is non-empty, `remove` is empty, and no `install-state.json` was written despite `--dry-run`). It also statically asserts the packed tarball's file listing still contains `assets/skill-commands/manifest.json`, `src/core/skill-surface/catalog.ts`, and `scripts/skill-surface-select.ts` (a defense-in-depth check mirroring `check-tarball-install-smoke.sh`'s own required-files pattern, currently passing trivially since `package.json` ships `assets/`, `scripts/`, and `src/` wholesale — it exists to catch a *future* narrowing of that allowlist).

**Deliberately deferred within this same probe**: a real (mutating) install + `update` + facade-directory diff for `product-planning`/`strict`. Those two profiles gate Waza/mermaid skill installation on `externalSkills=true`, which invokes real `bunx skills add ...` over the network — unsuitable for a probe intended to run offline as repo evidence. That exact real-install path (with `bunx` faked via a `PATH` override, never touching the network) is already exercised at the dev-tree level by `tests/install-profiles.test.ts:330` ("failed install compensates earlier host writes and never commits state"). The underlying facade-selection *logic* the packed tarball would exercise is proven byte-identical to the dev tree via this slice's own tree-hash freeze (`evals/skill-routing/final-subject-freeze.json`), so the incremental value of a full mutating packed-tarball run beyond the dry-run + packaging-fidelity check here is low relative to its network-dependency cost.

**Verification** (captured 2026-07-23, `repo-harness-0.10.1.tgz`):
```
[packed-profile-discovery] OK: packed tarball ships manifest.json, catalog.ts, and skill-surface-select.ts
[packed-profile-discovery] OK: packed CLI accepts profile 'minimal' and returns a well-formed dry-run plan (install=cli,effective-state,scope-worktree-check-guards,handoff,host-adapters)
[packed-profile-discovery] OK: packed CLI accepts profile 'standard' and returns a well-formed dry-run plan (install=cli,effective-state,scope-worktree-check-guards,handoff,host-adapters,adaptive-workflow,codegraph-conditional)
[packed-profile-discovery] OK: packed CLI accepts profile 'product-planning' and returns a well-formed dry-run plan (install=cli,effective-state,scope-worktree-check-guards,handoff,host-adapters,adaptive-workflow,codegraph-conditional,planning-integrations)
[packed-profile-discovery] OK: packed CLI accepts profile 'strict' and returns a well-formed dry-run plan (install=cli,effective-state,scope-worktree-check-guards,handoff,host-adapters,adaptive-workflow,codegraph-conditional,agent-fleet,verifier,cross-model-acceptance,release-deployment-gates)
[packed-profile-discovery] OK: repo-harness-0.10.1.tgz accepts all four profile literals from a disposable BUN_INSTALL root with zero host mutation.
```

## Explicitly deferred (not gaps — deliberate scope decisions, disclosed)

- **Full N-way cross product** (240+ literal combinations): not attempted, by design — see Methodology. The dimension-by-dimension and representative-combination tables above are the evidence contract; no single existing test or new probe claims to exhaust the cross product, and none needs to (each dimension's behavior is independent of the others' specific values, e.g. "does copy-mode retirement preserve a modified file" does not need re-proving once per profile).
- **Real mutating packed-tarball install for `product-planning`/`strict`**: deferred for the network-dependency reason given above.
- **Folding the new packed-tarball probe into `scripts/check-tarball-install-smoke.sh`**: left as an explicit orchestrator decision (contract-amendment territory), not performed here.
