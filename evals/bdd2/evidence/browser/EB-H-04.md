# EB-H-04 Browser Evidence Appendix

- Provider: Chrome extension Browser Evidence Adapter
- Source URL: https://carbondesignsystem.com/components/inline-loading/usage/
- Page title: Carbon Design System inline loading usage
- Captured at: 2026-07-12T23:54:07+08:00
- Viewport: 1872 × 870; full-page capture
- Asset: `evals/bdd2/evidence/browser/EB-H-04.png`
- Asset SHA-256: `e13d66cf39b55fc1b24acafd041371421deba2e3f4cc6752f18cbfbcc128ca7d`
- Privacy review: public documentation; no account, customer, credential, or personal data observed
- Named uncertainty: Should a retrying row keep progress and completion feedback adjacent to the action instead of navigating to a job-status page?
- Observed pattern: inline loading communicates active, success, and failure states close to the initiating control.
- Decision: Adapt
- Applicability: a short operation scoped to one existing row; longer operations still need durable status and safe navigation behavior.
- Supports: adjacent status can preserve context and reduce navigation for bounded operations.
- Cannot prove: operation duration, retry policy, background-job architecture, or that a separate status page is never needed.

