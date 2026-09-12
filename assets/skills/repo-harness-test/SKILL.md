---
name: repo-harness-test
description: Testing entrypoint for this repository - how to author a test and pick a fixture, which tests to run and how to measure them, what evidence a test refactor owes, and how to write a contract's Verification Plan. Triggers include 寫測試, 加測試, 測試太慢, 重複測試, 全量測試, test fixture, 跑哪些測試, 測試文件, write tests, test plan, slow tests, full suite. Not a debugging entrypoint and not a review entrypoint.
when_to_use: "repo-harness-test, 寫測試, 加測試, 測試太慢, 重複測試, 全量測試, test fixture, 跑哪些測試, 測試文件, write tests, test plan, slow tests, full suite"
---

# repo-harness-test

Router for testing work. Policy prose is owned elsewhere; this package carries
only executable technique and the tools this repository actually ships.

## Mode Selection

- About to write, extend, or name a test, or choosing a fixture -> `references/authoring.md`.
- Choosing which tests to run, or finding where suite time goes -> `references/running.md`.
- Moving, splitting, merging, or deleting tests, and owing proof that nothing was lost -> `references/refactor-evidence.md`.
- Writing a contract's `Verification Plan`, or deciding which CI lane a change lands in -> `references/verification-plan.md`.

## Boundaries

- Testing policy authority is `docs/reference-configs/sprint-contracts.md`,
  section `## Testing Policy and Artifact Standards`. This package restates
  none of it and creates no second policy; when the two appear to disagree,
  that section wins and this package is wrong.
- Not for diagnosing a failure's root cause; that is `hunt`.
- Not for reviewing a diff, PR, or release readiness; that is `check`.
- Runs nothing on the user's behalf, writes no acceptance evidence, and never
  edits a contract's recorded results.
