# Review a plan

Source facade: `assets/skill-commands/repo-harness-review`.

Read the supplied plan and source evidence. Check goal, scope, ownership,
data flow, error paths, verification and rollback. Review product, design or
DevEx only when those dimensions affect the task.
Report concrete findings and the smallest needed changes. Keep review read-only.
For an existing implementation, inspect its diff and recorded check evidence.
Do not create acceptance evidence or introduce another approval gate.

If no plan exists, report the missing input. If scope, checks or rollback are
missing, report those gaps before claiming readiness. Do not implement the plan.
