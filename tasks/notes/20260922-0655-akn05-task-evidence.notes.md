# AKN-05b decisions

- Keep context/activity independent: current canonical context may refuse a stale revision while the historical task message store still has valid evidence.
- Replace pages instead of appending to maintain bounded browser memory and honest coverage. Exact parent/reply lookup reuses the existing message ID endpoint.
- Add TaskEvidence.tsx for the shared query lifetime and evidence rendering boundary; App integration passes only identity, refresh generation and injectable readers, preserving Composer and TaskDiff.
- Three-view navigation is still pending: it needs the canonical preparation/organization facts without remapping server-owned semantics. This detail slice supplies the common evidence entrypoint first.

- Keep the roadmap overlay requirement in this existing detail work-package. CSS owns width, so viewport changes cannot restart focus or draft lifetime. Preserve prior overview/collaboration observations in a secondary disclosure instead of deleting them with the complementary pane.

- Integration decision: use accepted supervision commit `164f3f52ab26f3ca576c7c3a3349253599db5ece` as source/PR base. The read path is App selection -> existing strict task-context and task-activity GET decoders -> independent TaskEvidence query lifetimes; failed/stale context must not suppress historical activity. The only anticipated merge conflict is generated architecture manifest and deferred todo timestamp; preserve upstream authority then regenerate projection. At 10x activity the 50-row replacement page remains bounded; server or exact-ID lookup fails first and must show incomplete coverage rather than imply a full scan.

> **Substantive Change SHA256**: `sha256:2ac496c92c3a8f0bf27b5df17f27b7be329e4c43bc7522f710f2ee7f697132ba`
