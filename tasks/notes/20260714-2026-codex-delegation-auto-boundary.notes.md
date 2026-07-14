# Implementation Notes: codex-delegation-auto-boundary

> **Status**: Active
> **Plan**: plans/plan-20260714-2026-codex-delegation-auto-boundary.md
> **Contract**: tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md
> **Review**: tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md
> **Last Updated**: 2026-07-14 20:26
> **Lifecycle**: notes

## Design Decisions

- P1: `assets/hooks/codex-delegation-advisor.sh` owns product behavior;
  `.ai/hooks/codex-delegation-advisor.sh` is its deterministic self-host
  projection; `src/cli/hook/prompt-router.ts` owns prompt routing semantics.
- P2: global auto mode currently reaches the advisor on every Codex prompt and
  emits a contract-authority packet without proving either contract state or
  execution intent.
- P3: keep the existing route and modes, but split permission-only explicit
  delegation from contract-bound execution and fail closed for invalid/missing
  active state. Do not add a parallel regex classifier.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Disable all Codex delegation hooks | Rejected | Removes useful explicit delegation and unrelated subagent guards. |
| Add question/status regexes inside the advisor | Rejected | Creates a second semantic authority that can drift from the prompt router. |
| Validate contract state and reuse deterministic routing | Accepted | Smallest change that preserves explicit delegation and contract authority. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix focused run: `bun test tests/cli/hook.test.ts tests/hook-contracts.test.ts`
  failed at the new permission-only assertion and auto-mode idle assertion,
  proving the old advisor still emitted the full contract packet without an
  active contract.
- Post-fix focused run: the same two files pass. `bun run check:type` and
  `bun run check:hooks` also pass in the combined verification command.
- Product/self-host projection: `bun scripts/sync-hook-sources.ts --write`
  produced digest
  `sha256:4cab1f9b006f3ef04ebea1c57e1375e2df804b80acd42ccf6baf339f227f60a1`;
  `cmp assets/hooks/codex-delegation-advisor.sh .ai/hooks/codex-delegation-advisor.sh`
  passes.
- Operator mitigation: `repo-harness install --target codex --location global
  --delegation-mode explicit --json` updated
  `~/.repo-harness/config.json`; readback reports `delegation.mode=explicit`.
  The global file is operator state and is not part of this branch diff.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
