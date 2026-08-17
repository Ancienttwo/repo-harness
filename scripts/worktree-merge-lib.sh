#!/bin/bash
# Single authority for "is this contract worktree branch already in the target".
#
# Sourced by scripts/contract-worktree.sh (single-slug cleanup) and
# scripts/ship-worktrees.sh (batch --cleanup-merged). Both entrypoints answered
# this same question independently and disagreed: the batch path checked
# ancestry only, so every squash-merged worktree -- which is every worktree
# under this project's house ship flow -- was reported unmerged and skipped,
# and worktrees accumulated without bound (issue #196).
#
# This file only decides merge state. It deliberately says nothing about
# whether a worktree is dirty: "dirty" and "unmerged" are separate refusals
# with separate remedies, and collapsing them would make the dirty guard
# unreachable through the merge check.

# Prints exactly one of `ancestor`, `absorbed`, or `unmerged` on stdout.
#
#   ancestor  -- the branch tip is reachable from the target.
#   absorbed  -- a conflict-free `git merge-tree --write-tree` of the branch
#                onto the target yields a tree identical to the target's, which
#                proves the branch adds nothing the target does not already
#                have. This is the squash-merge shape: squashing never makes
#                the branch tip an ancestor of the target, so ancestry alone
#                cannot see past it.
#   unmerged  -- everything else, including merge-tree command failure,
#                conflict, and a differing tree.
#
# Fail-closed: the branch is only merged when one of the two predicates proves
# it. Nothing here may widen into "probably merged".
worktree_merge_mode() {
  local branch="$1" target="$2"
  local target_tree merge_tree_output

  if git merge-base --is-ancestor "$branch" "$target" >/dev/null 2>&1; then
    printf 'ancestor\n'
    return 0
  fi

  if ! target_tree="$(git rev-parse "$target^{tree}" 2>/dev/null)"; then
    printf 'unmerged\n'
    return 0
  fi

  if merge_tree_output="$(git merge-tree --write-tree "$target" "$branch" 2>/dev/null)"; then
    if [[ "$merge_tree_output" == "$target_tree" ]]; then
      printf 'absorbed\n'
      return 0
    fi
  fi

  printf 'unmerged\n'
}
