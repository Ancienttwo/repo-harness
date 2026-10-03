# S0 characterization notes

> **Plan**: plans/plan-20260930-1802-e1-first-offer-staleness.md
> **Contract**: tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md

## Decision

Use expected-stale assertions, not test.failing: current first-offer admission is intentionally characterized and production code stays unchanged. The guard exercises real retry observation and offer hashing; a future fix must deliberately revise this characterization.

## Frozen S0 observation design (not implemented)

Future observation evidence binds repository, authenticated principal/Binding, canonical snapshot digest, observed_at_ms, expires_at_ms and producer/policy revision; the host passes an opaque reference. Schema code, producer/store and transport are not part of this slice.

The proposed 30 seconds bounds freshness when a new transaction enters admission after ledger lookup. It does not guarantee actual claim age after concurrency/Binding/capacity lock waits. Pending requires reconciliation even after expiry; completed replay is not a new effect. TTL/latency/clock viability remains unverified.

Request identity must eventually bind choice, observation and trusted callback/scope policy; legacy keys cannot disappear during migration. This note freezes S0 wording only, not a new runtime schema or cutover implementation.

## Source

Design: origin/docs/pi-harness-host-invariants at 7173049ca76ec3bf660ff057b63b3158817c379f, docs/researches/20260930-fleet-responsibility-trace.md, E1 gap closure / S0.
