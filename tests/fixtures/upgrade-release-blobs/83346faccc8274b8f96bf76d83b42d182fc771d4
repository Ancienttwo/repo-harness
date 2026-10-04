# Claude acceptance review

SKILL.md's "Interpreting findings" and "Boundaries" describe the advisory
Codex modes. Claude acceptance is not advisory: it follows the typed receipt
and session lifecycle rules below instead.

Use only for an explicit Claude acceptance request and a contract with the
existing Claude Acceptance Policy (`protocol: 1`, `reviewer: "Claude"`).
Do not change the selected reviewer policy implicitly.

```bash
repo-harness run verify-sprint --prepare-acceptance
repo-harness claude-review round --contract tasks/contracts/<task>.contract.md --json
repo-harness claude-review status --contract tasks/contracts/<task>.contract.md --json
```

`status` returns the attach command for the owned herdr session. The pane shows
streamed assistant/tool activity and findings; raw provider events, requests,
results and receipt associations remain under `.ai/harness/runs/claude-review/`.
This is a persistent stream-json Claude process supervised inside herdr, not the
native Claude terminal UI. Never paste arbitrary input directly into the host.

A rejected review leaves the same provider PID and session alive. Fix the
findings, freeze the changed subject, prepare current verification, and run
`round` again. Session creation consumes one work-package review admission;
at most three rounds share it. Every previous finding needs an explicit open
or resolved disposition. Do not start a new session to bypass this budget.

Only a validated provider result bound to the current contract, goal, subject,
target revision and prepared evidence can reach `AcceptanceReceipt`.
A pane, transcript or prose PASS is not acceptance. The existing verifier and
merge gate consume that receipt without asking the provider again.

```bash
repo-harness run verify-sprint
repo-harness claude-review close --contract tasks/contracts/<task>.contract.md --json
repo-harness run contract-worktree finish
```

Close only after current acceptance passes, before removing the worktree.
The close command verifies the current passing receipt and its association
with this session's final round, sends stdin EOF, waits for exit and closes
its host. If needed it signals only the recorded, identity-checked process
group. Other panes and sessions are untouched. Evidence remains on disk.

For a timeout, crash, lost identity, malformed result, changed evidence or
ambiguous delivery, inspect status and explicitly cancel:

```bash
repo-harness claude-review cancel --contract tasks/contracts/<task>.contract.md --json
```

Cancellation is cleanup, never acceptance. Unknown delivery is not replayed;
closed or interrupted sessions are not automatically resumed or replaced.
Contract/goal changes require a new authorized task contract. Do not delete
runtime evidence to force a second admission.
