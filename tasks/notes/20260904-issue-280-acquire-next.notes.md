# Issue 280 acquire-next integration evidence

> **Substantive Change SHA256**: `sha256:dcd6fd94cb415ef7372a7682d5d76b3c2242a51d81197c21536d8de0adc82f16`

The CLI and MCP adapters share `acquireScheduledEngineerTaskNext` as the sole scheduling effect. It selects the canonical first eligible offer, retries only revision-fenced lost-election outcomes, and persists an exact idempotency receipt before crossing the claim side-effect boundary.
