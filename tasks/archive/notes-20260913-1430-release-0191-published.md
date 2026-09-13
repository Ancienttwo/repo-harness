# repo-harness 0.19.1 published readback

> **Status**: Completed
> **Scope**: External publication facts, permitted by the publication granularity rule
> **Substantive Change SHA256**: `sha256:018d1fc0e3adae37396a6e7b329e52cfecdc5748eeb73f0ef4eb5f7c84cd5aa3`

The approved release follow-through published source `66441481` through PR #431.
Its tree equals the accepted candidate; PR Required CI (attempt 2) and the
subsequent main run passed. npm `latest` is 0.19.1, and the registry tarball
SHA-512 equals the frozen package built from that merged source. GitHub Release
and the leased tag point to the same release. `check:release-published` passed
with runtime receipt
`sha256:e643557ee3e049072bd11e905b56f838ab571cf60fafbebad720ea9a3d6ad307`.

This readback binds only the external-fact filing update; it does not change
the earlier implementation subject or its typed owner acceptance. The filing
owns the full identities, the intermittent hosted failure, and the separate
existing-host update rollback:
`deploy/release-checklists/260912-repo-harness-0.19.1.md`.

The public package has a verified clean-install result. The existing host's
custom skills and agent definitions remain preserved, and its CLI stays at
0.19.0 until the owner chooses how to reconcile those files. No unowned
surface was force-replaced to obtain a passing local update.
