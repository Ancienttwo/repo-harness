# Effective State Authority

> **Status**: Accepted and implemented by ESA-01..05 / ESA-07
> **Decision date**: 2026-07-15
> **Behavior baseline**: `main@82550779cdccf0575d674ae53bbc95ba63e44743`
> **Protocol**: `repo-harness-effective-state`, version `1`

## Decision

Repository Markdown and repository-local workflow artifacts are the human-editable authority. Effective State is the single deterministic projection of that authority. Its JSON cache and `tasks/current.md` are replaceable read models and must never feed authority back into resolution.

The dependency direction for the convergence sprint is:

```text
CLI adapter   MCP adapter   Hook adapter
      \          |          /
       \         |         /
        shared effectful resolver
          /               \
 source collection     lock/version/cache
          \               /
           pure state projector
             |          |
      workflow policy  capability registry
```

Adapters render, trigger, or guard. They do not own workflow policy, artifact semantics, capability matching, or a competing state algorithm.

## Frozen Invariants

1. Markdown and repository artifacts remain the authority and remain human-editable.
2. `.ai/harness/state/effective.json` is an ignored, atomically replaceable read model; deletion or corruption cannot change authority output.
3. `tasks/current.md` is an orientation snapshot. Stale or manually edited content can change only its own freshness projection, never canonical task/plan/contract state.
4. The public envelope remains `protocol: 1` and `kind: "repo-harness-effective-state"`.
5. `state_revision` is content-derived from the ordered source-hash projection; `state_version` is durable and monotonic for a changed revision and stable for an unchanged revision.
6. Linked worktrees use one Git common-dir version owner rather than independent worktree-local counters. ESA-01 found that the baseline violated this invariant because `git rev-parse --git-path repo-harness/effective-state-version.json` resolved worktree-local paths; ESA-03 corrected it and added concurrent linked-worktree characterization.
7. Workflow profile resolution is deterministic and fail closed when required risk signals are unavailable, invalid, or below the computed risk floor.
8. Workflow-only edits do not inflate implementation scope, while strict-category tokens still raise the safety floor.
9. Plan/contract relationship conflicts and foreign worktree ownership block rather than selecting an inferred authority.
10. CLI exit semantics remain: `0` for resolved/unblocked, `1` for resolved/blocked or the existing operational failure contract, and `2` for usage or unknown-field errors. Blocked `--field` output remains suppressed.

## Implemented Boundary

- `src/core/state` owns public DTOs, artifact parsers, the full pure Effective
  State projection, and the compatibility snapshot projection.
- `src/core/workflow/profile.ts` owns deterministic risk/profile policy.
- `src/core/capabilities/registry.ts` owns registry parsing, validation,
  normalization, diagnostics, and longest-prefix matching.
- `src/effects/state` owns source collection, stable-read retries, Git common-dir
  version allocation, directory-token lock ownership, and atomic cache publication.
- `src/effects/review/diff-fingerprint.ts` owns Git review-subject observation;
  effects never import CLI adapters.
- CLI, hook, and MCP adapters call these same surfaces. The MCP compact result
  is additive and labels its separate MCP policy profile plus the retained
  redacted `tasks/current.md` preview as non-authoritative. Canonical MCP
  resolution materializes only the ignored cache/version read model and is
  therefore advertised as non-read-only.
- The adopted-repository capability helper is generated as a standalone typed
  source projection and carries the raw canonical source SHA-256. Drift fails CI.

The retired hook-owned workflow policy path and the old monolithic state
resolver no longer exist. There is no feature flag, compatibility fallback, or
second steady-state authority.

## Baseline P1 Boundary

At the baseline, `src/cli/hook/state-snapshot.ts` owns both deterministic rules and effects:

- plan/contract/review/check/handoff/current parsing;
- phase, blocker, freshness, next-action, and compatibility snapshot projection;
- capability-registry subset validation and longest-prefix matching;
- Git review-subject and version-owner observations;
- lock acquisition/reclamation and cache publication.

`src/cli/hook/workflow-profile.ts` owns pure risk policy. `src/cli/commands/state.ts` owns CLI rendering and process exit. `src/cli/mcp/tools.ts` still has a separate state summary and is not authority-safe until ESA-05 converges it.

## P2 Resolution Trace

1. The CLI supplies explicit target paths, operation kind, and optional raise-only profile override.
2. The resolver acquires an exclusive directory-token state lock, reads canonical markers and artifacts, and observes the Git review subject.
3. Workflow-only paths are removed from implementation-scope counting; capability IDs and unmapped paths are projected from the declared registry.
4. Workflow policy returns a profile or a structured fail-closed error.
5. The resolver calculates source freshness, conflicts, blockers, source hashes, authority revision, state revision, and monotonic version.
6. A second read confirms source-hash stability. Stable output replaces the cache atomically; repeated change fails without publishing a partial cache.
7. CLI and hook projections render the result under their existing public contracts.

## Authority and Projection Table

| Surface | Role | May influence canonical state? |
|---|---|---:|
| active plan/worktree markers | authority selector and ownership | yes |
| plan and contract | task/status/scope authority | yes |
| review plus exact review subject | acceptance evidence | yes, through freshness/blockers |
| checks/handoff/resume | bound evidence/projection | only when exact bindings are fresh |
| capability registry and workflow policy | path-to-capability, risk, and review-base input | yes, both are source-hashed and stability-checked |
| `tasks/current.md` | orientation projection | no |
| Effective State cache | replaceable read model | no |

## Characterization Evidence

`tests/state/cli-state-golden.test.ts` records full normalized direct/CLI/hook output for twelve states:

- idle inspect;
- executing with fresh review/check/handoff/resume evidence;
- missing contract;
- foreign worktree owner;
- stale projections;
- invalid capability registry;
- requested profile below a strict floor;
- deleted cache reconstruction;
- corrupt cache reconstruction;
- stale dead lock reclamation;
- live lock wait and release;
- explicit strict resolution without path signals.

Goldens normalize the temporary repository root plus only the hashes that necessarily derive from that root (`active-worktree`, handoff/resume, `authority_revision`, and `state_revision`). Stable source hashes and Git object IDs are frozen exactly. Tests also derive every file source hash, `authority_revision`, and `state_revision` independently and require direct/CLI hash equality.

`tests/state/state-concurrency.test.ts` and `tests/state/state-effects.test.ts` use
real files, subprocesses, and fault injection to prove live/stale/malformed lock
handling, token ownership, safe orphan recovery, Git common-dir version sharing,
and atomic cache publication. A delayed live token publisher plus concurrent
contender proves the stale reclaimer cannot steal a live lock; twelve concurrent
linked-worktree allocators prove that version allocation is serialized through
the Git common-dir owner. The mutation barrier proves a continuously changing
capability registry fails without cache or version publication.

The final code-frozen 100-resolution benchmark is recorded only after its
subject fingerprint is bound to the implementation under review; pre-freeze
calibration numbers are not release evidence.

## Consequences

- Future work must preserve these outputs unless a separately reviewed semantic correction is explicit.
- No old/new resolver feature flag or dual steady-state implementation is allowed.
- Cache or current-snapshot availability cannot be used as an optimization input until it can be proven not to become authority.
- The first expected 10x pressure point is repeated synchronous Git/source collection, not pure projection.
- ESA-06 workflow-artifact overwrite semantics remain deferred; this authority
  convergence does not introduce a revision-precondition compatibility mode.
