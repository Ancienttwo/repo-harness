# CRG Lane Dispatch Packet (closeout-authority-bootstrap -> CRG-02)

> **Authored**: 2026-07-18 15:40 (hand-written; survives hook regeneration)
> **Read this file as the lane's handoff authority.**

## WARNING about current.md / resume.md in this directory

The repo Stop hook regenerates `.ai/harness/handoff/current.md` and
`resume.md` on every session/subagent stop, and its auto-derived
"Exact Next Step" currently says:

    Clean up merged contract worktree codex/closeout-authority-bootstrap

That instruction is WRONG and destructive. The derivation treats the branch
tip (`be3e93ce`, an ancestor of main with zero unique commits) as "merged",
but the worktree holds 34 modified files of live UNMERGED work plus 4
untracked workflow artifacts. Running that cleanup destroys the WIP. Ignore
current.md/resume.md whenever they contradict this file. (Fixing the
derivation is in-scope for this lane's repairs.)

## Goal

Adjudicate the unmerged `closeout-authority-bootstrap` worktree WIP, land its
two ship-gate repairs, then plan and execute CRG-02 (the review/freeze/evidence
lifecycle state machine) as its own work-package.

## Where CRG-02 actually stands

- CRG-02 has NOT been started. No plan, contract, sprint row, or backlog entry
  exists anywhere. It is defined only negatively, as an out-of-scope marker:
  "CRG-02 review/freeze/evidence state machine"
  (`plans/plan-20260716-0338-closeout-runner-guardrails.md:163`,
  bootstrap plan lines 109/160). Planning it from scratch is part of this lane.
- Its live prerequisite is the unmerged bootstrap WIP described below.

## State of the world (verified 2026-07-18)

- `origin/main` = `3c9cf80a` (LSC-02 merge `2e97ded1` + sprint backfill docs
  commit). Merge sequence this week: CRG-01 `d8e5f221` (PR #83) -> LSC-01
  `64673ee2` (PR #82) -> LSC-02 `2e97ded1` (PR #84) -> backfill `3c9cf80a`.
- Worktree `/Users/kito/Projects/repo-harness-wt-closeout-authority-bootstrap`
  (branch `codex/closeout-authority-bootstrap`) sits at `be3e93ce` — behind
  all of the above — with 34 modified files and 4 untracked workflow artifacts
  (`plans/plan-20260716-1419-closeout-authority-bootstrap.md` + contract/notes/
  review, Status: Executing). All 34 dirty files differ from BOTH current
  `origin/main` and the merged CRG-01 branch content (verified file-by-file):
  live unmerged work, NOT cleanable.
- The bootstrap plan's goal (two repairs, still unmerged, still needed):
  1. Contract-scoped benchmark evidence applicability: a machine-readable
     `evidence_requirements` block in the contract decides required vs
     not_applicable; presence of `evals/harness/reports/profile-comparison.*`
     alone never creates a validation requirement; fail closed on missing or
     contradictory declarations.
  2. Freeze-before-archive merge-gate topology: `contract-worktree.sh finish`
     freezes candidate commit F, gates against F while the goal plan still
     exists, archives as separate commit L, and the receipt accepts L only
     when F is an ancestor and F..L touches only an allowlisted lifecycle
     path set.
- The plan's original framing ("unblock CRG-01's canonical ship") is overtaken:
  CRG-01 already merged via the manual push + Claude-gatekeeper-substitution
  pattern. The repairs themselves are NOT overtaken — they are the same
  standing defects tracked in `tasks/todos.md`, and every ship keeps paying
  the manual-pattern tax until they land.

## Exact Next Step

1. `git fetch origin` and pin the live base; confirm no other session has the
   bootstrap worktree open (`lsof`/`ps` cwd check).
2. Adjudicate the WIP in `/Users/kito/Projects/repo-harness-wt-closeout-authority-bootstrap`:
   rebase/re-target the 34-file WIP onto live `origin/main` and revise the
   plan's overtaken SHIP framing. Expect real conflicts: CRG-01/LSC merges
   touched `.ai/hooks/lib/workflow-state.sh`, `scripts/verify-sprint.sh`,
   `scripts/contract-worktree.sh`, `scripts/merge-gate.ts` and their `assets/`
   mirrors. Re-verify each todos-tracked defect against current main before
   repairing it (CRG-01 already raised verifier helper timeouts to 720s/900s —
   the 120s-wall todos row may be partially stale).
3. Add the handoff-generator defect to this lane's scope or ledger: the Stop
   hook's next-action derivation calls a dirty worktree "merged" from a pure
   branch-ancestry check (see WARNING above).
4. Ship the bootstrap package as its own independent PR (one package, one PR),
   then plan CRG-02 proper (capture-plan work-package) from the live
   post-bootstrap `origin/main` SHA.

## Landmines

- Codex CLI is quota-limited until 2026-08-16 (probed 2026-07-18: only the
  usage-limit error returns). External acceptance therefore uses the
  documented Claude-gatekeeper-substitution pattern — precedent and exact
  review-file wording in
  `tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md`
  and `tasks/reviews/20260718-1405-lsc-02-artifact-requirement-policy.review.md`.
- `repo-harness run verify-sprint` mechanical `guards.external_acceptance`
  fails closed regardless of actual acceptance (the benchmark fingerprint
  defect this very package repairs); do not "fix" it by falsifying evidence.
- `tasks/todos.md` rows on gate infra bugs and the solo-operator gap carry the
  full context; read them before re-deriving.

## Ownership (two parallel lanes — do not cross)

- THIS lane owns: `/Users/kito/Projects/repo-harness-wt-closeout-authority-bootstrap`,
  branch `codex/closeout-authority-bootstrap`, future CRG-02 plan artifacts.
- The OTHER (live) session owns: `repo-harness-loop-control*` checkouts, the
  LSC sprint rows (LSC-03 in progress), and primary-checkout docs commits to
  `main`. Do not start LSC rows, do not touch loop-control checkouts.
- `repo-harness-lsc-control*` leftovers are pending manual deletion by the
  user; leave them alone.

## Source Artifacts

- Spec: docs/spec.md
- Bootstrap plan: /Users/kito/Projects/repo-harness-wt-closeout-authority-bootstrap/plans/plan-20260716-1419-closeout-authority-bootstrap.md (untracked, inside the worktree)
- Bootstrap contract/notes/review: same worktree, tasks/{contracts,notes,reviews}/20260716-1419-closeout-authority-bootstrap.*
- CRG-01 plan (CRG-02 negative definition): plans/plan-20260716-0338-closeout-runner-guardrails.md
- Deferred ledger context: tasks/todos.md
