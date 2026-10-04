# BRC next-stage integration

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## User direction and stage boundary

On 2026-09-08 the owner stated that repeated GitHub Connector tests were sufficient and directed moving to the next phase. Further BRC6a diagnostic probes are stopped; the prepared one-call live-stream probe is not dispatched or funded. Existing successful GitHub activation/content reads are retained. This decision does not manufacture exact-version evidence or mark active admission/fresh audit accepted.

This integration combines already accepted alignment `1f9be5cb` and provider/default/app `522aa04b` (tracked tree identical to accepted closeout `60d4b4dd`) from base `33c5012e`, then refreshed onto published PR #352 main `38c26b2a`. The candidate lives in `codex/brc-next-stage-integration`; dirty main readiness WIP is preserved (all seven files byte-identical across the disjoint fast-forward). Oracle candidate code stays separately isolated; no global install, GPT call, GitHub write or release occurs here.

## Combined behavior and conflict resolution

Campaign authoring now carries both the frozen capability registry/strict metadata schema and explicit GitHub app activation, with no injected model/thinking. Complete snapshot policy and descriptor-only provider identity remain required. A completed answer or console Session ID cannot become a trusted provider handle. Existing exact-revision admission remains fail closed.

The only test conflict was an older fixture assertion accepting a console-derived provider ID. The accepted provider package removed that authority, so the combined fixture expects no provider ID without a descriptor and retains model.verified=false. Source files merged without textual conflict and were inspected for the combined schema, registry and app fields. The generated architecture manifest keeps a valid input pending canonical combined-subject materialization; neither old manifest proves the new source subject.

No new product API, dependency or runtime authority is added. The new research file records the stage decision and merge provenance; plan/contract/review/notes are the required isolated integration workflow. Earlier package reviews retain their original subjects; only the combined boundary receives new verification.

## Verification and remaining work

The contract names combined authoring, metadata reconciliation, policy/store, campaign CLI, ChatGPT browser and descriptor suites plus TypeScript and six repository-integrity checks. Final execution results are held in the canonical prepared evidence and projected review. No full suite or additional Connector experiment is required for this merge boundary.

Next implementation ownership is BRC14 fresh audit and ordered group baseline consumption, followed by the BRC15 model-free matrix. The historical `brc14-readiness` branch is research input only: it predates current main's admission correction and must not be merged as production code. BRC14/BRC15 remain pending until their actual criteria are implemented and tested; stopping diagnostics does not waive their evidence boundary.

## BRC14 next work-package map

Read-only tracing confirms four owning boundaries on the integrated candidate:

- `development-campaign-store.ts#appendDevelopmentCampaignEvent` guards cleanup for begin/prepare/complete, but accept_group has no typed fresh-audit consumer. Opaque event evidence_refs alone cannot authorize acceptance.
- `gpt-pro-issue-authoring.ts#startIssueBatchAuthoring` and continuation still use campaign.target_revision for every group; current lifecycle must own the group number and previous accepted audit must own the next baseline.
- `campaign-closeout.ts` cleanup receipts bind individual Task merge/topology proof, not a complete group snapshot. Audit input must include every adopted/unfilled slot and a single final target revision with merge ancestry checked.
- `core/automation/budget.ts` and budget-store provider operations have no audit operation. Audit must charge provider calls without incrementing authoring rounds, run in a fresh session and reject reuse of any group authoring session.

The next coherent package therefore owns complete group-closeout snapshot production, actual fresh-audit observation, shared-store acceptance/complete gating and rolling-baseline consumption together. A standalone caller-authored trusted receipt would create false authority and is not sufficient. Missing trusted revision evidence must remain unverified; model-free tests can prove rejection, sequencing and accounting without claiming a real accepted audit. No new BRC6a probe is a prerequisite for implementing those paths.

Targeted scenarios: wrong SHA, missing version proof, reused authoring session, omitted/unfilled slots, naked accept_group, duplicate CAS acceptance, G2/G3 baselines, skipped groups/Group4/early complete, audit charging independent of authoring rounds, and bounded unverified retry with no main rollback. The older readiness worktree also contains unrelated active/untracked BRC15a artifacts, so the next package needs its own isolated worktree based on this integration candidate.
