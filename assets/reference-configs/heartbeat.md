# Heartbeat Triage

`scripts/maintenance-triage.sh --heartbeat` is the lightweight scheduled loop
for repo-harness triage. It appends one snapshot per run to
`.ai/harness/triage/inbox.md` and leaves adoption decisions to the human owner.

Each run records:

- `check-task-workflow.sh --strict` status and output.
- `sprint-backlog.sh next` status and next-task output.
- Pending architecture drift request files under `docs/architecture/requests/`.
- A two-week adoption review date for deciding whether the heartbeat produced
  useful human-adopted triage items.

Cron example:

```cron
*/30 * * * * cd /path/to/repo && bash scripts/maintenance-triage.sh --heartbeat
```

Loop example:

```bash
while sleep 1800; do
  bash scripts/maintenance-triage.sh --heartbeat
done
```

The heartbeat must not auto-approve plans, auto-merge worktrees, or hide failed
checks. It writes an inbox entry even when a probe fails so the failure is
visible at the next human review.
