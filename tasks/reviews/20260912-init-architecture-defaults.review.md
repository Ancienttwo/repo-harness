# Init architecture and recommendation defaults

> **Status**: Verified
> **Substantive Change SHA256**: `sha256:0c6bd3999c90f3be6f7ad9b572837ad7bee50bee92f22ed7db8a01c735f2a991`

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

The implementation and regression bytes are unchanged from `4527bfa5`, so its
86-case test run, typecheck, and packed-entrypoint smoke remain valid evidence
for those paths. Integration adds documentation and queue disposition only.
Architecture freshness, strict workflow, and the hook/helper/reference-config
projection checks were rerun, and this digest binds the complete PR comparison
against `origin/main`, including the preserved WIP and archive artifacts.
