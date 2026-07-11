# Implementation Notes: bdd2-e-02-run-experiment-s-shape-hypothesis

> **Status**: Active
> **Plan**: plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
> **Contract**: tasks/contracts/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.contract.md
> **Review**: tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md
> **Last Updated**: 2026-07-12 06:08
> **Lifecycle**: notes

## Design Decisions

- Cut directly from unused global-seal v1 to per-experiment-seal v2. S and A own
  separate product claims and Sprint rows; requiring both datasets before either
  run would silently couple their evidence boundaries. No v1 compatibility parser
  is retained because E-01 produced no valid sealed run consumer.
- Agent execution receives the packet on stdin from a fresh OS temporary cwd.
  Running Codex in the repo would allow the model to inspect held-out truth despite
  truth being absent from the prompt, invalidating the experiment.
- The first real smoke showed that an isolated cwd plus `--ignore-user-config`
  still loaded user-level skill/plugin descriptions. That freeze was discarded.
  Revision S-v2 additionally supplies a fresh temporary HOME/CODEX_HOME containing
  only a mode-0600 copy of `auth.json`, so credentials remain available while
  skills, plugins, config, memories, rules, and local state do not enter the model
  envelope.
- Add one frozen metric specification because the summarizer consumes it and it
  prevents post-hoc gate arithmetic. Raw run evidence and scores remain ignored;
  only the aggregate decision report is tracked.
- Human blind adjudication is a hard evidence boundary. Automated reviewer output
  may be used for dry-run testing but cannot satisfy the Sprint owner or be relabeled
  as human evidence.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Expand both S and A to satisfy the global seal | Reject | Violates independent hypothesis/PR boundaries and mixes unfinished Audit authority into E-02. |
| Preserve v1 plus an optional per-experiment field | Reject | Creates dual semantics and compatibility code before any real consumer exists. |
| Run agents from repository cwd | Reject | Makes private held-out truth filesystem-readable. |
| Add a generic eval framework/dependency | Reject | One runner already owns the invariant; no second consumer justifies an abstraction. |

## Open Questions

- Human acceptance boundary: 72 condition-blind locked scores are still required.
  The implementation owner must not inspect private mappings or substitute model
  scores for the Sprint's `human-blind-panel` owner.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Frozen authority commit: `cd9e0426d362614ba277e067633db2596c236491`.
- Completed raw run: `.ai/harness/runs/bdd2/bdd2-e02-shape-s-v2/` — 72/72
  successful packets, 12 tasks, two conditions, three repetitions, no skill/plugin
  leakage in agent stderr.
- Reviewer-safe queue: `.ai/harness/runs/bdd2/bdd2-e02-shape-s-v2-blind-review/`
  — 72 randomized packets plus frozen rubric/schema, with no private mapping.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
