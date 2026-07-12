# EB-H-01 Browser Evidence Appendix

- Provider: Chrome extension Browser Evidence Adapter
- Source URL: https://design-system.service.gov.uk/components/error-summary/
- Page title: Error summary – GOV.UK Design System
- Captured at: 2026-07-12T23:54:07+08:00
- Viewport: 1872 × 870; full-page capture
- Asset: `evals/bdd2/evidence/browser/EB-H-01.png`
- Asset SHA-256: `498b04e90a81ea3b9ef447279d330d7ba4d9efc027266c07f15a3d85f83e12de`
- Privacy review: public documentation; no account, customer, credential, or personal data observed
- Named uncertainty: Should a multi-field validation failure provide a page-level error summary that links users back to affected fields?
- Observed pattern: a summary appears at the top of the error state, uses a clear heading, and links each error to the relevant field while field-local errors remain present.
- Decision: Adopt
- Applicability: multi-field forms where users otherwise need to hunt for errors, including keyboard and screen-reader recovery.
- Supports: this accessible pattern exists and explains how summary and field errors cooperate.
- Cannot prove: that every form needs a summary, that users prefer the visual styling, or that this product has multi-field validation failures.

