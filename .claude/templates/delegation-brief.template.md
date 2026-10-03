# Delegation Brief

## Goal
Describe the requested observable outcome and the current input authority.

## Scope
List owned files and responsibilities, explicit exclusions and other active workers.
Preserve other workers' changes; do not broaden the task or add unrequested abstractions.
State any authorized deletion, credential/permission change or release/production operation.

## Verify
Name typecheck and affected tests, the expected observable result and relevant environment.
One execution owner runs the final checks once; reviewers consume its recorded evidence.
Use `--timeout 60000 --max-concurrency 1` for affected Bun tests; hand long runs to the parent.
Report actual command outcomes, evidence limits, changed paths and remaining risks.

## Rollback
Name the publication tag/commit and the exact revert command or bounded recovery action.
Return unresolved ownership or safety boundaries to the parent without mutating them.
