# AKN-03 protocol inventory decision

C-1 excludes messaging provenance from the delivery planes; C-2 additionally fails for the current pure implementation with no production consumers. Preserve the inventory digest and exact closed-scan equality. Future authenticated writers may prove message provenance, but cannot make reply records authority for Task/Claim, Lease, Publication, Acceptance or Delegation without a new explicit adjudication.

## Open Questions

- No decision is needed for this registration. Live Host and full AKN-03 remain separate unmet boundaries.

## Evidence Links

- Existing scan: pre-fix 18 pass / 1 fail; post-fix 19 pass, captured under `.ai/harness/runs/akn03-reply-protocol/`.
- Hosted Windows job 106447764221 passed on unchanged 4a8b2992 after one bounded retry; original startup timeout is not diagnosed.
