> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Implementation Notes: recovered-linked-worktrees

> **Status**: Active
> **Plan**: recovered from merged dirty linked worktrees
> **Contract**: (none)
> **Review**: (pending)
> **Last Updated**: 2026-06-01 01:28
> **Lifecycle**: notes

## Design Decisions

- Recovered useful code deltas from the deleted linked worktree archives instead of treating `_ops/worktree-cleanup` tarballs as the deliverable.
- Kept `plan-artifact-semantic-stems` because it changes runtime artifact naming for transient host slugs and includes tests.
- Kept `codex-attachment-context-priority` because it fixes current-input file precedence in SessionStart and Codex handoff resume prompts.
- Dropped old `tasks/todo.md` timestamp changes and standalone plan/contract/review scaffolds from `codex`, `prompt-guard-cli-rewrite-plan`, and `repo-harness-autoplan-repo-harness-ship-pr`; those were not executable feature deltas.

## Evidence Links

- Source archive: `_ops/worktree-cleanup/20260601T005853+0800-merged-linked-worktrees`
- Recovery branch: `codex/recovered-linked-worktrees`
