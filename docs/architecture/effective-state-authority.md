# Effective State Authority

> **Status**: Accepted and implemented by ESA-01..05 / ESA-07
> **Decision date**: 2026-07-15
> **Behavior baseline**: `main@82550779cdccf0575d674ae53bbc95ba63e44743`
> **Protocol**: `repo-harness-effective-state`, version `1`

## Decision

The GitHub issue and PR own current task identity, claim, status and dependency. Repository Markdown supplies planning context. Effective State projects the retained local plan, worktree and capability facts. `tasks/current.md` is a replaceable read model and must never feed authority back into resolution.

The dependency direction for the convergence sprint is:

```text
CLI adapter   MCP adapter   Hook adapter
      \          |          /
       \         |         /
        shared effectful resolver
          /               \
 source collection     lock/version
          \               /
           pure state projector
             |          |
      workflow policy  capability registry
```

Adapters render, trigger, or guard. They do not own workflow policy, artifact semantics, capability matching, or a competing state algorithm.

## Frozen Invariants

1. GitHub owns task authority. Local planning context remains human-editable.
2. Effective State has no persisted JSON read model. Every caller resolves from the sources; only the Git common-dir version owner persists. A leftover `.ai/harness/state/effective.json` from an older release has no reader.
3. `tasks/current.md` is an observed orientation snapshot, never authority. Its bytes may change its own source hash/freshness, `state_revision`/`state_version`, `stale_sources`, and the labeled MCP preview, but never `authority_revision`, task selection, or authoritative plan state.
4. The public envelope remains `protocol: 1` and `kind: "repo-harness-effective-state"`.
5. `state_revision` is content-derived from the ordered source-hash projection; `state_version` is durable and monotonic for a changed revision and stable for an unchanged revision. `repo-harness state resolve` is the only allocator. Read-only callers report the last allocated version, which can belong to another revision.
6. Linked worktrees use one Git common-dir version owner rather than independent worktree-local counters. ESA-01 found that the baseline violated this invariant because `git rev-parse --git-path repo-harness/effective-state-version.json` resolved worktree-local paths; ESA-03 corrected it and added concurrent linked-worktree characterization.
7. Workflow profile resolution is deterministic and fail closed when required risk signals are unavailable, invalid, or below the computed risk floor.
8. Workflow-only edits do not inflate implementation scope, while strict-category tokens still raise the safety floor.
9. Foreign worktree ownership blocks rather than selecting an inferred owner.
10. CLI exit semantics remain: `0` for resolved/unblocked, `1` for resolved/blocked or the existing operational failure contract, and `2` for usage or unknown-field errors. Blocked `--field` output remains suppressed.

## Implemented Boundary

- `src/core/state` owns public DTOs, artifact parsers, the full pure Effective
  State projection, and the compatibility snapshot projection.
- `src/core/workflow/profile.ts` owns deterministic risk/profile policy.
- `src/core/capabilities/registry.ts` owns registry parsing, validation,
  normalization, diagnostics, and longest-prefix matching.
- `src/effects/state` owns source collection, stable-read retries, canonical-
  ancestor directory-token locking, and one Git-common-dir version
  transaction. `resolveEffectiveState` is its only writer, and the shared
  version owner is its only persisted output. `resolveEffectiveStateReadOnly`
  takes no lock and writes nothing.
- `src/effects/review/diff-fingerprint.ts` owns Git review-subject observation;
  effects never import CLI adapters.
- CLI, hook, and MCP adapters call these same surfaces. `repo-harness state
  resolve` is the only write-path caller. Every hook event and the MCP
  `summarize_repo_harness_state` tool use the read-only path, and MCP
  advertises that tool as read-only. The MCP compact result is additive and
  labels its separate MCP policy profile plus the retained redacted
  `tasks/current.md` preview as non-authoritative.
- The adopted-repository capability helper is generated as a standalone typed
  source projection and carries the raw canonical source SHA-256. Drift fails CI.

The retired hook-owned workflow policy path and the old monolithic state
resolver no longer exist. There is no feature flag, compatibility fallback, or
second steady-state authority.

## Architecture Model Ownership

Decision date: 2026-10-11. The architecture model now names the owners of this boundary.

| Area | Model node |
|---|---|
| `src/core/state`, `src/core/workflow`, `src/effects/state` resolver, lock and version store, `src/cli/commands/state.ts`, `interfaces/**`, `scripts/check-state-boundaries.ts` | `component.workflow-state.primary` in `capability.workflow-engine.workflow-state` |
| Shared coordination plane (leases, board, Sprint identity) | `component.workflow-state.coordination-plane` |
| Continuation envelope and attempt ledger | `component.workflow-state.continuation-ledger` |
| `src/core/capabilities/registry.ts` | `component.contract-assets.capability-registry` in `capability.workflow-engine.contract-assets` |
| `src/effects/locking/**`, `src/effects/git/**` | `capability.workflow-engine.execution-primitives` |
| `src/effects/review/diff-fingerprint.ts` | `capability.verification.acceptance-review` (whole `src/effects/review/**`) |

The registry is still part of the pure core that `scripts/check-state-boundaries.ts` guards. The model shows this as the relation `relation.workflow-state.primary.contract-assets`. The review-subject observer is named in Implemented Boundary above, but its file is owned by acceptance-review. A move of that one file needs `source.exclude` support (arch-context#296). The module page is `docs/architecture/modules/workflow-engine/workflow-state.md`.

## Baseline P1 Boundary

At the baseline, `src/cli/hook/state-snapshot.ts` owns both deterministic rules and effects:

- plan/contract/review/check/handoff/current parsing;
- phase, blocker, freshness, next-action, and compatibility snapshot projection;
- capability-registry subset validation and longest-prefix matching;
- Git review-subject and version-owner observations;
- lock acquisition/reclamation and cache publication.

`src/cli/hook/workflow-profile.ts` owns pure risk policy. `src/cli/commands/state.ts` owns CLI rendering and process exit. `src/cli/mcp/tools.ts` still has a separate state summary and is not authority-safe until ESA-05 converges it.

## P2 Resolution Trace

1. The CLI supplies explicit target paths, operation kind, and optional raise-only profile override; hook and MCP deliberately request the fixed `inspect` policy.
2. The write path acquires an exclusive directory-token state lock under a canonical repository root. Every ancestor is created and validated one level at a time, and any symlink, non-directory, or identity change fails closed. The read-only path takes no lock.
3. It reads canonical markers and artifacts, eagerly validates every resolver-owned policy field, and observes the Git review subject. Policy file paths must remain inside `.ai/harness` under both POSIX and Win32 path grammars. Every artifact-derived read must also remain lexically and canonically inside the repository; existing external symlinks and missing targets whose nearest existing ancestor resolves outside abort before publication. Only in-repository `ENOENT` means an authority path is absent; worktree canonicalization and Git common-dir corruption abort instead of falling back to a raw path or version `0`.
4. Workflow-only paths are removed from implementation-scope counting; capability IDs and unmapped paths are projected from the declared registry, then pure workflow policy returns a profile or a structured fail-closed error.
5. The resolver calculates source freshness, conflicts, blockers, source hashes, authority revision, and state revision. Revision keys use explicit code-unit ordering, not host locale collation. A second read confirms that the exact source-hash set stayed stable.
6. Under the Git common-dir lock, the write path reads the authority source hashes again. A mismatch retries the whole round once. On a match, an unchanged revision keeps its version and writes nothing, and a changed revision atomically replaces the shared version owner with the next version. An owner write failure consumes no version. The read-only path reads the last published version without the lock.
7. CLI renders the requested-risk result. Hook and MCP render a read-only `inspect` result. All three agree on the content-derived authority fields. Hook and MCP report the last published `state_version`, so it matches the CLI only after `state resolve` publishes the current revision. The intentional policy input difference remains explicit.

## Authority and Projection Table

| Surface | Role | May influence canonical state? |
|---|---|---:|
| active plan/worktree markers | authority selector and ownership | yes |
| plan and contract | task/status/scope authority | yes |
| review plus exact review subject | acceptance evidence | yes, through freshness/blockers |
| checks/handoff/resume | bound evidence/projection | only when exact bindings are fresh |
| capability registry and workflow policy | path-to-capability, risk, and review-base input | yes, both are source-hashed and stability-checked |
| `tasks/current.md` | orientation projection | no |

## Characterization Evidence

`tests/state/cli-state-golden.test.ts` records full normalized direct/CLI/hook output for ten states:

- idle inspect;
- executing with fresh review/check/handoff/resume evidence;
- missing contract;
- foreign worktree owner;
- stale projections;
- invalid capability registry;
- requested profile below a strict floor;
- stale dead lock reclamation;
- live lock wait and release;
- explicit strict resolution without path signals.

Goldens normalize the temporary repository root plus only the hashes that necessarily derive from that root (`active-worktree`, handoff/resume, `authority_revision`, and `state_revision`). Stable source hashes and Git object IDs are frozen exactly. Tests also derive every file source hash, `authority_revision`, and `state_revision` independently and require direct/CLI hash equality.

`tests/state/state-concurrency.test.ts` and `tests/state/state-effects.test.ts` use
real files, subprocesses, and fault injection to prove canonical-ancestor lock
handling, exact-token stale reclaim, Git common-dir version sharing, and
atomic version-owner publication. An empty pre-token directory is never
auto-reclaimed because it cannot distinguish a crashed creator from a live
creator; a deterministic delayed-creator proof confirms the contender cannot
enter. A live or PID-reused token reaches the real timeout without token deletion.
Twelve concurrent stale reclaimers preserve one critical owner, and twelve
linked-worktree publishers receive exactly versions `1..12`. The mutation barrier
and owner fault matrix prove that a failure keeps the exact owner bytes and
consumes no version. A read-only version lookup takes no version lock and
creates nothing in the Git common dir.

Artifact-path regressions cover POSIX and Win32 lexical traversal, an existing
external symlink target, and an `ENOENT` target below an external symlink
ancestor. Every case fails before version publication, while an ordinary
missing in-repository artifact preserves the explicit absence contract.
Composed/decomposed Unicode source keys in reversed insertion orders produce
one fixed code-unit-sorted revision digest.

The final code-frozen 100-resolution benchmark is recorded only after its
subject fingerprint is bound to the implementation under review; pre-freeze
calibration numbers are not release evidence.

## Consequences

- Future work must preserve these outputs unless a separately reviewed semantic correction is explicit.
- No old/new resolver feature flag or dual steady-state implementation is allowed.
- Current-snapshot availability cannot be used as an optimization input until it can be proven not to become authority.
- The first expected 10x pressure point is repeated synchronous Git/source collection, not pure projection.
- ESA-06 shipped at 0.16.1 as a mandatory revision precondition, not as a
  compatibility mode: the MCP workflow-artifact write tools replaced boolean
  `overwrite` with optional `expected_sha256`, and `overwrite` is rejected
  outright rather than reinterpreted. Writes commit through
  `src/cli/mcp/guarded-write.ts` (symlink and regular-file guards, hash
  precondition, temp + fsync + rename + parent fsync) while `paths.ts` keeps
  sole containment authority. Cross-process locking stays deferred, so the
  guard is exact within one server process and leaves a microsecond
  check-to-rename window across processes.
- PID reuse can conservatively make a stale token appear live; the bounded
  timeout and verified manual cleanup path preserve mutual exclusion without a
  new host-native dependency. Active hostile ancestor rename after the final
  identity check would require `openat`/dirfd primitives outside the portable
  Bun/Node boundary; static and intermediate symlink redirection is rejected.

## 2026-10-18: State snapshot and recovery policy

The state snapshot has no task contract presence or path fields. Its collector
does not open the task contract. Recovery views no longer derive review or notes
paths from policy. Existing checkpoint evidence remains a historical read.

## 2026-10-25: Read-only adapters and no state cache

Every hook event, including SessionStart and SubagentStart, and the MCP
`summarize_repo_harness_state` tool now call `resolveEffectiveStateReadOnly`.
Before, they called the write path: the worktree lock, a confirm pass under the
Git common-dir lock, a cache write and a possible version allocation. A
SessionStart took three resolution passes on the happy path and up to ten per
attempt, so thirty across the hook's three attempts. It now takes two passes,
and at most twelve across three attempts. These callers create no
`.ai/harness/state` entry and no Git common-dir entry.

The read-only callers report the last published `state_version`. That version
can belong to another revision of any linked worktree, so a consumer compares
`state_revision` to detect a change. `repo-harness state resolve` stays the only
allocator. No production code reads `state_version` back to make a decision;
the hook session context and the MCP summary only render it.

`.ai/harness/state/effective.json` had no reader. This change deletes its
writer, so the version owner is the only persisted Effective State output. The
hook retry classifier now accepts only `StateResolutionUnstableError`: the
read-only path takes no lock, so lock contention cannot reach it.
