# PRD: Guarded Auto-Merge and Unattended Program Automation
> **Status**: Approved
> **Slug**: `guarded-auto-merge-unattended-program-automation`
> **Activation**: Deferred — Phase 3
> **Created**: 2026-08-28T23:21:55-07:00
> **Updated**: 2026-08-29T00:41:20-07:00
> **Source Spec**: `docs/spec.md`
> **Source Umbrella PRD**: `plans/prds/20260828-2321-collaborative-work-exchange-agent-succession.prd.md`
> **Depends On**: real collaboration evidence from `plans/prds/20260828-2321-collaboration-substrate.prd.md`
> **Depends On**: active independent Review/Verification gates from `plans/prds/20260828-2321-work-exchange-independent-review.prd.md`
> **Depends On**: provider merge capability canary
> **Baseline**: `main@456731f308b7ad54585ac50acbc510350a4c563c`
> **Tier**: standard
> **Deferral note**: 本 PRD 的设计资产完整保留，实现不在当前 active backlog。`MergeEligibilityV1` 保留为设计，不实现。
## AI Quick-Read Card
- **Problem**: current MergeReadiness can prove a publication is locally/provider ready, but no target-base automation policy, Host grant, budget, exact Merge Eligibility or crash-recoverable provider effect exists.
- **Users**: Maintainer, Runtime Operator, Program Orchestrator, Integration Engineer.
- **Platform**: current MergeReadiness, AcceptanceReceipt, Integration Acceptance, provider facts and git-common-dir stores.
- **P0 surface**: MergeEligibilityV1 and ProviderMergeCapabilityV1, read-only.
- **P1 surface**: AutomationPolicy, ProgramAuthorization, Budget Ledger, Merge Intent/Observation/Receipt, Host Merge Controller, low-risk canary.
- **Core metric**: zero unauthorized or duplicate merges.
- **Hard constraint**: merge is deterministic Host effect; no Engineer/browser mutation; candidate cannot self-authorize.
- **Key risk**: provider call succeeds but local process times out, causing duplicate retry.
- **Unknowns**: current repo has auto-merge disabled; merge queue and merge-group capability unknown.
- **Acceptance scenarios**: all gates current, target policy + local grant, exact head, provider capability, crash recovery, hard budget halt.
- **Suggested next step**: ship Merge Eligibility and provider capability observation before any merge submission path.
## Problem
### Existing Reuse Targets
| Existing component | Use |
|---|---|
| MergeReadinessV1 | live provider/local readiness input |
| PublicationReceipt | exact module candidate |
| AcceptanceReceipt | semantic acceptance |
| Review/Verification GateStatus | independent local gates |
| IntegrationEnvelope/ProductAcceptance | combined candidate |
| feedback/recovery | post-merge/task reconciliation patterns |
| provider-thread effect journal | persist-first/reconcile precedent |
| policy target base | automation maximum |
| Operator Board | read-only eligibility and halt display |
Current Integration Acceptance deliberately consumes an already-existing combined commit and does not build or merge it. This PRD preserves that boundary.
### Product Direction
```text
Current exact candidate
+ current gate receipts
+ current Acceptance
+ MergeReadiness
+ target-base AutomationPolicy
+ Host ProgramAuthorization
+ budget
+ ProviderMergeCapability
→ pure MergeEligibility
→ optional Host Merge Controller effect
```
Merge Controller never chooses architecture, interprets prose or waives a gate.
### Hard Constraints
- `guarded_merge.mode=disabled` by default;
- P0 is read-only;
- candidate branch does not own automation maximum;
- ProgramAuthorization is Host-owned;
- user waiver blocks auto merge;
- high/protected always Human;
- target base must remain unchanged in protocol 1;
- provider facts are reread immediately before submit;
- intent persists before provider call;
- uncertain outcome requires reconcile before retry;
- Engineer MCP and browser cannot call merge;
- merge controller cannot auto-merge its own authority code;
- no deploy/release automation.
### Recommended Defaults
```text
allowed risk = low
merge mode = disabled
allowed method = squash
require unchanged target base = true
max repair cycles = 2
grant expiry = bounded
unknown provider capability = unavailable
```
### Feasibility Boundary
**Confirmed**
- current MergeReadiness has exact publication/head/base/check/review/thread/mergeability blockers;
- AcceptanceReceipt binds exact normalized subject and target revision;
- existing provider effect journal demonstrates persist-first + observation + reconciliation;
- immutable git-common-dir stores and locks exist;
- current repo setting reports `allow_auto_merge=false`.
**[UNVERIFIED]**
- GitHub auto-merge and merge queue availability after settings change;
- merge-group check visibility;
- exact merged SHA readback across all merge methods;
- whether current provider credentials can submit merge in all adopted repos;
- cost precision from Provider runtimes.
## Goals
1. Produce pure MergeEligibility over all current gates.
2. Resolve maximum automation from exact target base.
3. Observe provider merge capabilities as typed facts.
4. Mint time-bounded Host ProgramAuthorization.
5. Track attempts/usage/repair/no-progress budgets.
6. Persist merge intent before effect.
7. Reconcile uncertain provider outcomes without duplicate submit.
8. Record immutable MergeReceipt.
9. Support low-risk auto-merge canary.
10. Provide one-unit-or-halt unattended program projection.
11. Display eligibility/budget/halt on Operator Board.
12. Keep manual workflow fully compatible.
## Non-goals
- semantic Review or Acceptance;
- building integration commit;
- update/rebase automation v1;
- merge queue support without canary;
- automatic release/deploy;
- browser merge button;
- Engineer merge tool;
- generic Git command or shell;
- high-risk auto merge;
- waiver auto merge;
- hosted scheduler;
- unlimited retries/spend.
## Users
### Maintainer
- Defines target-base maximum.
- Mints/revokes local program grant.
- Reviews exceptions and protected work.
### Runtime Operator
- Observes provider capability.
- Runs merge controller.
- Reconciles uncertain effects.
### Program Orchestrator
- Reads `program next`.
- Starts eligible external Agent/runtime unit.
- Stops on typed halt.
- Does not create authority from chat.
### Integration Engineer
- Produces existing combined candidate under ordinary execution Work Package.
- Does not merge through integration acceptance itself.
## Data Model
### MergeEligibilityV1
```ts
type MergeEligibilityDisposition =
  | "blocked"
  | "manual_ready"
  | "auto_ready"
  | "already_integrated";
interface MergeEligibilityV1 {
  protocol: 1;
  kind: "repo-harness-merge-eligibility";
  repository_id: string;
  subject_kind: "module_publication" | "integration_candidate";
  subject_id: string;
  subject_sha256: string;
  publication_id: string | null;
  head_sha: string;
  target_ref: string;
  target_revision: string;
  gate_policy_revision: string;
  gate_status_sha256: string;
  acceptance_receipt_sha256: string;
  merge_readiness_sha256: string;
  automation_policy_revision: string;
  program_authorization_id: string | null;
  program_authorization_revision: string | null;
  provider_capability_revision: string;
  risk_tier: "low" | "medium" | "high" | "protected";
  disposition: MergeEligibilityDisposition;
  blockers: readonly MergeEligibilityBlockerV1[];
  eligibility_sha256: string;
}
```
Closed blocker codes:
```ts
type MergeEligibilityBlockerCode =
  | "gate_policy_unavailable"
  | "review_missing"
  | "review_stale"
  | "review_changes_requested"
  | "verification_missing"
  | "verification_stale"
  | "verification_failed"
  | "acceptance_missing"
  | "acceptance_stale"
  | "acceptance_waived"
  | "merge_readiness_blocked"
  | "target_base_moved"
  | "risk_requires_human"
  | "protected_surface"
  | "integration_candidate_missing"
  | "program_authorization_missing"
  | "program_authorization_stale"
  | "program_budget_exhausted"
  | "provider_auto_merge_unavailable"
  | "provider_merge_queue_unavailable"
  | "provider_data_incomplete"
  | "changed_during_read";
```
Rules:
- emit all blockers in stable order;
- pure function after observations;
- unreadable/unknown produces blocker;
- no provider call;
- user waiver always adds `acceptance_waived`;
- `auto_ready` only when zero blockers and policy/grant both allow.
### AutomationPolicyV1
Maximum rules live on exact target base:
```ts
interface AutomationPolicyV1 {
  protocol: 1;
  kind: "repo-harness-automation-policy";
  enabled: boolean;
  allowed_risk_tiers: readonly ["low"];
  protected_path_globs: readonly string[];
  protected_capabilities: readonly string[];
  forbidden_subjects: readonly string[];
  allowed_merge_methods: readonly (
    | "squash"
    | "merge"
    | "rebase"
  )[];
  require_unchanged_target_base: true;
  maximum_program_duration_seconds: number;
  maximum_repair_cycles: number;
  policy_sha256: string;
}
```
Hard-coded protected subjects:
```text
Work Exchange authority
Gate Policy / Review / Verification receipt validation
AcceptanceReceipt authority
MergeReadiness / MergeEligibility
ProgramAuthorization / Budget
Merge Controller / provider adapter
branch/release policy
auth / credential / payment
destructive migration
```
Policy resolution:
- exact target ref/revision;
- no fallback to candidate;
- exact keys/digest;
- target movement invalidates grant/eligibility;
- candidate changes cannot apply to itself.
### ProgramAuthorizationV1
```ts
interface ProgramAuthorizationV1 {
  protocol: 1;
  kind: "repo-harness-program-authorization";
  authorization_id: string;
  repository_id: string;
  target_ref: string;
  target_revision: string;
  work_graph_revision: string;
  allowed_work_package_ids: readonly string[];
  allowed_risk_tiers: readonly ["low"];
  merge_mode: "disabled" | "manual" | "auto_merge";
  allowed_merge_method: "squash" | "merge" | "rebase";
  max_repair_cycles: number;
  budget: ProgramBudgetLimitV1;
  issued_by: string;
  issued_at: string;
  expires_at: string;
  authorization_sha256: string;
}
```
Grant properties:
- stored in `REPO_HARNESS_HOME`, not candidate branch;
- minted only by operator/Host profile;
- exact Work Graph/target;
- can narrow but never widen target-base policy;
- unavailable to Engineer MCP;
- explicit revoke;
- no prompt-derived grant.
### ProgramBudgetLimitV1
```ts
interface ProgramBudgetLimitV1 {
  max_agent_turns: number;
  max_provider_failures: number;
  max_repair_cycles: number;
  max_wall_clock_seconds: number;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  max_cost_micros: number | null;
}
```
### ProgramBudgetEventV1
```ts
interface ProgramBudgetEventV1 {
  protocol: 1;
  kind: "repo-harness-program-budget-event";
  event_id: string;
  authorization_id: string;
  unit_kind: "execute" | "review" | "verify" | "integrate" | "merge";
  unit_id: string;
  attempt: number;
  provider: string;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    cost_micros: number | null;
  };
  outcome:
    | "progress"
    | "no_progress"
    | "provider_failure"
    | "completed";
  observed_at: string;
  event_sha256: string;
}
```
Null usage stays null. Turns, failures, repair cycles and wall-clock remain enforceable.
### ProviderMergeCapabilityV1
```ts
interface ProviderMergeCapabilityV1 {
  protocol: 1;
  kind: "repo-harness-provider-merge-capability";
  provider: "github";
  repository_id: string;
  observed_target_ref: string;
  direct_merge: "available" | "unavailable" | "unknown";
  auto_merge: "available" | "unavailable" | "unknown";
  merge_queue: "available" | "unavailable" | "unknown";
  update_branch: "available" | "unavailable" | "unknown";
  required_checks_observable: boolean;
  required_reviews_observable: boolean;
  merge_group_checks_observable: boolean;
  evidence_refs: readonly {
    ref: string;
    sha256: string;
  }[];
  observed_at: string;
  capability_sha256: string;
}
```
Unknown is not available. Capability observation is evidence, not permission.
### MergeIntentV1
```ts
interface MergeIntentV1 {
  protocol: 1;
  kind: "repo-harness-merge-intent";
  intent_id: string;
  idempotency_key: string;
  repository_id: string;
  provider_repo_id: string;
  pr_number: number;
  subject_id: string;
  expected_head_sha: string;
  expected_target_ref: string;
  expected_target_revision: string;
  merge_method: "squash" | "merge" | "rebase";
  eligibility_sha256: string;
  authorization_sha256: string;
  state:
    | "prepared"
    | "submitted"
    | "reconciliation_required";
  intent_sha256: string;
}
```
### MergeObservationV1
```ts
interface MergeObservationV1 {
  protocol: 1;
  kind: "repo-harness-merge-observation";
  intent_id: string;
  attempt: number;
  outcome:
    | "submitted"
    | "merged"
    | "provider_failure"
    | "unknown_outcome";
  observed_head_sha: string | null;
  observed_target_revision: string | null;
  observed_merged_sha: string | null;
  provider_effect_ref: string | null;
  previous_observation_sha256: string | null;
  observed_at: string;
  observation_sha256: string;
}
```
### MergeReceiptV1
```ts
interface MergeReceiptV1 {
  protocol: 1;
  kind: "repo-harness-merge-receipt";
  intent_id: string;
  eligibility_sha256: string;
  authorization_sha256: string;
  provider: "github";
  provider_repo_id: string;
  pr_number: number;
  expected_head_sha: string;
  observed_merged_sha: string;
  observed_target_revision: string;
  merge_method: "squash" | "merge" | "rebase";
  merged_at: string;
  receipt_sha256: string;
}
```
### ProgramNextV1
Read-only one-unit-or-halt:
```ts
type ProgramNextV1 =
  | {
      kind: "repo-harness-program-next";
      disposition: "unit";
      authorization_id: string;
      unit_kind: "execute" | "review" | "verify" | "integrate" | "merge";
      unit_id: string;
      offer_or_eligibility_revision: string;
      next_sha256: string;
    }
  | {
      kind: "repo-harness-program-next";
      disposition: "halt";
      authorization_id: string;
      reason:
        | "no_eligible_work"
        | "human_attention"
        | "risk_boundary"
        | "budget_exhausted"
        | "authorization_expired"
        | "target_moved"
        | "reconciliation_required"
        | "no_progress";
      next_sha256: string;
    };
```
This projection does not launch a runtime.
## Merge Transaction
```text
1. recompute MergeEligibility
2. verify target-base AutomationPolicy
3. verify ProgramAuthorization and Budget
4. persist MergeIntent(prepared)
5. reread provider PR head/base/checks/reviews/threads/mergeability
6. CAS intent to submitted
7. submit bounded provider merge/auto-merge effect
8. persist observation
9. read back PR/target/merged SHA
10. persist MergeReceipt
11. reconcile existing task/publication lifecycle
```
Failure behavior:
- failure before step 6: safe retry;
- timeout after step 7: `reconciliation_required`;
- reconcile observes provider before any second submit;
- provider merged fact can reconstruct missing receipt;
- different merged head or target mismatch blocks reconciliation and escalates.
## Known Lifecycle Interaction
### Observed stranding: `finish --no-merge` and a reviewing Lease
现有 ship 路径存在一个已观察到的搁浅形态：publication 走 `finish --no-merge` 之后，本地 Lease 停在 `reviewing`，既不 reconcile 也不 abort，而 steal 路径拒绝接收这种状态。Provider 侧可能早已 merged，本地 claim 仍被当作活跃占用。任何未来的自动合并都会撞上同一形态，且比手工路径更容易把它变成重复提交。
### Required reconcile behavior for D3
未来 D3 的 reconcile 必须满足：
- 把「Provider merged 但 Lease 仍在 reviewing」当作一个已知的可恢复状态，不是损坏、不是异常终止；
- `MergeReceipt` 永远不直接释放 Lease；receipt 只记录 provider 事实；
- 释放走现有 publication reconciliation 与 canonical task closeout，不新增第二条收口路径；
- 超时之后第一件事是观察 Provider 状态，任何本地状态推断都排在观察之后；
- 绝不因为本地 Lease 未释放就重新提交 merge；未释放的 Lease 不是「未合并」的证据；
- merged fact、current publication pointer 与 reviewing Lease 三者必须可重新收敛到一致状态，收敛失败时升级 Human attention 而不是猜测。
### Boundary
这一节描述的是交互约束，不是本 PRD 交付的实现。Phase 3 激活前，`finish --no-merge` 的搁浅仍由现有手工恢复路径处理。
## Risk Policy
### Low
May be auto-merge canary when:
- target-base policy allows;
- no protected paths/capabilities;
- no interface change;
- no migration/auth/payment/deploy/release;
- Review pass;
- Verification pass;
- Acceptance external pass;
- unchanged target base;
- explicit grant;
- Provider capability available.
### Medium
Protocol 1 default:
```text
manual_ready only
```
A future policy may allow after real canary and stronger gates.
### High / Protected
Always:
```text
risk_requires_human
```
No local grant can override.
## Integration Groups
Module candidate:
```text
module gates → module completion
```
Tightly coupled program:
```text
module gates
→ IntegrationContract
→ existing combined commit
→ IntegrationEnvelope
→ AcceptanceMatrix
→ integration Review/Verify
→ ProductAcceptanceProjection
→ integration MergeEligibility
```
Individual module auto merge is blocked when Gate Policy merge scope is `integration_group`.
This PRD does not create the combined commit. Integration execution remains an ordinary Work Package.
## Program Automation
The Host loop may:
1. read ProgramNext;
2. invoke an external runtime for the named unit;
3. record usage/outcome;
4. reread canonical state;
5. continue or halt.
It may not:
- infer missing tasks;
- widen policy;
- synthesize gate pass;
- continue past uncertain provider effect;
- ignore budget;
- auto-waive;
- merge protected work.
Semantic checkpoints:
```text
publication
interface change
protected surface
integration envelope
no-progress
budget threshold
provider reconciliation
```
Two bounded no-progress outcomes halt rather than spin.
## CLI
```text
repo-harness merge capability --format json
repo-harness merge eligibility \
  --subject-id <id> --format json
repo-harness program authorize \
  --input <operator-owned-json>
repo-harness program revoke \
  --authorization-id <id>
repo-harness program status \
  --authorization-id <id>
repo-harness program next \
  --authorization-id <id> --format json
repo-harness merge prepare \
  --eligibility <digest> \
  --authorization <digest> \
  --idempotency-key <key>
repo-harness merge submit --intent <digest>
repo-harness merge reconcile --intent <digest>
repo-harness merge status --intent <digest>
```
## MCP / Authorization
Operator/Host profile only:
```text
merge_capability
merge_eligibility
program_authorization_create
program_authorization_revoke
program_status
program_next
merge_prepare
merge_submit
merge_reconcile
merge_status
```
Engineer profile may read MergeEligibility but cannot create grants/intents or submit effects.
## Operator Board
Read-only:
- risk tier;
- GateStatus;
- MergeReadiness blockers;
- MergeEligibility blockers;
- ProviderMergeCapability;
- ProgramAuthorization expiry;
- budget usage;
- current next unit or halt;
- merge intent/reconciliation state.
No merge button in this PRD.
## Persistence
```text
<git-common-dir>/repo-harness/work-exchange/v1/
  provider-merge-capabilities/<sha256>.json
  merge-intents/<intent-id>/
    events/<transition-id>.json
    current.json
  merge-observations/<sha256>.json
  merge-receipts/<sha256>.json
  budget-events/<authorization-id>/<event-id>.json
<REPO_HARNESS_HOME>/program-authorizations/v1/<repository-id>/
  <authorization-id>.json
```
Security:
- lstat ancestor chain;
- no symlink;
- canonical JSON;
- immutable records;
- bounded locks;
- idempotency conflicts;
- protected runtime path/env;
- no caller executable override;
- no candidate-controlled credentials;
- public errors redact local/provider diagnostics.
## Success Criteria
| Metric | Target |
|---|---:|
| Unauthorized provider merge submissions | 0 |
| Duplicate submissions under retry | 0 |
| stale Head/base merge | 0 |
| waiver auto merge | 0 |
| protected auto merge | 0 |
| candidate self-authorization | 0 |
| unit admitted after hard budget | 0 |
| uncertain effect continued without reconcile | 0 |
| positive low-risk canary calls | exactly 1 |
| each negative canary calls | 0 |
## Acceptance Scenarios
### Scenario 1 — pure eligibility
- Given all observed facts.
- When MergeEligibility is built.
- Then stable blockers/disposition are emitted with zero provider calls.
### Scenario 2 — current gates required
- Given stale Review or failed Verification.
- When eligibility is built.
- Then candidate is blocked even if GitHub checks pass.
### Scenario 3 — waiver blocked
- Given Acceptance disposition is user waiver.
- When auto eligibility is evaluated.
- Then `acceptance_waived` blocks auto-ready.
### Scenario 4 — target-base policy
- Given candidate relaxes AutomationPolicy.
- When eligibility is evaluated.
- Then exact target-base policy wins.
### Scenario 5 — missing grant
- Given all gates pass but no ProgramAuthorization.
- When eligibility is evaluated.
- Then manual-ready or blocked, never auto-ready.
### Scenario 6 — expired/stale grant
- Given grant target/work graph/expiry is stale.
- When prepare is requested.
- Then no intent/provider call.
### Scenario 7 — provider auto-merge unavailable
- Given capability is unavailable/unknown.
- When all local gates pass.
- Then no optimistic call.
### Scenario 8 — exact Head revalidation
- Given eligibility for Head A and provider PR now Head B.
- When submit runs.
- Then submit fails before provider mutation.
### Scenario 9 — crash before provider call
- Given prepared intent and process crash.
- When retry runs.
- Then same intent continues without conflict.
### Scenario 10 — crash after provider call
- Given merge succeeds but local receipt is missing.
- When reconcile runs.
- Then one receipt is reconstructed and no second submit occurs.
### Scenario 11 — provider unknown outcome
- Given submit timeout and PR not yet observable.
- When ProgramNext runs.
- Then typed reconciliation halt.
### Scenario 12 — budget boundary
- Given next event reaches exact hard limit.
- When another unit is requested.
- Then typed budget halt and zero mutations.
### Scenario 13 — protected path
- Given low-risk label but diff touches protected authority path.
- When eligibility is built.
- Then risk is promoted/blocked.
### Scenario 14 — integration group
- Given module publications under integration merge scope.
- When one module is ready.
- Then no module auto-ready exists.
### Scenario 15 — positive canary
- Given allowlisted low-risk fixture, current gates, unchanged base, capability and grant.
- When merge controller executes.
- Then exactly one provider call and one MergeReceipt.
### Scenario 16 — Board boundary
- Given new merge/program projections.
- When server routes are inventoried.
- Then no browser mutation route is added.
## Failure Matrix
| Failure | Required result |
|---|---|
| AutomationPolicy unreadable | blocked |
| ProgramAuthorization missing | no auto |
| grant expired | blocked |
| target moved | blocked |
| budget exhausted | halt |
| provider capability unknown | unavailable |
| checks pending | blocked/external attention |
| changes requested | repair |
| Head moved | blocked |
| base moved | blocked v1 |
| provider 403 | failure, no fallback |
| submit timeout | reconcile |
| merged SHA mismatch | human attention |
| duplicate idempotency payload | conflict |
| integration envelope stale | blocked |
| self-host subject | protected |
## Rollout
### Phase 0 — Merge Eligibility only
- pure projection;
- no intent store;
- Board/CLI read only.
### Phase 1 — Capability observation
- fixture repository;
- current repository readback;
- no settings mutation required by product.
### Phase 2 — Merge effect dry-run
- fake provider;
- fault injection after each stage;
- no real merge.
### Phase 3 — Low-risk canary
- explicit operator grant;
- non-protected fixture/canary repo;
- one candidate;
- unchanged target base.
### Phase 4 — Program automation
- budget + ProgramNext;
- auto merge remains canary;
- exception-only Human attention.
### Phase 5 — Broader adoption
Requires owner adjudication and separate policy update. No automatic promotion.
## Kill Gates
- provider adapter needs generic shell;
- exact Head cannot be read;
- duplicate submit under fault injection;
- candidate can mint/widen grant;
- user waiver auto-ready;
- protected subject auto-ready;
- base movement ignored;
- unknown capability treated available;
- Agent profile can merge;
- browser can merge;
- budget can be exceeded;
- reconciliation can be bypassed;
- integration module merges prematurely.
## Performance Targets
| Target | Number |
|---|---:|
| MergeEligibility pure projection | p95 ≤100 ms |
| ProgramNext after facts | p95 ≤100 ms |
| authorization read/validate | p95 ≤100 ms |
| merge prepare before provider I/O | p95 ≤500 ms |
| reconcile excluding provider latency | p95 ≤500 ms |
| provider call attempts per intent | ≤1 submit |
## Proposed File Map
```text
src/core/work-exchange/{merge-eligibility,program-authorization,program-budget,provider-merge-capability,merge-effect,program-next}.ts
src/effects/work-exchange/{automation-policy,program-authorization-store,budget-ledger,provider-merge-capability,merge-effect-store,merge-controller,program-next}.ts
src/cli/commands/{program-automation,merge-controller}.ts
src/cli/mcp/merge-controller-tools.ts
src/core/operator/merge-automation-snapshot.ts
```
## Test Map
```text
tests/unit/{merge-eligibility,program-authorization,program-budget,provider-merge-capability,merge-effect,program-next}.test.ts
tests/effects/{automation-policy,program-authorization-store,program-budget-ledger,provider-merge-capability,merge-controller,program-next}.test.ts
tests/cli/{program-automation,merge-controller,mcp-merge-controller-tools}.test.ts
tests/operator-web/{merge-eligibility,program-automation}.test.tsx
```
## Developer Handoff
- Implement MergeEligibility before provider adapter.
- Keep `guarded_merge.mode=disabled`.
- Read AutomationPolicy from exact target base.
- Store ProgramAuthorization outside candidate-controlled repo state.
- Build fake provider and fault-injection matrix before real canary.
- Do not support base update/merge queue in protocol 1.
- Do not expose mutation to Engineer MCP or browser.
- Verify all negative variants make zero provider calls.
- Release with auto-merge disabled by default.
## Known Unknowns
| Item | Impact | Resolution |
|---|---|---|
| auto-merge setting disabled | canary unavailable | explicit repo capability change/readback |
| merge queue | latest-base path unavailable | separate protocol/canary |
| merge-group checks | integration safety | observe before support |
| merged SHA readback | receipt recovery | provider fixture + real canary |
| cost precision | some limits unavailable | turn/failure/wall-clock fallback |
| medium-risk automation | not supported | future owner-approved policy |
