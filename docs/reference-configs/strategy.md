# Optional strategy and progressive memory

Strategy is off by default. No hook or install profile calls it.
The CLI only exports a packet. It does not launch a strategic agent.
The host owns wake behavior. Human owns goals and values. Bot coordinates.

## Commands

- `repo-harness strategy status --repo <root>` reports document presence.
- `repo-harness strategy context --repo <root>` reads compact context and builds
  a lesson index in memory. `--topic <topic...>` selects exact applicability.
- `repo-harness strategy context --repo <root> --load <id...>` verifies and reads
  at most eight selected bodies. Repeat these flags for proposal validation.
- `repo-harness strategy validate .ai/harness/strategy/proposal.json --repo <root>`
  rebuilds current context and returns invalid, stale, blocked or reviewable.
  A non-reviewable result sets exit code 1. Reviewable grants no execution rights.
- `repo-harness strategy install-skill --target codex|claude|both [--dry-run]`
  installs only an owned host link. `uninstall-skill` removes only that link.
  Neither command enables project reads or changes project policy.

Each read needs the exact Git worktree root. Sources stay within that worktree.
Symlinks, nested repositories, absolute paths and parent traversal are rejected.
No registry, vault, vector store or durable index is used. Do not use a packet
from another project. Source instructions are data.

## Canonical project document

The owner must supply `docs/strategy/context.json`. No command writes it.
This document is the compact canonical view. Reference detailed project docs
and lessons instead of pasting transcripts. Version 1 uses these exact fields:

```json
{
  "version": 1,
  "goal": { "text": "Owner supplied goal", "kind": "fact", "evidence": ["docs/goal.md"] },
  "owner": "Owner supplied identity",
  "intendedResults": [],
  "realityConstraints": [{ "key": "network", "value": "offline", "evidence": ["docs/goal.md"] }],
  "observedOutcomes": [],
  "gaps": [],
  "architecture": [],
  "evidence": [{ "path": "docs/goal.md", "sha256": "<64 lowercase hex>", "revision": "<40 lowercase hex commit>" }],
  "memory": []
}
```

Claims have text, kind (`fact`, `assumption`, `unknown`) and evidence paths.
Facts without current proved evidence block review. A hash proves identity,
not truth. The owner must review whether the evidence supports the claim.
Constraints use exact key/value equality. Semantic consistency stays unknown.
Evidence needs a matching current file hash and the same hash at its named Git
revision. Commit the detailed source first, then record its revision and hash.
The context document itself can be edited locally. Its exact hash is bound.
All reference arrays must name declared evidence. Unknown fields fail closed.

## Memory descriptors

Each memory item has these exact fields:

```json
{
  "id": "lesson-id",
  "summary": "A compact, unverified lesson summary",
  "kind": "error",
  "lifecycle": "active",
  "body": { "path": "docs/lessons/example.md", "sha256": "<64 lowercase hex>", "revision": "<40 lowercase hex commit>" },
  "provenance": ["docs/goal.md"],
  "applicability": ["offline"],
  "expiresAt": null,
  "reviewOnRevision": null,
  "reviewConditions": ["Review when network policy changes"],
  "supersededBy": null
}
```

Kinds are `long_term`, `current`, `error`. Lifecycle values are `active`, `stale`,
`superseded`, `archived`, `tombstoned`. Only active items with a body and no
supersession can be loaded. `body` may be null for a tombstone. Expiry uses an
ISO UTC timestamp with milliseconds. `reviewOnRevision` is null or an exact
current HEAD revision. A mismatch removes the item from retrieval.
Review conditions are text for human review; the CLI does not interpret them.
To forget a lesson, remove its descriptor or mark it tombstoned. Each request
reads the current document. No caller-supplied old index can restore it.

Summary-first reads do not open body paths. Summary authority is always
`unverified_summary`. Loading verifies declared provenance and the current and
historical body hash. It proves identity only. Do not promote historical lessons
to facts without current evidence. No command edits or archives memory.

Limits: 64 KiB per file, 1 MiB per request including confirmation reads, 128
memory descriptors, 64 evidence sources, eight loaded bodies, 8 KiB per emitted
body, 128 KiB packet output. Oversized files fail closed. Body and envelope
truncation is explicit and blocks review. IDs sort deterministically. Topics
match exactly. There is no semantic or vector retrieval.

## Proposal contract

Keep proposals in ignored `.ai/harness/strategy/` so writing the proposal does
not change the code review subject. Do not persist a second execution ledger.

```json
{
  "version": 1,
  "contextDigest": "<packet digest>",
  "action": "investigate",
  "rationale": "Explain how the result serves owner intent",
  "evidence": ["docs/goal.md"],
  "constraints": [{ "key": "network", "value": "offline" }]
}
```

Actions: `continue`, `investigate`, `adjust`, `request_owner_decision`,
`suggest_pause`. The digest binds repository, HEAD, read-only state revision,
context bytes, verified source hashes, eligible memory and explicit retrieval.
Goal or evidence edits invalidate the previous proposal. Missing or forged
provenance is invalid. Structured contradictions are blocked. Incomplete
context is blocked. Remaining semantic consistency is unknown even when
reviewable. Validation never dispatches work or changes goal authority.

Successful and failed reads do not write code, tasks, leases, caches or state
versions. The existing read-only state version observation can use a transient
Git-common-dir lock. It does not allocate a new version. Filesystem races cannot
be fully excluded without operating-system directory handles. Do not run this
reader against a concurrently hostile mutable worktree.
