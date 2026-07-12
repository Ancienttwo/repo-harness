# Implementation Notes: bun-1-3-14-runtime-upgrade

> **Status**: Active
> **Plan**: plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md
> **Contract**: tasks/contracts/20260712-1330-bun-1-3-14-runtime-upgrade.contract.md
> **Review**: tasks/reviews/20260712-1330-bun-1-3-14-runtime-upgrade.review.md
> **Last Updated**: 2026-07-12 13:32
> **Lifecycle**: notes

## Design Decisions

- Keep `package.json#engines.bun` at `>=1.1.35`; the hosted verification baseline
  changes, but this PR does not claim older supported Bun releases are invalid.
- Use `writeSync` on fd 1/fd 2 only where a process exits immediately. This
  protects the output contract without adding flush timers, retries, or fallback parsers.
- Mirror `architecture-event.ts` into the downstream helper template in the same change.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep CI on 1.3.10 | Reject | Avoids the symptom but leaves stable-runtime drift. |
| Upgrade pin only | Reject | Reproduces truncated architecture and hook payloads. |
| Synchronous exit-boundary writes | Choose | Smallest deterministic fix for the shared invariant. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Direct proof: Bun 1.3.14 emitted 512 bytes before the fix and 527 bytes after it
  for the same pretty event JSON.
- Regression proof: 1,111 pass / 1 skip / 0 fail across 99 files on Bun 1.3.14.
- Hosted proof: PR #56 Test plus macOS/Linux/Windows MCP matrix passed on Bun 1.3.14.
- Claude review challenged remaining `console.log/error + process.exit()` paths.
  Byte probes at 527, 10,000, and 1,000,000 characters were complete for both
  streams; the 85,428-byte `adopt --dry-run --json` payload parsed successfully,
  and `prompt-guard-decide` emitted its complete six-byte result. Those paths use
  Bun's synchronous console implementation and do not reproduce the buffered
  `process.stdout.write()` failure, so no broader rewrite was made.
- A second exact-diff Claude review found three direct `process.stderr.write`
  branches still inside `runHook` (unknown route, soft-missing script, required
  missing script). Those branches return to callers that immediately exit, so
  they were converted to the same synchronous fd-2 invariant. The complete
  `tests/cli/hook.test.ts` suite passed 35/35 afterward.
- The follow-up review then found the remaining `adopt --dry-run` direct
  `process.stdout.write(plan.output)` exit boundary. It was converted to fd-1
  synchronous output as well; there are now no direct buffered stdout/stderr
  writes left in `src/cli/index.ts`, `src/cli/hook-entry.ts`,
  `src/cli/hook/runtime.ts`, or `scripts/architecture-event.ts`.
- Rebase note: main advanced through `dd0841d`, which already adopted `writeSync`
  for architecture-event, hook-entry, required-missing-script, and hook relay
  paths while upgrading TypeScript 7. This branch now keeps main's `writeSync`
  authority and contributes only the missed runtime/index boundaries plus the
  Bun 1.3.14 CI pin. Delayed-reader stress delivered exact 10MB and 100MB
  `writeSync` payloads with exit 0.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
