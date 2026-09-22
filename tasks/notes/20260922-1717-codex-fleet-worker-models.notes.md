# Codex fleet worker model mappings

> **Substantive Change SHA256**: `sha256:23d7fc337a37d6de7bc0b86f910c9ccc94054fc4a67633fd30ebe47a1915ded0`

The Codex installer override and packaged helper now select `gpt-5.6-sol` with
`medium` reasoning for fast-worker. The tracked persona and existing installer
expectations agree. Deep-worker selects `gpt-5.6-sol` with `high`
reasoning. Claude mappings and global installations were outside this change.

Verification on 2026-09-22: `bun test tests/install-agent-fleet.test.ts` passed
22 tests and 262 assertions. Hook, helper and reference-config projections,
deploy SQL order, strict task workflow, project inspection and source-checkout
init dry-run passed. The pending automatic architecture projection completed
with zero pending jobs or dead letters. Task-sync passed against the updated digest.

The installed global `repo-harness run capture-plan` entrypoint reported a
missing regular helper file; the repository's own `scripts/capture-plan.sh`
successfully captured the authorized plan. Global installation repair is
outside scope.
