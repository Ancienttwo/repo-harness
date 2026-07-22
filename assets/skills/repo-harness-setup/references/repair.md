# Setup Mode: Repair

Source facade: `assets/skill-commands/repo-harness-repair`.

Use when the repo has a harness but a specific workflow surface is broken.
Run the shared preflight in `../SKILL.md` first.

## Protocol

1. Reproduce the failure and name the failing surface.
2. Trace the failing path, such as `settings.json -> repo-harness-hook -> route registry -> typed handler` or `plans/ -> tasks/todos.md -> tasks/contracts/`.
3. Apply the smallest targeted fix.
4. Re-run the failing check and the relevant workflow gate.

## Failure Modes

- If the failure cannot be reproduced, report the missing evidence and stop before editing.

## Boundaries

- Do not use repair to scaffold product code.
- Preserve unrelated dirty worktree changes.
