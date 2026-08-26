# Task Notes: hrd09-fixture-home-isolation

> **Plan**: plans/plan-20260827-0229-hrd09-fixture-home-isolation.md
> **Contract**: tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md

## Design Decisions

- The root cause was proven by a read-only diagnosis before this contract existed: the earlier attribution of the HRD-09 timeout to the ME-2B merge was a coin-flip artifact at the 120s boundary (the test also fails on the pre-ME-2B baseline across repeated runs), and the real cost sits in the Stop route processing hundreds of bun transpile cache files as architecture drift.

## Deviations From Plan Or Spec

- None recorded.

## Open Questions

- The per-path Stop cascade remains O(n) subprocess spawns with no cap or batching; tracked in tasks/todos.md rather than fixed here.
