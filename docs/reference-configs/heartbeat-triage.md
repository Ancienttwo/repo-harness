# Heartbeat Triage

Heartbeat triage is the repo-local scheduled discovery loop. It records findings
for a human to review; it does not approve plans, execute fixes, spawn agents,
open PRs, or install a persistent scheduler.

## Command

Run from the repository root:

```bash
repo-harness run heartbeat-triage run --source scheduled
```

The command appends a run section to `.ai/harness/triage/inbox.md` and writes a
JSON snapshot under `.ai/harness/runs/`. Each run records:

- `workflow-check`: `repo-harness run check-task-workflow --strict`
- `sprint-next`: `repo-harness run sprint-backlog next` when an active sprint
  marker exists, with a read-only sprint-file fallback when it does not
- `drift-requests`: pending files under `docs/architecture/requests/`

## cron

Example cron entry for a local checkout:

```cron
17 8 * * * cd /path/to/repo && repo-harness run heartbeat-triage run --source scheduled >/tmp/repo-harness-heartbeat.log 2>&1
```

## loop

Example long-running loop for a supervised terminal, launch wrapper, or local
process manager:

```bash
while true; do
  cd /path/to/repo && repo-harness run heartbeat-triage run --source scheduled
  sleep 86400
done
```

## Adoption Review

Every run includes an "Adoption review due" date fourteen days out. The review
question is narrow: did the inbox produce any human-accepted triage item? If no
item is accepted during the review window, remove the scheduler and keep the
runner as an on-demand diagnostic command.

## Guardrails

- Keep scheduler installation manual and host-local.
- Treat workflow failures and drift requests as inbox entries, not process
  crashes.
- Keep `.ai/harness/triage/inbox.md` as runtime state, not a source-of-truth
  plan or task ledger.
- Keep execution authority in the normal plan -> contract -> verify flow.
