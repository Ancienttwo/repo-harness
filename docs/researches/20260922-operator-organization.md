# Operator Organization observation

AKN-05c evolves the existing collaboration GET into a required protocol2 envelope. WorkExchange remains a nested protocol1 source document; no old top-level transport is accepted. WorkExchange and Engineering Board each return observed or source_unavailable with a timestamp. A registry/identity failure refuses the response; an ordinary source read failure preserves the other source. Existing worker deadlines, repository single-flight and HTTP Host/Origin boundaries apply. No new route, config, provider call or durable store is introduced.

`collectEngineeringBoard` remains the semantic authority for profiles, Binding, ClaimActor receipt, message/runtime-effect counts and Organization Attention. Its source validators run before redaction. `organization-snapshot.ts` has browser-safe strict shape validation and removes provider_thread_id, host_id, worktree_path, branch and unit_ref. Counts, reasons and owner vocabulary (maintainer/module_engineer/runtime_operator) are copied, not mapped into a new authority. In particular, the Engineering Overlay task_revision uses its original sha256-prefixed representation. A Claim or pending effect is not running proof.

The organization transport permits at most200 Engineers and1MiB JSON; exceeded limits return source_unavailable, never a truncated roster or false total. Upstream source health, consistency, registry revision and source digests remain visible. Component unavailable and unsupported are different observations. The browser makes one request per selected repository and refresh generation, starting before Task selection; opening/closing Task details shares that observation. Repository changes abort old requests and rendering rejects an old repository key. Original Composer/TaskDiff behavior remains unchanged.

The default page presents Organization below automation supervision and above the Worklist. Original source details are plain text, with14px body and44px disclosure controls; no arbitrary path links or executable content. WorkExchange remains in the secondary overview and Task detail.

## Remaining three-view authority gaps

Planning still needs the canonical Work Graph/dependency projection and navigation. The exact source readers are `readProjectedWorkGraphAt` and `resolveDependencyObservation` in effects/engineers/scheduling.ts and dependency-authority.ts.

Formal Human Decision has only `readDecisionStatus(repoRoot, decisionId)` (`src/effects/engineers/verified-context-store.ts:437`). The store keys directories by hash of UUID; neither this reader nor compileStoredVerifiedEvidenceContext enumerates IDs. Requests carry exact task_fence and binding_fence, and repository scope is the Git common directory. A bounded, validating inventory reader in the owning store is still required to list pending Decisions. Acceptance UserWaiverGrant is a different authority and must not substitute for this inventory. The UI explicitly states inventory unavailability; it never renders a zero pending-decision count.

This package does not establish native runtime admission, the full three-view experience, canonical acceptance, installed runtime behavior or the automatic task/feedback/steer journey. Those remain active roadmap requirements.
