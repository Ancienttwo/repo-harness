# PM integration with main

## Scope and ownership

Integrate main `94face4506806d4b7f376d2e9761d5d26e70b5c6`, shared PM/Bot PR #608 `095d4b31aece1b3d65091cccd237679bb9174be1`, and bounded PM MCP PR #613 on an owned branch. Keep both existing PRs unchanged in base and ownership. No merge, release, deployment, credentials, or permission expansion.

Reuse the existing PM CLI/core, task IDs, task locks and fencing, operation receipts, pipeline evidence and immutable candidate approval rules. The Bot adapter exposes typed bounded operations; human names are not approval credentials.

## Integration decisions

Preserve main Pi metadata, optional peer and package check, OAR 0.45.1, in-process pipeline reader and package installation fixes. Build the hook bundle before both OAR hosts in every test entry, and retain the operator web build in prepack. Preserve the native PM acceptance lane and exact-candidate governance/functional workflow.

Reuse the latest #608 owner-generated architecture projections for its identical merged model. Local projection apply failed with AC_RUNTIME_UNAVAILABLE / EPERM while creating its normal Library runtime directory; no alternate runtime directory was used. Projection regeneration/check remains an explicit acceptance item.

## Acceptance

Run TypeScript and affected consumer tests, independent architecture/security review, and hosted exact-head governance and full functional/package-install acceptance. Preserve duplicate request, lost acknowledgement, interrupted executor and candidate SHA drift assertions. The W1 interruption fixture must observe kill(pid, 0) ESRCH before recovery, without weakening production locks or recovery assertions. Log observations; do not infer a demonstrated root cause from a later pass.

## Limits

Actual Dot remote connection, OAuth enrollment and event wake are unverified. Local native/HTTP acceptance and npm pack previously hit permission blockers; hosted execution is separately reported. A Draft PR is reviewable work, not a claim of completed acceptance.
