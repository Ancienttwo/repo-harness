# Workflow Orchestration Reference

> Externalized: full pattern lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/patterns/pattern-agentic-workflow-orchestration.md`

## Repo Role

Ordinary tasks use the PR description, per root `AGENTS.md`. The GitHub issue and
PR own task identity, claim, dependencies and status. Checks stay required for
every change. The general multi-phase orchestration pattern belongs in the
external pattern page.

## Slices

Split work by issue and PR. A slice gets its own PR only when it needs a separate
verification or rollback boundary, touches a high-risk surface, or runs in
parallel with disjoint write ownership. Slices that write the same files in
sequence go into one PR.

Do not create a plan, sprint, contract, review or notes file to coordinate a
slice. Put the scope, ordered steps, acceptance checks and dependencies in the
issue. Put the result, checks, risk and rollback in the PR.
