# Codex fleet worker model mappings

> **Substantive Change SHA256**: `sha256:ac40ba6bef28237b9bd3aa3379443bb0ce5a82bcdef3b07c61289a236203dfbe`

The Codex installer override and packaged helper now select `gpt-6-luna` with
`xhigh` reasoning for fast-worker. The tracked persona and existing installer
expectations agree. Deep-worker selects `gpt-6-sol` with `high` reasoning. The
fleet mapping in the authored external-tooling reference config and its
projected documentation agree with the installer.

Verification on 2026-09-23: `bun test tests/install-agent-fleet.test.ts` passed
22 tests and 262 assertions. Hook, helper and reference-config projections,
deploy SQL order, architecture sync, strict task workflow, project inspection
and source-checkout init dry-run passed. Task-sync passed against this digest.

The installed global `repo-harness run capture-plan` entrypoint reported a
missing regular helper file; the repository's own `scripts/capture-plan.sh`
successfully captured the authorized plan. Global installation repair is
outside scope.
