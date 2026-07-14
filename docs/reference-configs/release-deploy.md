# Release Process & Deployment Reference

> Externalized: full runbook lives in default brain.

## Default Brain

- File vault: `brain/repo-harness/runbooks/runbook-agentic-release-deploy.md`

## Repo Role

This repo keeps deployment contract surfaces under `deploy/` and private runtime
state under ignored `_ops/`. Detailed release patterns, Cloudflare examples, and
rollback playbooks belong in the external runbook.

## Webapp Release Shape

- For a SaaS webapp with public SEO/SSR plus authenticated workspace, prefer one
  TanStack Start + Vite Cloudflare Worker under `apps/web`.
- Route `/` as SSR/prerender-capable public landing; route `/app` as client-only
  with route-level `ssr: false` when it owns auth, WebGL, or browser-only state.
- Deploy Start/Workers apps with `wrangler deploy`, not `wrangler pages deploy`.
- Keep API, Agent, MCP, queue, and storage Workers separate only when they own
  distinct runtime authority; static `apps/marketing` Pages is legacy/rollback
  or content scope, not the default SEO/SSR webapp shape.

## Release Filings

Release filing documents live under `deploy/release-checklists/` and must use a
`YYMMDD-<package>-<version>.md` filename, for example
`260531-repo-harness-0.1.3.md`. The filing records the exact release scope,
source commit, verification, publish status, and any hold reason. Skill eval
evidence must record `full_test_count`, `dry_run_ratio`, `grader_pass_rate`, and
`effectiveness_authority`; full-test evidence is authoritative, dry-run-heavy
evidence is non-authoritative, and missing eval evidence must be called out as
unavailable. Readiness yellow flags from `repo-harness-check` must be recorded
with either the accepted reason or the concrete repair command, including Waza
staging drift, CodeGraph version drift, or non-authoritative
skill eval evidence. Do not rely only on npm or GitHub release metadata for this
local audit trail.
