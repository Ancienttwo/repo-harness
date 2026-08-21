> **Archived**: 2026-08-21 03:51
> **Related Plan**: plans/archive/plan-20260821-0335-restamp-ci-shape-fix.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260821-0351

# Notes: restamp-ci-shape-fix

- The shape-lock test's `expect(status(root)).toBe(' M …')` clause was replaced with `toBe('')` — it could not hold without the dirty path that triggers the PATH-dependent cascade; the "drain never publishes a dirty manifest" invariant is owned by tests/stop-handler-restamp-publication.test.ts.
- fixture() gained `{ dirtyManifest?: boolean }` with unchanged default so the two publish tests are behaviorally byte-identical.
