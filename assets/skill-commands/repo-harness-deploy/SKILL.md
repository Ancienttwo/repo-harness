---
name: repo-harness-deploy
description: Checks deploy and private operations configuration for an repo-harness harness without publishing or deploying.
when_to_use: "repo-harness-deploy, deploy readiness, ops config, deploy folder, _ops boundary, release deploy check, SQL order"
---

# repo-harness-deploy

Use this command when the user wants a focused deployment and operations
configuration check for the repo-local harness.

## Protocol

1. Confirm the target repo path and keep the pass read-only by default.
2. Read `.ai/harness/policy.json` and resolve the optional `operations.deploy_sql` contract before inspecting SQL paths. When absent, use `deploy/sql/` with `ordered4` names; when present, its roots, naming modes, and `invariant_file` are the sole alternate layout authority.
3. Check the tracked deployment surface:
   - `deploy/`
   - roots named by `operations.deploy_sql.roots` when configured, otherwise `deploy/sql/`
   - `deploy/env/.env.example`
   - release, submission, or runbook files when present
4. Check the private operations boundary:
   - `_ops/` is ignored
   - real env files, secrets, provider state, artifacts, logs, and scratch files stay under `_ops/`
5. Run:
   - `repo-harness run check-deploy-sql-order`
6. Report readiness gaps as concrete missing or misplaced files, not as an app deployment attempt.

## Failure Modes

- If `_ops/` contains required private state, report the path class without printing values.
- If `operations.deploy_sql` is malformed, stop at the policy error instead of guessing a layout.
- If deploy SQL order fails, stop at `check-deploy-sql-order.sh`.
- If the user asks to publish or deploy, route to the project release/deploy process instead of this read-only check.

## Boundaries

- Read-only by default.
- Does not publish or deploy.
- Does not migrate `_ops/` assets into `deploy/` unless the user explicitly asks for a repair/migration.
- Does not inspect or print secrets, tokens, or real environment values.
- Does not replace `repo-harness-check`; it only covers deploy and operations readiness.
