# Control Bot integration boundary

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
revocation must be enforced before new requests and propagated through the normal
local revocation operation. A local reference is not a live upstream query.

The previous PKI design did not establish a non-bypassable current authorization
store. Its same-user rollback finding remains valid under that threat model.
User direction on 2026-10-25 places authentication and delegation with the Bot;
the harness now validates the authorized request contract. Signature/key-only
tests and the storage-home-as-authenticator test are therefore replaced, not
reported as cryptographic fixes. Binding, policy, scope, expiry, revision and
actual state-home redirection regressions remain.

Historical evidence: `rh-959-control-two-red.log` records two failures at
`fbc7fb13`; `rh-959-control-two-green.log` records two passes at `1b581732`;
`rh-959-control-baseline-home.log` records a baseline environment failure.
These results concern the earlier boundary. They do not validate this refactor.
The independent signed-waiver experiment at `37cc18a6f` remains unintegrated.
