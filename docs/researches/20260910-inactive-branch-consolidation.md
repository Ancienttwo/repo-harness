# Inactive branch consolidation — 2026-09-10

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

This history integration starts from main `3c570360543fe5b93378bec81c2a7d4f68f10663`. The operator requested merging and cleaning every inactive branch and worktree, excluding the primary Operator checkout and `codex/campaign-reconciliation-recovery`. Their working files and local task state are outside this integration.

## Content disposition

- Merge parents retain every frozen inactive head, including seven newly committed files from three idle worktrees. Keeping the current main tree during history merges prevents superseded runtime and workflow states from becoming active again. Original files remain recoverable with `git show <commit>:<path>`.
- BRC host/consumer WIP is superseded by [PR #360](https://github.com/Ancienttwo/repo-harness/pull/360). Its host journal under a worker-visible common directory must not replace the later account-owned journal. Consumer history explicitly designates PR #360 as its replacement.
- Closed [PR #362](https://github.com/Ancienttwo/repo-harness/pull/362) is superseded by merged [PR #363](https://github.com/Ancienttwo/repo-harness/pull/363). The cleanup script is already byte-identical; later recovery, worker and fixture contracts remain authoritative.
- Detached `9b06d83e` redaction and event-test blobs already match main; its older fixture helpers must not replace later versions.
- Old projection manifests are provenance snapshots. They are retained in ancestry; the current architecture projection remains the publication authority.
- BRC13/BRC14 readiness and three BRC6a investigations are preserved below as dated observations. Their pending/complete words describe the historical snapshot, not a newly approved campaign or current acceptance.
- BRC15a legacy plan/contract/notes/review are archived with their original inconsistent acceptance state visible. The current [negative-observation closeout](20260907-brc15a-real-shadow-canary.md) remains authoritative. The earlier seven-file preservation commits retain dirty predecessor versions without resurrecting active plans, grants or ledger entries.

## Frozen input ledger

| Inactive ref | Integrated head | Prior head if saved | Disposition evidence |
|---|---|---|---|
| `codex/brc-host-containment` | `1d0c65a787883b682a85ecb195f5cef85d884606` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/brc13-readiness` | `d2845d1b7d119c70e7f2ac2f24d26dd46f47900d` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/brc14-readiness` | `18ce5054657f2c0e7f3091b23260a7bdc729335f` | `4889507ea07599b522f388619d34ddfd746ca1b8` | Historical source retained in merge ancestry; disposition above; pending snapshot committed before merge |
| `codex/brc15a-real-shadow-canary` | `f8a9dea9e157e2494472c9c223d5662cd521bfe3` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/brc354-consumer-closure` | `b7d9a55dda303b9c7e6768a5d67e416e7731cd85` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/brc354-final-closeout` | `f1c140801b8686a3c42f97f2cc6328170caff9d9` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/brc6a-conversation-evidence` | `068ec631285bc5afc92c48e9fdda5b04acb62f47` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/brc6a-live-network-evidence` | `fba4233a0376d0e83fae04cb99c08befc49c03da` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/brc6a-readback-research` | `2cccfe43d498fb42c5cfff34ed647bf8a10f9783` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/campaign-acceptance-preflight` | `1702d1b97b5dbdb9a5a05d62ac13ca69a46ee03d` | `—` | [PR #392](https://github.com/Ancienttwo/repo-harness/pull/392) exact merged head |
| `codex/campaign-execution-environment` | `22714545229fadc939a3543d94b15312407f9cad` | `—` | [PR #384](https://github.com/Ancienttwo/repo-harness/pull/384) exact merged head |
| `codex/campaign-not-planned-acceptance` | `8a45254cc593ed047cb7aacd21110307244fb5b1` | `—` | [PR #383](https://github.com/Ancienttwo/repo-harness/pull/383) exact merged head |
| `codex/campaign-settled-resume` | `f6fdd597efbbe2648ba0d7dd4261a9552490b65c` | `—` | [PR #385](https://github.com/Ancienttwo/repo-harness/pull/385) exact merged head |
| `codex/campaign-successor-replacement` | `e6299a70cbbf4a1983a31b1132eb505de031fd33` | `—` | [PR #380](https://github.com/Ancienttwo/repo-harness/pull/380) exact merged head |
| `codex/campaign-worker-contract-authority` | `bed31b30a00b795df23d9ba2a13ded29b55b1308` | `—` | [PR #381](https://github.com/Ancienttwo/repo-harness/pull/381) exact merged head |
| `codex/campaign-worker-record-scope` | `078c8af8080995657d4bb1d771ea0f55b1fab236` | `—` | [PR #389](https://github.com/Ancienttwo/repo-harness/pull/389) exact merged head |
| `codex/fleet-packaged-helper` | `fd8e504e0d8f3f16a770a4e0f5d08459f0d7e2a0` | `—` | [PR #374](https://github.com/Ancienttwo/repo-harness/pull/374) exact merged head |
| `codex/preserve-main-projection-20260908` | `8d0e9127ac5b1c0189245d03bbe9395eb70bb946` | `—` | Historical source retained in merge ancestry; disposition above |
| `codex/release-0-19-0` | `14a3e022e042f0da283f68bd682ead52ace66551` | `f29e8a610cf308569a1a07be521a0961d29908ac` | [PR #388](https://github.com/Ancienttwo/repo-harness/pull/388) exact merged head; pending snapshot committed before merge |
| `detached brc360 readback` | `a41fb5a2fc7342d93b72cfd0ffb14727498f7c99` | `9b06d83e6ea29505b5c5a0d8c268caf62be1c54a` | Historical source retained in merge ancestry; disposition above; pending snapshot committed before merge |

## Preserved research entrypoints

- [20260907-brc13-closeout-readiness.md](20260907-brc13-closeout-readiness.md)
- [20260907-brc14-fresh-audit-readiness.md](20260907-brc14-fresh-audit-readiness.md)
- [20260908-brc6a-conversation-history-evidence.md](20260908-brc6a-conversation-history-evidence.md)
- [20260908-brc6a-live-network-evidence.md](20260908-brc6a-live-network-evidence.md)
- [20260908-brc6a-trusted-revision-readback-options.md](20260908-brc6a-trusted-revision-readback-options.md)

## Verification and cleanup boundary

The integration contract declares six required repository-integrity commands, a whitespace check, and a product-tree equality check against the pinned base. No local full-suite rerun is warranted by this history/documentation-only tree; required GitHub CI remains the publication gate. The final branch must retain each integrated head as an ancestor.

Deletion happens only after publication, for the frozen branch/HEAD identities and clean worktrees. Remote heads are checked against the exact expected values before deletion. The primary checkout and reconciliation worktree are preserved even if their active files continue changing. This document records the integration inputs and disposition; publication/cleanup completion must be established by live Git and directory readback.
