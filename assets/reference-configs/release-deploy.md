# Release Process & Deployment Reference

> Externalized: full runbook lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/runbooks/runbook-agentic-release-deploy.md`
- gbrain slug: `runbooks/runbook-agentic-release-deploy`

## Repo Role

This repo keeps deployment contract surfaces under `deploy/` and private runtime
state under ignored `_ops/`. Detailed release patterns, Cloudflare examples, and
rollback playbooks belong in the external runbook.

## Release Filings

Release filing documents live under `deploy/release-checklists/` and must use a
`YYMMDD-<package>-<version>.md` filename, for example
`260531-repo-harness-0.1.3.md`. The filing records the exact release scope,
source commit, verification, publish status, and any hold reason. Readiness
yellow flags from `repo-harness-check` must be recorded with either the accepted
reason or the concrete repair command, including Waza staging drift, gbrain
warnings, or non-authoritative dry-run eval evidence. Do not rely only on npm or
GitHub release metadata for this local audit trail.
