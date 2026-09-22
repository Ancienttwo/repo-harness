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
