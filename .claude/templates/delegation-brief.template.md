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
The sub-agent does not run build, typecheck or tests. It commits its slice early and returns early.
Report commits, changed paths, unchecked assumptions and remaining risks.

## Rollback
Name the publication tag/commit and the exact revert command or bounded recovery action.
Return unresolved ownership or safety boundaries to the parent without mutating them.
