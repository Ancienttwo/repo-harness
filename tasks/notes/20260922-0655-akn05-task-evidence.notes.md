# AKN-05b decisions

- Keep context/activity independent: current canonical context may refuse a stale revision while the historical task message store still has valid evidence.
- Replace pages instead of appending to maintain bounded browser memory and honest coverage. Exact parent/reply lookup reuses the existing message ID endpoint.
- Add TaskEvidence.tsx for the shared query lifetime and evidence rendering boundary; App integration passes only identity, refresh generation and injectable readers, preserving Composer and TaskDiff.
- Three-view navigation is still pending: it needs the canonical preparation/organization facts without remapping server-owned semantics. This detail slice supplies the common evidence entrypoint first.
