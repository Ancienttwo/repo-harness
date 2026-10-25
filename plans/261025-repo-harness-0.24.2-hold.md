# repo-harness 0.24.2 preparation — HOLD

This is a draft closeout plan, not a release receipt. No release candidate SHA is fixed.

Source observed on 2026-10-25: `e9acac851ce539a1c62a2f84cd80852c0b4034ae`.
The package version remains 0.24.1. Both archctx and archctx-contracts are 0.9.3.
This documentation update changes no version, runtime, model or generated output.

## Completed source work

These commits are merged source changes, not a published 0.24.2 release.

| PR | Result | Merge SHA |
| --- | --- | --- |
| #952 | Initial bounded CI support | `2b212057380c28983e6138b7c561bc2b05bc3e8f` |
| #953 | AXR5 isolation and confirmed cleanup | `468c88ce3c6fa9415be6beafa5cc086d62eaef51` |
| #954 | Initial release HOLD documents | `846c6d1a45782ec2e18fac815ef2ba026f290869` |
| #955 | Exact final receipt-bearing CI admission | `536a1d9831e03fd6e0ab46e58e49de9b4f949901` |
| #951 | Paired 0.9.3 upgrade and real clean-room receipt | `cb900a7fe5ebd04830fdfa62e1b18e25ec969148` |
| #957 | Acceptance receipt flow sink correction; #956 closed | `b4c8b53b43c376a4da1e17a10c1fe40fc98e7d72` |
| #950 | Handwritten architecture views and acceptance account; #948 closed | `e9acac851ce539a1c62a2f84cd80852c0b4034ae` |

#951 final-head CI40212319529 passed. Its isolated clean-room receipt is real
0.9.3 evidence; the old 0.9.1 assertion failure remains historical evidence.
The clean-room result was `human-action-required` with CodeGraph unavailable,
not a fully indexed projection pass. Separately, #957 used ready CodeGraph and
proved 108/108 flow selectors after the official one-path ChangeSet. CI40214204040
passed on its exact head. These results do not replace release-candidate gates.

## Remaining scope and ownership

| Item | Observed state and owner | Minimum next coordination |
| --- | --- | --- |
| #895 / #898 | One open generated PR, owned by the existing rolling writer. #895 head `829dae036a60466e32176fffb007e2f28d139a26` declares base main `b4c8b53b43c376a4da1e17a10c1fe40fc98e7d72`. #898 is open with no assignee or claim comment. | Existing writer must verify its final head against current main and supply publication acceptance evidence. Coordinator must determine whether that result closes #898. Do not start a competing writer or hand-edit generated files. |
| #903 | Open. Active Claude Code Opus 5.5 claim: session `issue-903-review-key-d49bb5`, branch `claude/issue-903-review-key-d49bb5`. No release of that claim was observed. Stop recovery #927 is merged; the review-key/acceptance-receipt identity half remains open. #926/#906 are merged, not current blockers. | Obtain the existing owner's status and disposition of the six contract-supplied receipt inputs. This plan neither selects a replacement identity design nor takes over the branch. |
| #917 | Closed on GitHub. Its last status says blocked, with the Claude deep-worker claim retained. Reader removal would affect live features; closure alone does not prove final product acceptance. | Coordinator must resolve or explicitly retain the reported product decision before treating this as release-accepted. Do not infer a code deletion or waiver from the closed state. |

Claim sources: [#903 claim](https://github.com/Ancienttwo/repo-harness/issues/903#issuecomment-6392699152),
[#903 remaining scope](https://github.com/Ancienttwo/repo-harness/issues/903#issuecomment-6392817649),
[#917 blocked status](https://github.com/Ancienttwo/repo-harness/issues/917#issuecomment-6393184902).
At this observation, #895 is the only open PR; #898 and #903 are the open issues.
This is a timestamped inventory, not a guarantee that another owner has stopped.

## Retained measurements and acceptance gaps

The following measurements came from #957 at head
`24633552040b45739e7dccec79017ac7ed1ed435`. They were not rerun for this document
or after the latest writer update.

- Projection check required human action for 17 capabilities, including acceptance-review.
  Generated publication and major-change acceptance remain with the existing writer.
- Anchors checked 1,077 citations across 84 nodes and 28 documents: 10 findings
  (3 line-out-of-range, 7 missing-path), 0 unchecked. No per-finding owner or
  dedicated issue was confirmed here; #950 closure does not resolve them by implication.
- Architecture-debt comparison introduced no items and resolved two IDs, but
  coverage remained partial because practices were not enabled/evaluated.
  No owner or acceptance decision for that gap was confirmed here.
- Model validation retained the warning that manifest `review.failOn` is ignored;
  `.archcontext/policies/review.yaml` is the policy source.

The coordinator must identify owners or obtain explicit current dispositions for
these gaps. This document makes no design decision, waiver or new acceptance claim.

## Release preparation after scope is settled

- Freeze one candidate only after remaining work and acceptance decisions are resolved.
- Prepare the 0.24.2 changelog from the exact merged range. Do not call pending work shipped.
- Update package.json and assets/skill-version.json consistently only in the eventual
  authorized version change; inspect CLI/status derivation and lock metadata first.
- Obtain current readiness evidence. The 0.24.1 yellow-flag acceptance does not carry forward.
- Record skill evaluation fields full_test_count, dry_run_ratio, grader_pass_rate
  and effectiveness_authority, or explicitly unavailable.
- Include consumer architecture smoke evidence for the no-codefacts/no-manifest
  registry case in tests/hook-runtime.test.ts.
- Only after scope and authority are fixed, run the release full-CI gate once.
  `bun run check:release` is a separate package/install gate. Neither has run for 0.24.2.

The [release checklist](../deploy/release-checklists/261025-repo-harness-0.24.2.md)
remains HOLD. This preparation note authorizes no merge, tag, release, deployment,
service operation, issue closure or generated publication.
