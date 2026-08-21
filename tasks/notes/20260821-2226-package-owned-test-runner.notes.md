# Implementation Notes: package-owned-test-runner

> **Status**: Active
> **Plan**: plans/plan-20260821-2226-package-owned-test-runner.md
> **Contract**: tasks/contracts/20260821-2226-package-owned-test-runner.contract.md
> **Review**: tasks/reviews/20260821-2226-package-owned-test-runner.review.md
> **Last Updated**: 2026-08-21 23:05
> **Lifecycle**: notes

## Design Decisions

- `package.json#scripts.test` is the only runner authority for a `tests_pass` path; the verifier resolves ownership and forwards the owner-relative path.
- Bare `bun test` is not retained as a fallback. Missing or ambiguous ownership and missing scripts are verifier failures.
- Ownership resolves from the canonical test path to the nearest repository-contained ancestor manifest. A test path that resolves outside the repository and a symlinked manifest are rejected; a malformed nearest manifest cannot fall through to a parent package.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Duplicate the BYOK package command under `commands_succeed` | Rejected | It executes one suite twice and leaves `tests_pass` semantically incorrect for other consumers. |
| Fall back to bare Bun | Rejected | It reintroduces a second authority and silently drops package configuration. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Pre-fix failure: `.ai/harness/runs/20260821-2226-package-owned-test-runner-pre-fix.log` (`PRE_FIX_EXIT=1`).
- Source-helper contract verification: `.ai/harness/runs/20260821-2226-package-owned-test-runner-contract-source.json` (25/25 pass; root criterion records `bun run --cwd . test -- tests/unit/package-owned-test-runner.test.ts`).
- Focused regression: `bun test tests/unit/package-owned-test-runner.test.ts` (6 pass).
- Deployed-helper regression: `bun test tests/helper-scripts.test.ts --timeout 60000` (129 pass).
- Static gates: `bun run check:helpers`, `bun run check:type`, shell syntax, and `git diff --check` pass.
- BYOK consumer proof: `/tmp/byok-package-owned-tests.report.json` records four `packages/client` paths passing through exact package-owned Vitest commands; BYOK tracked status was unchanged before/after.
- Gatekeeper: PASS on the exact implementation diff and authority boundary.
- Full repository suite: `2821 pass, 2 skip, 2 fail` after 2002 seconds. Both failures were unchanged `tests/trace-observer.test.ts` cases contaminated by the host's ambient `CODEX_SESSION_ID`; an env-scrubbed isolated rerun passed 9/9. This is reported, not fixed in this work-package.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
