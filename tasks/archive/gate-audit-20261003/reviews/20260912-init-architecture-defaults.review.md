# Init architecture and recommendation defaults

> **Status**: Verified
> **Substantive Change SHA256**: `sha256:05f5d4aeb8d42de2a25ef9c69bb4d2c2d4f007d7043a8bf3734513c3eafbf351`

## Scope and decision

The user requires architecture documentation automation to be enabled during
initialization and refactor recommendations to arrive through the hook. A
successful repository adoption now invokes the existing global configuration
writers used by install/update. Defaults remain a single user-level authority;
explicit disabled choices survive reinitialization, and dry-run writes nothing.
The existing Stop recommendation delivery remains the execution path and does
not grant permission to execute a refactor.

No new dependency or abstraction is introduced. This review record is required
by the resolved standard profile's diff-bound evidence gate. Product behavior
is documented in `docs/spec.md`; the correction is recorded in `tasks/lessons.md`.
The separate audit findings concerning strict projection checks and missing
module validation are outside this initialization change.

## Root cause evidence

- Symptom: init succeeded while both automation settings remained absent.
- Cause: `runInit` checked architecture readiness but never called the default
  configuration writers already used by global install/update.
- Trigger: successful init for an account with no architecture or recommendation
  settings, including invocation with optional host bootstrap disabled.
- Proof: the new `init defaults enable architecture` regression failed before
  the edit because both configuration fields were missing, then passed after
  the two existing writers were connected to successful adoption.

## Verification

- `bun test tests/cli/init.test.ts tests/unit/global-architecture-projection.test.ts tests/unit/refactor-recommendations.test.ts tests/stop-handler.test.ts --timeout 60000`: 86 passed in a disposable account environment.
- The CLI help case passed again after its text was aligned with the new init
  behavior. No behavior changed after the 86-case run.
- `bun run check:type`: passed.
- Hook/helper/reference-config projections, deploy SQL order, architecture
  sync, strict task workflow, project inspection, and self-host init dry-run:
  passed. Task-sync initially required this record; final readback follows it.
- `npm pack --json --pack-destination /tmp/rh-init-defaults-package`: built the
  hook and operator artifacts. The archive includes the recommendation module
  and the compiled Stop delivery path.
- The extracted package's CLI, with the existing locked dependencies linked
  and a disposable account/repository, passed dry-run without writing config
  and passed real init with automatic projection and recommendations enabled.
  Its compiled Stop entrypoint exited zero and reported missing project model
  prerequisites rather than synthesizing architecture. This is package
  entrypoint evidence, not a fresh dependency installation or a real structural
  recommendation canary. The fixture Stop tests verify candidate delivery.
- The first package smoke encountered EAGAIN while writing its large dry-run
  JSON to a pipe. Repeating with regular output files exercised the same
  packaged commands successfully; no output-transport product change was made.

## Boundaries

No operator global configuration, installed runtime, or provider model was
changed. Automatic
document generation still requires a valid architecture model and provider;
suggestions require complete code facts. This slice enables defaults and
verifies existing hook delivery without authoring those facts.

## Integration evidence

The user subsequently authorized committing the source-checkout WIP and merging
the branch. The WIP was preserved separately in `f7df7f19`. The two high-severity
cards concerned repository policy and its seed in `scripts/ensure-task-workflow.sh`;
both last changed in the already-merged global-authority cutover `9563083c`.
The contract-assets module now documents that authority and the approved init
defaults. Both cards were resolved through the canonical archive helper with
the owning module/index and product spec as durable artifacts; the unrelated
low-severity cards remain pending.

The configuration/Stop tests and packed-entrypoint smoke at `4527bfa5` remain
baseline evidence for their original subject. Integration isolates account homes
in adoption/init fixtures; the subsequent shared-lock correction below is
covered by fresh canonical verification and semantic review. Architecture freshness, strict workflow,
projection checks, typecheck, project inspection, and self-host init dry-run
passed again. This digest binds the complete PR comparison against `origin/main`.

## CI fixture isolation root cause

- Symptom: PR run `34672256891` failed one fleet acquisition case and four
  verify-sprint cases because automatic projection had no model authority.
- Cause: the existing adoption CLI fixture isolated only `REPO_HARNESS_HOME`;
  successful init now writes defaults under `HOME/.repo-harness/config.json`.
  Several in-process init fixtures also inherited the account home.
- Trigger: running adoption before fleet/helper fixtures in the same account
  persisted automatic projection configuration across isolated test processes.
- Proof: a disposable-account sequence reproduced all five failures after
  adoption wrote the ambient configuration. After explicitly isolating both
  home paths, the same sequence plus the complete init file passed with the
  ambient configuration absent after every file. The adoption CLI case now
  asserts that the automatic defaults are present in its own fixture home.

The final focused sequence covers adoption (31), init (37), fleet acquisition
(9), and the four previously failing helper cases (4): 81 passing tests. It
changes no readiness gate or product assertion. Required hosted CI must still
pass on the final pushed head before merge; the failed run is diagnostic
baseline evidence, not acceptance.

## Shared host transaction invariant

- Symptom: official Codex-plugin review found that a concurrent failed host
  update could restore its earlier config snapshot over init's successful
  automatic defaults (P2; initially source-derived).
- Cause: init called both configuration writers outside the existing
  `withRuntimeHostTransactionLock` used by install/update.
- Trigger: an update holds the host lock and an earlier configuration snapshot
  while init attempts to seed defaults, followed by update rollback.
- Proof: `init cannot write defaults during a host transaction that rolls back`
  failed on the unprotected implementation (expected failure exit 1, received
  success exit 0). The same deterministic interleaving passes with the shared
  lock; configuration stays unchanged under contention and a fresh init after
  rollback seeds both defaults. No sleeps or timing window establish ordering.

Both initializers now execute under that existing lock, before reading current
values. Lock failure becomes an explicit failed init step. The scope remains
configuration seeding; no new synchronization primitive or product fallback is
introduced. The delivery branch also integrates the concurrently merged 0.19.1
release base `d94ec3c7`; source changes for this PR remain separately reviewable.
