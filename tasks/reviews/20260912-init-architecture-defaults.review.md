# Init architecture and recommendation defaults

> **Status**: Verified
> **Substantive Change SHA256**: `sha256:c201afe677c13a69a8221121b7098c2c9488c74f05d713855bd6989a9ec39feb`

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

No operator global configuration, installed runtime, provider model, or
publication was changed. Existing source-checkout WIP is excluded. Automatic
document generation still requires a valid architecture model and provider;
suggestions require complete code facts. This slice enables defaults and
verifies existing hook delivery without authoring those facts.
