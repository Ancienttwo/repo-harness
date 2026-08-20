# Implementation Notes: windows-protected-helper-platform-contract

## Frozen Decisions

- Install/update is the only Windows PATH-discovery ceremony; protected runtime dispatch never falls back to caller PATH.
- The contract binds Git, Bash, and `usr/bin` to one Git-for-Windows root and separately pins the native system-tools directory used for `taskkill.exe`.
- `contract-worktree.sh` and `ship-worktrees.sh` remain Bash; this slice supplies their declared POSIX platform dependency rather than shadow-reimplementing workflow semantics.
- Toolchain relocation is an explicit stale-contract error repaired by `repo-harness update`, not an automatic search.

> **Status**: Active
> **Plan**: plans/plan-20260820-2347-windows-protected-helper-platform-contract.md
> **Contract**: tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md
> **Review**: tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md
> **Last Updated**: 2026-08-20 23:47
> **Lifecycle**: notes

## Design Decisions

- Persist protocol 1 only in the OS account config. Caller `HOME` is never the
  authority for protected dispatch or installation of this machine contract.
- Validate the optional Git-for-Windows `mingw64/bin` directory if it exists;
  a symlink or non-directory is an error instead of a reason to omit it
  silently from the protected `PATH`.
- Derive Windows `SystemRoot`, account, and `PATHEXT` from the validated
  contract/account. `TEMP` is accepted only during the explicit install/update
  ceremony, validated as an absolute non-symlink directory, persisted, and then
  reused without consulting per-invocation caller environment.
- At install time require PATH-resolved `taskkill.exe` to equal
  `SystemRoot\\System32\\taskkill.exe`, then pass that exact binary to both the
  normal supervisor and the hard-timeout backstop instead of relying on PATH
  ordering.

## Deviations From Plan Or Spec

- The plan excluded a shell rewrite, but the existing Bash helpers rejected
  every drive-letter path before using the pinned runtime. The bounded change
  adds one host-absolute predicate to each shell helper and its asset mirror;
  workflow semantics remain unchanged.
- A proposed capability-source edit was dropped after the canonical projection
  classified it as an unresolved ownership/responsibility change. The protected
  runtime remains reached through the already-owned `helper-runner.ts` and
  `global-runtime.ts` entrypoints; this slice does not fabricate an
  `acceptedChange` reference or widen architecture ownership without a separate
  architecture decision.
- The canonical architecture projection refreshes
  `docs/architecture/.projection-manifest.json` even when the semantic module is
  the only human-owned architecture edit, so that generated receipt is included
  explicitly in the task contract's allowed paths.
- The one allowed external semantic review inspected frozen subject
  `sha256:0e34b23c7a5b05f93c948c26c22a296bec6447d2129bb946dba7bc16a002b81d`
  against target `7ce86fdd` and returned fail with 2 P1 and 6 P2 findings. The
  remediation stays inside this work package: platform-safe packaged-root
  detection; a scalar merge-gate policy output that removes required-path `jq`;
  direct TypeScript-helper contract resolution; pinned Git for the expensive
  lock; persisted/validated temp authority; structured `runHelper` resolution
  errors; opt-in ephemeral Windows smoke; and a realpath-escape regression.
  The external-review budget is exhausted, so the repaired subject cannot be
  represented as an external pass; closeout requires the contract's explicit
  typed user-waiver path after deterministic verification.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rewrite shell helpers in TypeScript/PowerShell | Reject | Duplicates workflow semantics and creates a second authority. |
| Rediscover tools on each protected invocation | Reject | Restores caller `PATH` as a trust boundary. |
| Omit malformed optional Git directories | Reject | Hides stale or tampered installation state. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/windows-protected-helper-platform-contract/pre-fix-regression.txt`
- Post-review remediation suite: 36 tests / 242 expectations passed on
  2026-08-21 across the platform contract, direct helper, merge gate, process
  runner, and run-helper surfaces. Helper projection and closeout guardrails
  also passed; Windows-native smoke is bound to the existing OS matrix.
- Pre-review full local CI passed on 2026-08-21 with 2,750 tests passed, one platform skip,
  zero failures, followed by workflow checks, repository inspection, package
  dry-run, and tarball install smoke. Ambient `CODEX_SESSION_ID` was removed for
  the run so trace-observer fixtures received their declared test environment;
  the contract records that exact hermetic test command. This evidence predates
  the external-review remediation and will be regenerated once after the final
  focused checks are stable.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
