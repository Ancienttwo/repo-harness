# Implementation Notes: skill-surface-discovery-convergence

> **Status**: Active
> **Plan**: plans/plan-20260715-1140-skill-surface-discovery-convergence.md
> **Contract**: tasks/contracts/20260715-1140-skill-surface-discovery-convergence.contract.md
> **Review**: tasks/reviews/20260715-1140-skill-surface-discovery-convergence.review.md
> **Last Updated**: 2026-07-23 03:24
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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

## SSD-01

**Status**: Complete (deliverables 1-5 below; verification commands green).

### Separate-runner decision

Built `scripts/run-skill-routing-eval.ts` as a new, independent script rather
than extending `scripts/run-skill-evals.ts`. The existing runner is a two-arm
(`with_skill` / `without_skill`) provider comparison harness over
`evals/evals.json`'s root-Skill workflow cases — its metric is "does the Skill
change agent behavior on these prompts." The SSD routing corpus measures a
different thing entirely: "does a bilingual prompt land on the correct one of
10 target canonical packages (or correctly land on none)." Folding a
profile/host routing-matrix corpus into the two-arm harness would mix two
unrelated eval semantics into one file/CLI surface. The plan's own file
ownership table (`plans/plan-20260715-1140-skill-surface-discovery-convergence.md`,
"File ownership by slice") already lists `scripts/run-skill-routing-eval.ts`
and `evals/skill-routing/**` as SSD-01's exclusive scope, separate from
`evals/evals.json`, so the separate-file layout is the plan's own design, not
an improvised addition.

The new runner makes no provider calls in this slice: `validate` and `hash`
are pure/offline, and `dry-run` is a deterministic selection check (expected
routes vs. the frozen baseline's canonical-route list), not an LLM routing
run. SSD-07 owns the one frozen real provider-routing run.

### Historical-evidence ruling

`docs/researches/20260715-skill-surface-discovery-audit.md:60` records "A
read-only focused baseline covered six relevant test files and reported 110
passing tests, zero failures, in 25.91 seconds." That line names neither the
six files nor a pinned subject SHA, so it cannot be bound to a reproducible
subject and is not reusable as cached evidence for SSD. This ruling is
recorded as a structured field
(`evals/skill-routing/discovery-baseline.json#historical_evidence_ruling`).
SSD relies on this slice's own fresh deterministic gates (`bun test`, the
runner's `validate`/`hash`/`dry-run`, `check:type`) instead.

### Corpus design choices

68 cases total (60-90 required), 34 zh / 34 en (exactly balanced). 42
`positive` cases give every one of the 10 target canonical routes at least one
zh and one en positive (root/plan/product/check/ship/architecture/cross-review
/merge-gate/chatgpt get 2 zh + 2 en each; `repo-harness-setup` gets 3 zh + 3 en
to individually cover its six sub-facets: adopt/init, migrate, upgrade,
repair, scaffold, capability-configuration). The remaining 26 cases spread
across the other six required kinds (`ambiguous` x6, `quoted-name` x4,
`negated` x4, `hypothetical` x4, `status-only` x4, `ordinary-qa` x4 — all
comfortably above the >=3 floor) and tag all seven overlap-vocabulary
dimensions (review / check / plan / ship / merge-gate-vs-cross-review / gptpro
/ architecture) with at least one non-positive, `expected_route: "none"` case
each. Prompts are hand-varied in length, tone, and indirection rather than
templated (`bun test` asserts no two prompts are byte-identical).
`repo-harness-cross-review` positives cover both review directions (asking
Codex to review, and asking Claude to review). `merge-gate` positives are
framed as exact-candidate requests (diff + base/head SHA + verification
evidence attached), matching its judge semantics rather than a generic
"review this" phrasing that would collide with cross-review.

### Deviations from this brief

None in scope or deliverable shape. One factual correction during
spot-verification (per the brief's own instruction: "if a citation is off,
record what you actually find"): the brief's known-disagreement wording
"manifest.json classifies prd/sprint/goal/gptpro-setup as product-planning"
overstates what `assets/skill-commands/manifest.json` actually contains. Only
`repo-harness-prd`'s `class` field is literally `"product-planning"`;
`repo-harness-sprint`/`-goal`/`-gptpro-setup` carry different `class` values
(`sprint-orchestration` / `goal-session` / `gptpro-local-setup`). The real
"product-planning implies PRD/Sprint/Goal" claim lives in
`docs/reference-configs/install-profiles.md:13`. `discovery-baseline.json`'s
`known_disagreements[0]` records the corrected, cited version; the underlying
disagreement (facade sync never actually ships those four names on any
profile) still holds exactly as briefed.

### Process note: WorkflowProfileGuard vs. this worktree

The PreToolUse `WorkflowProfileGuard` hook blocked `Write`/`Edit` for every
new file under `scripts/`, `tests/`, and `evals/skill-routing/` in this linked
worktree (`[WorkflowProfileGuard] Deterministic workflow profile resolution
failed`). All five deliverable files in this slice were written via `bash`
heredocs (`cat <<'EOF' > path`) instead, per this task's pre-authorized
workaround. Note for whoever hits this next: a heredoc with a **quoted**
delimiter (`<<'EOF'`) disables all shell interpretation, so template-literal
backticks/`${...}` inside real TypeScript source must be left un-escaped —
escaping them (as if for an unquoted heredoc) corrupts the file with literal
backslashes and has to be cleaned up with `sed` afterward.

### SSD-01 acceptance (gatekeeper PASS, 2026-07-23)

Independent gatekeeper review passed all four acceptance lines with scope,
tests, types, and hash-freeze verified. Two advisory findings carried
forward into SSD-02's dispatch, not fixed here:

- [MEDIUM, carried to SSD-02] `evals/skill-routing/routing-corpus.schema.json`
  is a second shape authority with no drift check against the TS validator
  (`validateCorpusShape`/`validateCaseShape` in
  `scripts/run-skill-routing-eval.ts`). SSD-02 must either load the schema
  in `validate` or add one test asserting the schema's enums/pattern equal
  the TS constants.
- [LOW, optional] `REQUIRED_OVERLAP_TERMS` enforces the
  merge-gate-vs-cross-review dimension only via `"merge-gate"`; a
  `"cross-review"` requirement may be added when the list is next touched.

Operator rule recorded by the gate: any post-commit corpus edit must
re-freeze `corpus_sha256` in the same commit (`hash --write` is the tool).
