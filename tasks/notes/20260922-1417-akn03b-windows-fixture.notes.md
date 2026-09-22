# Implementation Notes: akn03b-windows-fixture

> **Status**: Active
> **Plan**: plans/plan-20260922-1417-akn03b-windows-fixture.md
> **Contract**: tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md
> **Review**: tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md
> **Last Updated**: 2026-09-22 14:17
> **Lifecycle**: notes

## Design Decisions

Use canonical core builders and serializers to seed reader facts on every platform. Keep production directory fsync untouched; the fixture does not establish writer or Host admission.

## Evidence

Pre-fix: GitHub run 35693364932 job 106634890098. Local focused corrected HTTP test: 1 pass, 23 assertions.

## Publication expiry scope

The corrected probe must expire inside actual canonical validation or after a real staging fsync. Verifier call-count-only probes and expiry immediately after every verifier return do not prove these windows; omit them. Use existing test-file instrumentation, retain wire/storage shapes, and preserve the earlier semantic rejection.

## Encoded size decision

Choose an explicit total encoded-record limit because sender_id and Engineer IDs are not finitely bounded by their source schemas. Deriving a universal intent maximum would require changing those separate contracts. Keep 64 KiB including LF, move authority into core constructors/validators, and preserve a bounded disk reader/writer. A reply rejected before intent can reuse its original ID with reduced text. Owner feedback explicitly requests acceptance again after these fixes; the old verdict remains historical evidence.

## Installed MCP evidence

The real fdc2081f run checked out merge e2f74143; only Windows directory-fsync fixture and two Ubuntu Stop fixture tests failed. The Test job never reached packaging, and Governance context checks passed. Reuse the existing Engineer OAuth E2E in the tarball install smoke: copy only the test and canonical architecture fixture model into the disposable installed package, retain its packaged agents and runtime sources, and run from that installed root. A successful mapped status call plus malformed WorkEnvelope reaching the expected validator verifies request context without claiming a real Host turn.
