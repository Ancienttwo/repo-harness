# Implementation Notes: me2-acceptance-followup

> **Status**: Active
> **Plan**: plans/plan-20260828-0142-me2-acceptance-followup.md
> **Contract**: tasks/contracts/20260828-0142-me2-acceptance-followup.contract.md
> **Review**: tasks/reviews/20260828-0142-me2-acceptance-followup.review.md
> **Last Updated**: 2026-08-28 01:42
> **Lifecycle**: notes

## Design Decisions

- Child environment allowlist is exactly `{HOME, PATH}` (`CODEX_CHILD_ENV_KEYS` in `src/effects/engineers/delegated-run-store.ts`), and a missing key fails closed instead of forwarding `undefined`. `PATH` is load-bearing because Codex resolves its own sandbox launcher and the tools it runs inside the sandbox. `HOME` is load-bearing because `CODEX_HOME` defaults to `$HOME/.codex` and `--ignore-user-config` suppresses `config.toml`, not `auth.json` — verified by running `env -i PATH=... HOME=/tmp/codexprobe2 codex exec ...`, which started cleanly, created `$HOME/.codex`, and failed at a 401 for the missing bearer token. That is also why no credential key is on the allowlist: the token source is that home file, never the environment, so the child needs no `CODEX_API_KEY`-class variable. Everything else the parent carries is withheld.
- The environment set is bound into the evidence chain by digest only (`canonicalMessageDigest` over `{domain, env}`), never by storing values. It lands on both `CodexProcessReceiptV1.env_sha256` and `CodexReadOnlyCapabilityReceiptV1.env_sha256`, and `capabilityCanaryVerified` now requires the capability digest to equal its canary receipt digest, so a capability cannot claim an environment its own proof was not taken under.
- Dispatch-surface denial probe is infeasible, so the fallback route was taken. Measured: `codex exec --sandbox read-only --ephemeral --ignore-user-config --strict-config --json` inside a git fixture reaches `turn.started` and then spends ~30s retrying a provider websocket before failing 401. A tool call — and therefore any sentinel write attempt — only happens after a successful provider turn, so there is no credential-free, deterministic, offline probe on the exec surface, and a model-mediated one would not be deterministic enough for a fail-closed admission gate. The extrapolation is recorded explicitly as `CODEX_READ_ONLY_PROOF_SURFACE` on the capability receipt plus a Known Unknowns row in `plans/prds/20260825-1551-delegated-run-adapter.prd.md`.
- Dead rejection enum triage: `role_profile_unavailable` was wired to a real producer by splitting `profileMatchesStored` into `profileAvailability` (`matches` / `unavailable` / `stale`), so an absent tracked profile no longer collapses into `role_profile_stale`. The other three were removed as constructively unreachable — `mode_unsupported` and `budget_invalid` cannot survive `validateDelegationEnvelope`/`buildDelegationExecutionPacket`, which run before admission and throw out of the function entirely, and a protected-scope mismatch surfaces at dispatch as the store error `delegated_run_capability_stale`, never as an admission rejection, leaving `sandbox_scope_mismatch` with no path.
- `trackedRegularFile` ENOENT became `delegated_run_profile_unavailable` rather than reusing `delegated_run_not_found`, which names store evidence, not a tracked repository profile. Every message on that path carries the repository-relative path only; the raw `lstat` error text leaked the Host absolute path before.
- The catalog regex terminator became a lookahead (`(?=\n|$)`) when it moved to `matchAll`. Consuming the separator would let a second catalog that begins on the very next line hide behind `lastIndex`, which is exactly the duplicate the count is meant to catch.

## Deviations From Plan Or Spec

- Dispatch-surface denial probe took the documented fallback route (receipt field plus Known Unknowns) after the exec-surface probe was measured infeasible.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Forward `TMPDIR`/`TERM`/`LANG` alongside `HOME` and `PATH` | Rejected | `codex exec` was observed starting and running a turn under `env -i` with only those two; anything further would be unjustified host surface. |
| Enforce `capability.env_sha256 === dispatch env digest` at dispatch time | Rejected | Contract scope is recording the digest in both receipts; a new dispatch-time equality gate would fail every run whose `PATH` shifted after admission and was not requested. |
| Keep the three unreachable rejection reasons for future producers | Rejected | Fail-closed repository; a vocabulary entry no path can emit is a dead word, and re-adding one costs a single line when a producer exists. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
