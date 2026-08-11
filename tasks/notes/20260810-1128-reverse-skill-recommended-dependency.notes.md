# Implementation Notes: reverse-skill-recommended-dependency

> **Status**: Review
> **Plan**: plans/plan-20260810-1128-reverse-skill-recommended-dependency.md
> **Contract**: tasks/contracts/20260810-1128-reverse-skill-recommended-dependency.contract.md
> **Review**: tasks/reviews/20260810-1128-reverse-skill-recommended-dependency.review.md
> **Last Updated**: 2026-08-10 11:28
> **Lifecycle**: notes

## Design Decisions

- `assets/skill-commands/manifest.json` remains the sole selection authority.
  The new package has empty `profiles`, so neither `minimal`, `full`, nor repo
  init can select it. `install` and `update` expose the single explicit route
  `--with-reverse-skill`.
- Provider installation is grouped by provider and selected host. Waza keeps
  its provider-specific shared-rule synchronization; Reverse Skill does not
  inherit that side effect.
- Upstream identity is frozen at commit
  `539899ddc7608d63dc66e08e794d572e080f1a55`. The catalog records the
  deterministic full-tree digest
  `sha256:7aafee6c0dec684d410af6864ab77da4d88b9d442142c0efb91b235ce9793dda`.
  Runtime setup hashes file bytes, paths, lengths, and symlink targets in
  sorted order. Integrity-bound providers first install under an isolated HOME;
  only verified bytes are copied to shared `.agents` staging and then projected
  into host roots.
- Explicit catalog lookup is required rather than optional: a missing package
  or unsupported selected host is a failed setup step, not a successful no-op.

## Deviations From Plan Or Spec

- The captured direction initially placed Reverse Skill in the default full
  profile. Live upstream inspection falsified that design: the router requires
  `field-journal/precedent-auth.md`, whose standing rule treats mentioning a
  target as authorization and instructs agents not to ask for confirmation.
  The implementation therefore changed to recommended but explicit-only.
- Security review identified mutable-provider drift after the explicit-only
  redesign. The provider commit and selected-tree digest were added as a
  second fail-closed boundary.
- Architecture review showed that Skills CLI `-a` performs its own host
  projection before repo-harness can hash the result. Integrity-bound installs
  now redirect all CLI writes to a disposable HOME and commit only after hash
  verification. The isolated live smoke also corrected the catalog digest from
  an earlier source-tree calculation to the actual Skills CLI staged-tree
  digest.
- A second architecture pass found that a partial copy or process death could
  poison shared staging. The commit effect now copies under a skill-specific,
  same-filesystem temporary path, rehashes, uses the canonical
  owner-token/stale-reclaim directory lock, asserts ownership, and atomically
  renames. Fault tests cover copy failure, post-copy mismatch, dangling
  destinations, and killed-owner recovery with a successful retry.
- Post-merge architecture/security review found two additional authority
  gaps. The catalog now rejects integrity-bound packages unless they are
  explicit-only external packages, preventing a future profile/init route
  from discarding the digest. The runtime now preflights every host path
  before provider execution, rejects symlink or non-canonical integrity
  staging roots, and compensates transaction-created staging/host links on a
  projection failure. Explicit-only paths remain in transaction snapshots for
  failure compensation but intentionally stay outside profile ownership, so a
  profile switch neither adopts nor retires a separately authorized install.
- Adversarial filesystem/environment passes then closed the enclosing-root
  cases: a symlinked `.agents`, `.agents/skills`, `.codex/.claude`, or host
  `skills` root is rejected against the canonical HOME before any outside
  directory or projection is created; dangling host roots return a typed
  failed step. The disposable provider environment now also binds
  `BUN_INSTALL`, Bun cache, XDG cache, and npm cache under its temporary HOME
  instead of inheriting operator-global state.
- The final CLI/adversarial pass found two lifecycle gaps that source-level
  tests had not exercised. Commander exposes `--with-reverse-skill` as
  `withReverseSkill`, so install now maps that exact attribute into the runtime
  selector and a real CLI regression proves the provider route is entered.
  Update also now runs all host mutations inside the same snapshot/rollback
  transaction as install; a shared exclusive directory lock serializes full
  install/update transactions plus global adapter install/uninstall, so one
  failed process cannot roll back another process's successful projection.
  Reproductions cover the late-failure rollback, two-process update ordering,
  and the overlapping adapter mutation surface.
- The filesystem boundary rejects pre-existing path substitution and ordinary
  concurrent transaction conflicts. It does not claim isolation from a
  malicious concurrent process running as the same OS user: that principal
  can replace the canonical Skill or host configuration after any successful
  install, so closing the final check/use window requires a different security
  boundary (sandbox/privileged broker plus descriptor-relative native
  operations), not another path recheck in this work package.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Full-profile default | Rejected | Automatic installation would recommend an upstream authority model that conflicts with repo-harness scope boundaries. |
| Documentation-only listing | Rejected | It would not provide a coherent, testable install/update path. |
| Explicit flag with mutable upstream main | Rejected | Audited content could differ from installed content. |
| Explicit flag plus commit and tree digest | Selected | Keeps the dependency accessible while binding install bytes to reviewed content and preserving default profiles. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Upstream smoke: the pinned source listed 41 selectable skills; selecting
  `reverse-skill-router` staged 348 files. Skills CLI scanning reported
  `Critical Risk` and 17 alerts. Optional toolchain workflows were not run.
- End-to-end disposable runtime smoke: `runGlobalRuntimeSetup` fetched the
  pinned provider through the isolated path, verified the catalog digest,
  committed shared staging, and projected one Codex symlink with exit 0. Both
  owned temporary roots were removed afterward.
- Focused fail-closed guards:
  `tests/cli/global-runtime-init.test.ts` covers missing catalog selection and
  staged-tree digest mismatch before host projection.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
