# Test filenames and workflow risk boundaries

## Verified cause

`strictCategoriesFor` in `src/core/workflow/profile.ts` tokenized complete paths.
The path `apps/web/e2e/anonymous-research-auth.spec.ts` alone therefore established
`risk-floor:strict:auth`, even when its change only adapted UI expectations.
Both effective-state resolution and review change assessment consume this classifier.

## Boundary

For JavaScript/TypeScript `.test.*` and `.spec.*` files, strict path tokens come
from parent directories. The basename names a scenario, not a runtime owner.
Production filenames, parent directories (including `auth` or `security`),
capability IDs, explicit operations, strict overrides and unavailable-input
rejection retain their existing behavior. Tests still count toward medium scope.
The same rule applies to targetPaths and additive strictScanPaths.

This is a deterministic path-role policy, not a semantic diff assessment. A test
that changes authentication guarantees should use its auth capability or explicit
auth operation; arbitrary filenames have never been a complete authority for
behavior. Other naming conventions retain existing conservative classification.
At 10x test count, capability ownership remains the limiting signal quality.

## Evidence and scope

The regression suite observed 12 failures before the source change and 12 passes
after it, including the real state CLI and PreEdit hook. See
`tests/harness-runtime-profiles.test.ts` and `tests/runtime-profile-enforcement.test.ts`.
This repair changes neither edit_plan_gate policy nor Stop/ship requirements.
The reported historical Stop failure and downstream advice configuration are not
claimed repaired by this classifier change.
