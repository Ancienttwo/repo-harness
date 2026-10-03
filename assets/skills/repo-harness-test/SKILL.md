---
name: repo-harness-test
description: Write or select tests and real fixtures in the repo-harness source checkout. Exclude downstream projects, diagnosis, and acceptance decisions.
when_to_use: "repo-harness-test"
---

# repo-harness-test

Worker entrypoint. Confirm this is the repo-harness source checkout.

## Mode Selection

- Extend tests and select real fixtures: `references/authoring.md`.
- Select affected tests and inspect runtime cost: `references/running.md`.
- Move or remove tests without losing coverage: `references/refactor-evidence.md`.
- Assign checks to CI lanes: `references/verification-plan.md`.

## Boundaries

Follow the target repo's test instructions. Preserve assertions unless behavior
changes require them. Do not fabricate pre-fix logs or acceptance results.
Report command, result, revision, environment and incomplete coverage.
Diagnosis belongs to `hunt`; acceptance decisions belong to the Bot.
