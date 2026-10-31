# Control Bot integration boundary

## Grok / minimal Bot profile

Use the [GrokBot init auto-exec guide](bot-onboarding.md) on connect.

A minimal Bot host loads `repo-harness-check` and lite working rules: brief,
edit, targeted verification, and review by risk. Exclude by default
`repo-harness-cross-review`, `repo-harness-herdr-portal`,
`repo-harness-chatgpt`, and control `review admit` / `review revoke`.
Skip the root router's required `herdr` skill load (`SKILL.md`) unless the
host actually drives Herdr.

## Control integration

The upstream Bot authenticates the human and enforces current delegation before
calling repo-harness. It must restrict this integration entrypoint to requests
that it has authorized. repo-harness does not authenticate arbitrary JSON,
`authorization_ref`, `bot_id`, action names, execution actors or GitHub logins.

`review admit --request <file>` consumes `{admission, approval, expectedRevision}`.
`admission.execution_mode` is required and accepts only `contract` or `inline`.
The trusted upstream Bot selects this workflow mode explicitly. It does not
change the admitted session transport or waive verification. The mode is part
of the exact admission digest. A mode change requires new approval and a new
active grant; the campaign identity and budget scope stay the same. Missing mode
is rejected, including in previously serialized admission requests.

`approval` uses the closed `ControlApproval` schema in
`src/core/review/control-delegation.ts`. It binds the upstream reference, Bot,
repository, issue, campaign, execution actor, parent issue/path scope, complete
policy fields, benchmark requirement, expiry, local root, revision and exact
admission digest. The Bot and execution actor must differ. Validation returns a
detached frozen snapshot. Expiry uses epoch milliseconds and is exclusive.

The normal `admit` action requires `user_waiver: forbidden`. The separate
`admit-with-waiver-eligibility` action requires explicit upstream authorization
for eligibility. It does not grant a waiver. Ordinary admission cannot infer this
action. A user waiver remains a separate upstream-authorized decision and grant;
its consumer must enforce that boundary. Action strings do not authenticate it.

The local store keeps revision CAS, active-record checks and approval history.
Default state uses the OS account home, not launch-time `HOME` or
`REPO_HARNESS_HOME`. File ownership and link checks prevent accidental scope and
file-location errors. They do not prevent a malicious process with the same OS
user from rewriting or rolling back active/history files. This integration makes
no irreversible local authorization or rollback-resistance claim. Upstream
revocation must be enforced before new requests and propagated through
`review revoke`. A local reference is not a live upstream query.

## Bot modes and merge

A Bot works in one of two modes. Both modes merge through the same executor,
`repo-harness publication merge`.

| Mode | Dispatch | Acceptance | Merge |
|---|---|---|---|
| Local Herdr | MCP `orchestrator` profile Herdr tools, or a Herdr pane | The worker produces check results locally. Acceptance panes (gatekeeper, cross-review) review those results | MCP `merge_pull_request` (same executor; the audit line carries the OAuth-derived attribution) |
| Cloud only | GitHub issues and comments | CI, and the `acceptance record` on the PR | The cloud sandbox has repo-harness installed, a working `gh auth` (the token needs Administration read permission) and a checkout of the repository. It runs `repo-harness publication merge` |

- A Bot record does not grant merge permission. This covers `review admit`
  grants and `acceptance record` comments. The executor merges only when
  `publication.acceptance_merge` is `on` in `.ai/harness/policy.json` on the
  PR base SHA. With `off`, it exits 3 and merges nothing.
- The executor needs default-branch protection with strict required checks
  and enforce_admins. Without them it refuses with
  `base_protection_insufficient`.
- The Bot owner manages the GitHub token permissions. In cloud-only mode the
  token needs Administration read permission, so that the executor can read
  branch protection. Without it the executor refuses with
  `base_protection_insufficient`.
- Exit codes and the handling of each: the
  [issue-flow orchestrator guide](../assets/skills/repo-harness-issue-flow/references/orchestrator.md).

### Required-check coverage

A repository can declare the paths that need the full required-check matrix.
The block lives in the protected `publication` subtree, so a PR cannot change
the rule it is merged under.

```json
"publication": {
  "acceptance_merge": "on",
  "required_check_coverage": {
    "protected_paths": ["api-surface/**", "docs/protocol.md"],
    "required_checks": ["Required / CI", "build, typecheck, test (matrix)"]
  }
}
```

- An absent or empty block keeps the current behavior.
- `*` matches inside one path segment. `**` matches zero or more segments.
- When a changed path matches a protected glob, every declared check must be
  present in the PR check list with bucket `pass`. A missing, skipped, pending,
  failed or cancelled check blocks with `required_check_coverage_missing`. The
  blocker names the protected path, the check and the fix.
- The declared check is read from the PR check list, not from branch
  protection. A skipped matrix job is therefore visible.
- The only waiver is a check named `coverage-waiver` with conclusion success on
  the same PR head. The protocol 4 acceptance record stores the waiver, the
  protected paths and the per-check bucket. No local waiver file and no
  executor flag exists.
- A malformed block fails closed with
  `required_check_coverage_policy_invalid`.

## Revocation

`review revoke --request <file>` consumes
`{repository_id, issue_id, campaign_id, expectedGrantSha256, expectedRevision}`.
The request uses the same closed-object check as `review admit`. The
`grant_sha256` and `revision` that `review admit` returns are the expected
values. The store compares both values with the active record under the
approval lock. A stale digest, a stale revision or an unknown campaign fails and
changes no state. A successful revocation publishes a new revision with no
active grant. Every task consumer then rejects the old grant as revoked. A new
grant requires a new `review admit` request.

## Approval expiry covers the campaign

Acceptance receipts and review contexts bind `grant_sha256`. Every protected
read checks the approval expiry again. An expired approval therefore stops
verification, review rounds and acceptance for the campaign. A renewal creates a
new grant with a new digest. Receipts, verification reuse and contexts for the
old grant become stale, and the next review starts a new round. A campaign has
at most `REVIEW_MAX_ROUNDS` (3) rounds, so a renewal after a PASS can spend the
last round. The Bot must set `expires_at` in the approval and the parent scope
to cover the full campaign through merge.

## Accepted residual risk: no caller authentication

`review admit` and `review revoke` do not authenticate their caller. Any process
of the same OS user can run them. That process can mint a grant from a
well-formed request or revoke the active grant. The only identity rule is that
`bot_id` differs from the execution actor. User direction on 2026-10-25 assigns
authentication and delegation to the Bot. The harness accepts this risk. It
validates the request contract, scope, expiry and CAS only. An unauthorized
revocation stops work. It cannot grant authority.

## History

The previous PKI design did not establish a non-bypassable current authorization
store. Its same-user rollback finding remains valid under that threat model.
The harness now validates the authorized request contract. Signature/key-only
tests and the storage-home-as-authenticator test are therefore replaced, not
reported as cryptographic fixes. Binding, policy, scope, expiry, revision and
actual state-home redirection regressions remain. Pull request
https://github.com/Ancienttwo/repo-harness/pull/959 records this change.
