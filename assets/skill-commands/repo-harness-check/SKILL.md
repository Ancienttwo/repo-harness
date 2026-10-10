---
name: repo-harness-check
description: Plan scoped harness work, review a plan, or assess recorded checks and risk. Do not execute implementation or publish by default.
when_to_use: "repo-harness-check"
---

# repo-harness-check

Bot entrypoint for planning and verification decisions.
Confirm the repo, scope, subject revision and worker ownership.

## Mode Selection

- Create a plan only when a design decision needs it: `references/create.md`.
- Review an existing plan: `references/review.md`.
- Assess verification: consume commands, results, revision and environment.
  Ask the worker for missing checks from the target repo's agent instructions.
- Deployment readiness: `references/deploy-readiness.md`.
- Architecture or refactor evidence for a scheduling decision:
  `references/architecture-evidence.md`. repo-harness supplies the evidence;
  the Bot decides what to schedule.

## Boundaries

Ordinary tasks do not require an Approved plan or a contract file.
Reuse passing evidence only for its recorded subject. Run delta checks after edits.
Report failed, stale, timed-out or omitted coverage. Missing optional tooling is
a diagnostic. Use independent review for large changes, security/permissions,
or unresolved uncertainty. Review does not authorize implementation or publication.

For skill-effectiveness claims, require full_test_count > 0, dry_run_ratio <= 30%,
and graders reported. Mark non-authoritative: dry-run-heavy or all-dry-run evidence.
Mark unavailable: no current eval evidence.
Does not claim skill-effectiveness authority from dry-run benchmark output.
