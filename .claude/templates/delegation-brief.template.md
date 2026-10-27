# Delegation Brief

## Goal
Describe the requested observable outcome and the current input authority.

## Scope
List owned files and responsibilities, explicit exclusions and other active workers.
Preserve other workers' changes; do not broaden the task or add unrequested abstractions.
State any authorized deletion, credential/permission change or release/production operation.

## Verify
Name the build, typecheck and affected tests that the parent runs after integration.
State the expected observable result and relevant environment.
An implementation sub-agent may run scoped typecheck and affected tests in its own worktree. It commits early only in its own worktree, then returns its check results. In a shared checkout it does not commit; the parent commits.
An evidence role, such as a root-cause prover or an evaluator, runs the named check that is its task and does not commit.
Report commits, changed paths, unchecked assumptions and remaining risks.

## Rollback
Name the publication tag/commit and the exact revert command or bounded recovery action.
Return unresolved ownership or safety boundaries to the parent without mutating them.
