# External Verification Evidence Contract

## Context

Runtime-heavy projects can prove completion outside ordinary source files and
unit test output. Unity, browser E2E, mobile simulators, hardware rigs, games,
and staging smoke tests may produce the relevant logs, screenshots, traces, or
device output. The existing harness already has review evidence, checks, run
traces, and external acceptance surfaces, but it does not name how external
validators should hand evidence back to those surfaces.

## Decision

Document a v1 external verification evidence convention as provider-generated
evidence ingestion, not provider invocation. External tools keep their own
runtime, trust boundary, command execution, and cleanup. `repo-harness` only
needs a small manifest plus relative artifact references that review and
handoff flows can cite.

The public reference should say explicitly that this is a convention only today:
`repo-harness` does not yet discover, summarize, or gate on these manifests
automatically. That wording avoids implying an implemented check gate before
manifest ingestion exists in code.

The recommended path uses the existing ignored runtime evidence surface:

```text
.ai/harness/runs/external/<task-id>/<run-id>/manifest.json
.ai/harness/runs/external/<task-id>/<run-id>/artifacts/...
```

This fits the current information lifecycle better than adding a new committed
evidence directory. Durable conclusions still belong in `tasks/reviews/`,
`tasks/contracts/`, `tasks/notes/`, or project documentation after redaction.

## Non-goals

- Do not add Unity, Playwright, mobile, hardware, or staging-specific execution
  logic to repo-harness.
- Do not define a full plugin permission system in this slice.
- Do not make missing external evidence count as a pass. Missing, skipped, or
  partial external manifests remain validation gaps.

## Follow-up

Future implementation work could teach `repo-harness check` or review rendering
to discover `repo-harness.external-evidence.v1` manifests and summarize their
outcomes, artifacts, and validation gaps.
