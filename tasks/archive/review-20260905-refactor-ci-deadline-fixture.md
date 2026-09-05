# Refactor merge prerequisite: Node deadline fixture

> **Status**: Complete
> **Substantive Change SHA256**: `sha256:9f1b9aef3dc2d16e520fae76ddf69167301156b6b5faef57718a85ec784311de`

## Boundary and decision

The refactor merge's base CI failed before any multi-work-package changes were
published. This is the single directly blocking out-of-scope repair: make the
existing fake Node executable's delay independent of its deliberately empty PATH.
Only the fixture changes; runtime deadline behavior and assertions stay intact.

## Root Cause Evidence

- root_cause: the fake Node shell script invoked `sleep` through an empty PATH, printed a valid version immediately, and made the Linux deadline test exit 2.
- repro: base `0178db813e9e01e355449a24729267437a11a333`, GitHub CI run `33957981959`, `tests/architecture-projection-provider.test.ts:265`; an isolated script with `env={'PATH':''}` also reported `sleep: No such file or directory` and exited before its intended two-second delay.
- regression_guard: the existing real subprocess deadline test now uses `/bin/sleep`, preserving the 100ms caller deadline and timeout error assertions.
- pre_fix_failure_artifact: `/tmp/refactor-multiwp-base-ci.log`; CI expected exit 0 and received 2.

## Verification

- `bun test --timeout 60000 tests/architecture-projection-provider.test.ts`: 23 pass, 0 fail, exit 0; `/tmp/refactor-ci-deadline-green.log` and `/tmp/refactor-ci-deadline-result.json`.
- The isolated repair changed one fixture string and its explanatory comment. Concurrent upstream PR #319 published the same absolute sleep correction as `c76d1e66`; integration retained that upstream test verbatim, including its 4-second outer watchdog. No runtime source or gate weakening.
- Focused verification is sufficient for this test utility lookup correction; no full-suite or repeated external review is warranted.
- Durable reading entrypoint: `docs/researches/20260905-refactor-057-audit-repairs.md`.
