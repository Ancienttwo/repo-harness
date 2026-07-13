# Deployment Operations

`deploy/` is a commit-ready surface for deployment and operations runbooks, submission materials, release checklists, helper scripts, and env examples.

## Track

- `deploy/scripts/` for operational scripts.
- `deploy/submissions/` for submission or review materials.
- `deploy/runbooks/` and `deploy/release-checklists/` for operational documentation.
- `deploy/sql/` as the default SQL root for ordered files named like `0001_create_tables.sql`.
- `deploy/*.md` for runbooks and operating notes.
- `deploy/env/.env.example` for documented variable shapes only.

If `.ai/harness/policy.json` defines `operations.deploy_sql`, its roots, naming modes, and `invariant_file` are the sole authority for an established alternate SQL layout. When it is absent, SQL files remain direct children of `deploy/sql/` with `ordered4` names.

## Do Not Track

- `_ops/`
- private keys, real env files, provider state, production tokens, credential dumps, artifacts, logs, and local-only overrides

Keep external upstream checkouts and source references in `_ref/`; `_ref/` is ignored and must stay out of commits.
