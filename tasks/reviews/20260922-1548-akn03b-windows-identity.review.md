# Task Review: akn03b-windows-identity

> **Status**: Pending
> **Plan**: plans/plan-20260922-1548-akn03b-windows-identity.md
> **Contract**: tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md
> **Notes File**: tasks/notes/20260922-1548-akn03b-windows-identity.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Substantive Change SHA256**: `sha256:bbb69d3755af718e4916e05944555d109c2b0bc84b989bcfcee5047853238394`

## Diagnostic candidate

Two Windows attempts for #437 head769c065c failed the same mapped-status assertion. The existing fixture now checks the same-token authorization ID and a fresh child process using the server Git-root resolver, canonical principal mapping reader and inherited environment. Local focused E2E passes 28 assertions with all original assertions retained. These probes diagnose identity disagreement; they do not constitute a fix or current Windows acceptance. Production source is unchanged. No semantic review has been invoked for this diagnostic candidate.

## PR base verification binding

The narrow diagnosis starts at769c065c. The complete PR diff is separately bound against the actual #435 base3195ffc6 below.

> **Substantive Change SHA256**: `sha256:0e3e1091fc24079925cd5b330e2b74fd76b5bed3ac9cb529380339b311fc19ae`

## Confirmed root cause and corrected candidate

Windows job106662452605 at255ecbb0 independently returned the long Git root while the fixture used its8.3 alias. Repository IDs differed; mapping-home and authorization IDs agreed. The correction calls the existing MCP root resolver after Git initialization, before publishing any fixture identity. The temporary diagnostic subprocess is removed; the real mapped-status guard and same-token identity assertion remain. Focused local HTTP passes26 assertions. No production code changed. Freeze this candidate before full canonical checks and the package's sole semantic review against policy origin/main. Hosted Windows acceptance is still pending.

## Current corrected verification and invalidated review

Canonical snapshot `.ai/harness/runs/run-20260922T160025-89874-20260922-1548-akn03b-windows-identity.json` passed22/22; current subject `sha256:d2b7cca69399f8d2a1a9a666b0bac399d7ce0d8808549178aeb8ff1e134f2997`. Windows, macOS, Ubuntu MCP and Governance passed at111a8a27 in run35702537370.

The orchestrator incorrectly launched the sole independent review before canonical materialization finished restamping the manifest's verifiedAgainst commit. This changed the review subject fromeccb6aa9 tod2b7cca6. The provider result is invalidated, not acceptance; no retry or replacement verdict was issued. Final owner acceptance is required after freezing this corrected subject.

```json
{
  "status": "failed",
  "provider": "codex-plugin",
  "scope": {
    "status": "ok",
    "baseRef": "origin/main",
    "baseRev": "0d4371c3f95e63851f4e083718f3337bf9646345",
    "headRev": "111a8a27ac77ee3ac23b82d36246c353b81a4898",
    "paths": [
      "docs/architecture/.projection-manifest.json",
      "docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md",
      "docs/researches/20260922-candidate-runtime-fixture-authority.md",
      "docs/researches/20260922-task-reply-protocol.md",
      "scripts/check-tarball-install-smoke.sh",
      "src/cli/mcp/engineer-tools.ts",
      "src/cli/mcp/oauth.ts",
      "src/cli/mcp/server.ts",
      "src/cli/mcp/tools.ts",
      "src/cli/mcp/transports/http.ts",
      "src/core/fleet/task-reply.ts",
      "src/effects/engineers/principal-store.ts",
      "src/effects/engineers/task-inbox.ts",
      "src/effects/fleet/acquire.ts",
      "src/effects/fleet/task-inbox.ts",
      "src/effects/repo-registry.ts",
      "tests/cli/mcp-engineer-tools.test.ts",
      "tests/cli/mcp-http.test.ts",
      "tests/cli/mcp-oauth.test.ts",
      "tests/effects/task-reply.test.ts",
      "tests/unit/candidate-bound-global-runtime-reconciliation.test.ts",
      "tests/unit/collaboration-authority-baseline.test.ts",
      "tests/unit/task-reply.test.ts"
    ],
    "reviewSubjectSha256": "sha256:eccb6aa9783b1958a1e254ea4ba95f88f543e559df19cec9290b9951e0e11661"
  },
  "code": "stale_scope",
  "message": "review subject changed while the official Codex plugin was running"
}
```
