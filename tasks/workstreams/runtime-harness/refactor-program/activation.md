# Workstream: Refactor activation

> **Status**: in_progress
> **Capability ID**: `runtime-harness-refactor-program`
> **Architecture Module**: `docs/architecture/modules/runtime-harness/refactor-program.md`
> **Substantive Change SHA256**: `sha256:abc11410914a068d469d5ed45745f6a3acd70c6c78cab23f732bdf6fa51fb80a`

## Verified state

- The consumer pins npm `archctx@0.5.3` and `archctx-contracts@0.5.3` in both provider contracts, installed policy, dependency lock and initialization templates. The preceding provider version is rejected by the capability handshake.
- Canary 5 passed through the packed repo-harness consumer and the published dependencies: live HEAD and worktree digest agree with verification evidence, `not_improved` cannot resolve, and the recommendation remains `accepted`.
- The local daemon required an explicit `archctx daemon upgrade` to replace the previous unpublished build before the published-package check.
- Evidence: `/tmp/repo-harness-activation-20260904/053/canary5-result.json`; reproducer: `/tmp/repo-harness-activation-20260904/053/canary5.ts`.
- Activation remains `off`; this receipt does not authorize promotion or replace the other nine canaries. Prior valid canaries 1 and 2 belong to the earlier consumer revision and must be refreshed before promotion on this revision.

## Remaining acceptance

Run the complete ten-canary set against the final installed consumer revision in disposable repositories, then observe each activation rung. Only after that acceptance may this repository enter `shadow`. No scheduled promotion is authorized.
