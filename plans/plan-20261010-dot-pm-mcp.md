# Bounded Dot PM MCP adapter

> **Status**: Implemented for local verification
> **Dependency**: PR #608 at 36722705a3d378cbf2e29f30580d2fec1e09f216

P1: The existing PM boundary owns five closed task operations. Fleet claims,
linked worktrees, canonical requests and TaskResult remain the authorities.
Dot is a controller. It receives no general coding or shell tools.

P2: Local stdio MCP projects the shared PM schemas. A trusted server file fixes
the repository, authorization revision and allowed operation set. Requests pass
through the existing CLI response contract and PM core locks. Operator admission
precedes launch. Canonical IDs connect dispatch and result collection.

P3: Add an early closed PM server route. Do not alter other MCP profiles or copy
the PM core into main. Add inactive HTTP support with the existing OAuth
principal and session binding. Require enabled v3 PM setup, the PM token scope,
current grant revision, and the exact server-bound repository. Do not activate
a connector or create credentials. Normal setup enrollment remains a follow-up.
Keep the operator scope file outside all linked worktrees. Configuration changes
fail closed. Reuse canonical receipts after lost responses. No extra task ledger,
approval store or credentials are introduced.

The #608 acquisition warning describes an operator prerequisite. It is not
permission for the Bot to acquire or approve work. No admission mutation tool
is added. The controller guide states candidate and live connection limits.

Implement and test the adapter as a minimal patch against the exact #608 head.
Keep main-only publication checks intact. The independent main-based Herdr CI
fix provides checksum-verified macOS runtime installation before native tests.
Integrate that fix, update and verify #608, then apply this adapter patch.
Do not merge, release or activate a live connector in this task.

Verification: typecheck, PM and real stdio tests, existing transport and policy
tests, package guide inventory, state boundaries and context map. Verify native
coding lifecycle separately. Record blocked or skipped checks as such. Tests
cover response loss via stable request collection, pending results, stale task
and claim fences, server action/repo restrictions and authorization revocation.
No fixture result establishes real provider or Dot platform acceptance.

HTTP delta: test token profile, scope, owner, revision, and revocation with the
real OAuth provider and SDK in-memory transport. Test owner-selective session
closure in the existing store. Keep real HTTP list/call/GET/DELETE and revocation
coverage. Loopback listen is denied in the current sandbox. That wire test is
blocked, not passed. Independent review must check both the new HTTP route and
the change from the old HTTP refusal assertion to disabled-v3 refusal.

Security review repair: the adapter must fence queued effects inside each
existing lock, not only before and after the async CLI call. Carry a trusted
synchronous guard through PM, coding-session and task-session. Guard every new
effect after a wait. Keep existing unknown-outcome evidence for an issued effect.
Bind the canonical PM repo/action fingerprint to consent, access and refresh
grants. Old grants must fail after a restart with changed scope at the same
registry revision. These changes extend the existing #608 owners. They do not
copy a core, add a ledger or accept guard fields from a model.

## Temporary CI integration dependency

The first hosted PM candidate failed the macOS native job before PM acceptance.
Its runtime path did not install pinned Herdr. Reuse Draft #612 source commits
eda3749f677c461464a4d37cb8ce03b937404371 and
a451d164049b6d8f1231bde7df5d04a8f30aa074 on this owned branch.
Keep the #608 native OAR step and all test arguments. Resolve only the step
name in the two installation-order assertions. No test assertion is removed.
This branch still targets unmerged #608. It is an integration review only.
It does not pass main-only merge readiness. After #608 lands on main, retarget
and verify the new exact base and candidate. #612 remains a separate main PR.
Local native and HTTP commands remain blocked. Use the hosted affected lane
and verify that tests/cli/pm.test.ts and its real HTTP case run without a skip.

The combined macOS candidate then ran all native cases and found one Bash
start failure. The empty freshness_args array exits under Bash 3.2 nounset
before checkout creation. The unchanged main comparison already reproduced
this error in the worktree tests. Use the existing safe optional-array
expansion idiom. Keep every existing test assertion. The owning worktree
test file passed 25 tests and 237 assertions locally after the one-line fix.
Hosted native recovery and PM HTTP must still run on the final candidate.
