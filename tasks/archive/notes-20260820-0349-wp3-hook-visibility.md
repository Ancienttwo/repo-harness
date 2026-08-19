> **Archived**: 2026-08-20 03:49
> **Related Plan**: plans/archive/plan-20260820-0159-wp3-hook-visibility.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-0349

# Implementation Notes: wp3-hook-visibility

> **Status**: Active
> **Plan**: plans/plan-20260820-0159-wp3-hook-visibility.md
> **Contract**: tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md
> **Review**: tasks/reviews/20260820-0159-wp3-hook-visibility.review.md
> **Last Updated**: 2026-08-20
> **Lifecycle**: notes

## Design Decisions

- **Shared derivation lives in `project-board.ts`, not a new module.** The
  contract's Allowed Paths contain no third core file, and the constraint turned
  out to be the right shape anyway: the derivation is exported from the module
  that already owns it (`deriveTaskState`, `deriveOwnershipDiagnostics`,
  `deriveColumn`, `deriveActions`, `deriveClaim`) over a narrowed
  `BoardOwnershipInput`. `projectBoard()`'s observable output is unchanged;
  `tests/board-projection.test.ts` (22 tests) is the guard and passed unmodified.
- **`BoardOwnershipInput.worktree_present` is tri-state.** `null` means no owner
  worktree was observed at all (a `reserving` lease names none), which is a
  different fact from `false` ("git no longer lists the one it names"). It maps
  the old `task.evidence !== null && !task.evidence.worktree_present` guard
  exactly, so `worktree_missing` and `orphan_reclaimable` keep their values.
- **The slice computes a column it never publishes.** `projectActions`'s
  `reconcile` offer keys off "blocked", so the slice passes `not_observed` into
  the shared `deriveColumn` and drops the result. Re-deriving a second blocking
  rule inside the slice was the alternative, and it is exactly the divergence
  the shared derivation exists to prevent. `column` stays structurally absent
  from `BoardSliceV1`.
- **Peers are only `reserving`/`bound`/`completing`.** A `released` or `unknown`
  lease names no live owner to coordinate with; reporting it as a peer would
  tell a spawned agent someone is working on a row nobody holds. Those shapes
  stay visible where they are actionable — on `self.diagnostics` when it is this
  tree's own row, and on the full board otherwise.
- **`self` carries a `steal` command for its own claim.** That reads oddly, but
  it is what the shared `deriveActions` offers for any givable lease, and the
  board prints the same. Diverging here would mean a second action rule.
- **Arming order is cost-ordered, not logic-ordered.** The claim-token scan (pure
  filesystem, 0.072ms measured) runs before `isLinkedWorktree` (a `git rev-parse`).
  Both are required, so the order is free to be chosen, and choosing it this way
  is what keeps the unarmed path at 0.028% of the baseline.
- **Token uniqueness is step 1 of the five, not part of arming.** The plan's T6
  list is explicit about this and it resolves what would otherwise be a
  contradiction with the Falsifier: arming requires ≥1 matching token, and the
  gate then refuses `lease_claim_token_ambiguous` when there is more than one.
  An ambiguous token that merely failed to arm would silently drop a real
  ownership anomaly.
- **Step 2 carries two reason tokens.** `lease_owner_unreadable` (no readable
  owner record, or the row left canonical) and `lease_owner_claim_mismatch` (the
  claim moved) are different operator actions — reconcile versus steal — so
  collapsing them into one token would make the message unactionable.
- **`resolveBoardSlice` returns null when `self` and `peers` are both empty.**
  Injecting a block that reports nothing would be noise in every repository that
  does not run a sprint, and it would have broken the pre-existing
  `subagent-handler` idempotence fixture for the wrong reason.

## Deviations From Plan Or Spec

- None. Every frozen verdict A–H landed as written.
- One in-scope addition beyond the literal T8 wording: the new files were added
  to §8's file-index table in `shared-coordination-plane.md`. That table is the
  document's own routing index and this work package adds files to exactly the
  layer it indexes; leaving it stale would have been drift introduced by T8.

## Falsifier Result

The contract's Falsifier — a linked worktree accumulating two claim tokens with
the same `unit_ref` and different `task_id` — was probed after T2 and does NOT
occur in real flows, so the pre-authorized minimal correction (composite
`(unit_ref, task_id)` match key) was NOT applied.

Evidence:

- `write_claim_token` is the only writer in the repository (`grep -rn claims
  src/ scripts/ assets/`): `scripts/sprint-backlog.sh` calls it twice, both
  inside `start-task`. The CLI verbs `bind`, `steal`, `release`, and `reconcile`
  never write a token.
- Inline mode writes into `.` with `unit_ref=inline:<sprint>#<index>`, which can
  never equal a `plans/plan-*.md` active-plan marker, so an inline token cannot
  arm the gate at all.
- Contract mode writes into the freshly created execution worktree with
  `unit_ref=<captured plan path>`; `capture-plan.sh` mints one plan path per
  invocation and one worktree per plan, so a linked worktree receives exactly
  one token.
- The reader's behaviour is pinned regardless, in
  `tests/board-slice.test.ts` → "two tokens with the same unit_ref report
  ambiguous, naming both", and the gate's refusal in
  "step 1 -- two tokens name the same unit".

## Cost Regression (contract Stop Condition)

Baseline: `PreToolUse.edit` p50 **256.2ms** (`.ai/harness/runs/hook-events.jsonl`,
n=41,485). The gate is purely additive, so its own cost is the delta.

Method A — component isolation (400 / 400 / 120 iterations, 20-iteration warmup,
median), on a real clone with a canonical sprint, a linked worktree, and a real
bound owner record:

```text
unarmed (stale token, no arm)      p50=0.072ms
unarmed (no claims directory)      p50=0.027ms
armed (token+git+collection)       p50=29.319ms

unarmed delta  0.072ms =  0.028%   (budget < 2%)
armed   delta 29.319ms = 11.444%   (budget < 15%)
```

Method B — end-to-end `runMutationGuard` median over the same fixture (80
iterations each), against a no-active-plan-marker control:

```text
no-marker (gate inert)         p50=91.870ms
unarmed (stale token)          p50=94.909ms
armed (full five steps)        p50=124.031ms

e2e unarmed delta  3.039ms =  1.19%   (budget < 2%)
e2e armed   delta 32.162ms = 12.55%   (budget < 15%)
```

Method B's unarmed delta is a deliberate overestimate: the control has no active
plan at all, so its Effective State resolution does less work for reasons
unrelated to this gate. Both methods clear both budgets.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| New shared core module for the derivation | Rejected | Not in Allowed Paths, and `project-board.ts` already owns the semantics — exporting is the smaller change |
| Slice publishes `progress_state: 'not_observed'` | Rejected | Advertises a dimension the document does not have; WP2's `actual_path_overlap` absence is the precedent |
| Slice re-derives its own "blocked" predicate for `reconcile` | Rejected | Second, quieter column rule that disagrees with the board on `stalled` rows |
| Arm on token existence alone | Rejected (verdict C) | Tokens have no GC; permanently arms any tree that ran one inline task |
| `isLinkedWorktree` before the token scan | Rejected | Puts a `git rev-parse` on every unarmed structured edit; would not have met the <2% budget |
| Ambiguous token as "does not arm" | Rejected | Drops a real anomaly silently; T6 makes uniqueness step 1 of the five |
| Reuse `session-context-budget` for the byte cap | Rejected (verdict G) | SessionStart-only surface with session-scoped dedupe — would blank the second subagent's slice |

## Open Questions

- None blocking. The claim-token GC gap is out of scope by the plan's Non-goals
  and is now a `tasks/todos.md` row; the `unit_ref` binding makes it harmless
  for this gate specifically, not repository-wide.

## Environment Notes

- `bash scripts/check-architecture-sync.sh` output is recorded under Evidence
  Links; it is deliberately outside the contract's `commands_succeed` because
  the bounded verifier's `scrubHarnessEnv()` strips `REPO_HARNESS_NODE_BIN`
  while archctx needs Node >=24 <26.
- Bun's `mock.module` patches the module registry in place, so an imported
  namespace object is live-bound: a spy that wraps `ns.fn` and then calls
  `ns.fn` recurses forever. `tests/board-slice.test.ts` snapshots the real
  module (`const realSliceInputs = { ...sliceInputs }`) BEFORE the `mock.module`
  call. The failure mode is a silent hang, not an error.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The Bun `mock.module` live-binding recursion trap is a candidate for
  `tasks/lessons.md` if a second test file hits it; one occurrence is not yet a
  pattern.
- §9 of `docs/architecture/shared-coordination-plane.md` already carries the
  durable design conclusions (mount points, cost basis, structural absence,
  `unit_ref` binding), so nothing further needs promoting from here.
