# Implementation Notes: nested-capability-architecture-routing

> **Status**: Active
> **Plan**: plans/plan-20260813-2314-nested-capability-architecture-routing.md
> **Contract**: tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md
> **Review**: tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md
> **Last Updated**: 2026-08-13 23:15
> **Lifecycle**: notes

## Design Decisions

- Preserve every existing static severity rule, then consult the canonical
  capability resolver only for a path that was otherwise `unrelated` and
  contains a `src/` segment. This fixes arbitrary workspace depth without
  paying a Bun resolver startup for unrelated Markdown or repository files.
- Require an actual longest-prefix match before promoting the path to
  `low source-change`; unmatched nested source remains fail-closed and never
  creates a `root` request.

## Deviations From Plan Or Spec

- The contract runs `check-architecture-sync.sh` before the full Bun suite. Two
  frozen-evidence attempts observed the provider as `error` only when probed
  immediately after the full suite, while three direct probes returned `ready`.
  Reordering keeps both gates strict without adding a retry or fallback path.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Generalize every workspace-depth regex | Rejected for this slice | It would duplicate capability structure and widen config/boundary severity semantics beyond the reported source-routing bug. |
| Resolve every unrelated path | Rejected | It adds avoidable resolver work for paths that cannot be source changes. |
| Resolve only unmatched `src/` candidates | Selected | It preserves current exclusions and routes only capability-backed source paths. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Red guard: `.ai/harness/runs/nested-capability-architecture-routing/pre-fix.txt`
- Green guard: `bun test tests/architecture-queue.test.ts` (6 pass, 0 fail)
- Full suite: `env -u REPO_HARNESS_NODE_BIN bun test --max-concurrency 4` (2366 pass, 1 platform skip, 0 fail)
- Architecture readiness: three consecutive direct
  `bash scripts/check-architecture-sync.sh` runs passed with
  `provider=archctx state=ready` after the retained failed evidence probes.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
