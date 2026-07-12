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
- The original protocol treated human blind adjudication as a hard evidence
  boundary. Automated reviewer output could not satisfy that authority or be
  relabeled as human evidence; the owner-authorized deviation below changes the
  panel type while preserving that labeling constraint.

## Protocol Deviation

- After the completed 72-output run remained blocked for three consecutive turns
  with 0/72 human scores, the owner explicitly replied `同意，继续` to the stated
  option of changing the acceptance authority to Agent adjudication.
- The reviewer authority is therefore changed to an owner-authorized, condition-blind
  Agent panel. Prompts, tasks, model profile, frozen metric arithmetic, raw responses,
  blind IDs, and private mappings remain unchanged.
- This is proxy evidence, not human adjudication. Reports and reviews must retain
  that label; no Phase P productization claim may silently cite it as human evidence.

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

- None for E-02. The recorded decision is `Reshape`; a future Shape prompt revision
  and rerun is a separate authority revision, not an edit to this result.

## Experiment S Result

- Panel: three condition-blind Agent reviewers with `fork_turns=none`, 24 unique
  packets each and non-overlapping score directories; 72/72 scores validated before
  reveal.
- Decision: `Reshape`.
- Unsupported expansion: 48 baseline vs 2 treatment, 95.8% reduction; paired
  win/tie/loss 12/22/2.
- Required behavior omission: 23 baseline vs 0 treatment; no stable new omission.
- New treatment P0/P1 protected omission: 0.
- Correction-time median: 10 minutes baseline vs 0 treatment.
- Failed gate: one unnecessary tracked artifact. `S-H-12` repetition 1 escalated
  an already-resolved cancellation/charging contract to PRD.
- Remaining treatment expansions: `S-H-08` repetitions 1 and 2 required continued
  offline editing beyond the supplied request/current truth.
- Conclusion: the evidence supports narrowing the escalation trigger to unresolved
  product decisions and tightening adjacent-capability handling before rerun. It
  does not authorize Phase P productization.

## Verification Exception

- E-02 focused tests, TypeScript, manifest/plan validation, 72/72 score validation,
  deterministic re-summary, deploy SQL, architecture sync, task sync, strict
  workflow, project-state inspection, migration dry-run, and agent-tooling checks
  pass.
- The repository-wide `bun test` is not green on this macOS host under either the
  installed Bun 1.3.14 or the CI-pinned Bun 1.3.10. The unchanged
  `scripts/architecture-event.ts` calls `process.stdout.write(value)` immediately
  followed by `process.exit(0)`; both local Bun builds emit only 512 bytes of the
  event JSON, causing unrelated architecture-queue and hook-runtime tests to fail.
  GitHub CI remains the authoritative Linux check for the PR; this slice does not
  widen scope to repair that pre-existing runtime incompatibility.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Frozen authority commit: `cd9e0426d362614ba277e067633db2596c236491`.
- Completed raw run: `.ai/harness/runs/bdd2/bdd2-e02-shape-s-v2/` — 72/72
  successful packets, 12 tasks, two conditions, three repetitions, no skill/plugin
  leakage in agent stderr.
- Reviewer-safe queue: `.ai/harness/runs/bdd2/bdd2-e02-shape-s-v2-blind-review/`
  — 72 randomized packets plus frozen rubric/schema, with no private mapping.
- Tracked aggregate report: `evals/bdd2/reports/experiment-s.md`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
