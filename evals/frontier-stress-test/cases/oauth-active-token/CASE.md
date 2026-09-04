# Case: OAuth liveness before cleanup implementation

Historical source: `plans/archive/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md`.

Dynamic OAuth clients expire after 30 days while refresh tokens rotate. The
change says an expired client survives cleanup when it has an "active token",
but does not define whether an expired access token linked to an unexpired
refresh token, a dangling refresh token, or a token with no expiry counts.

The user explicitly asks to stress-test security and recovery semantics. Do not
choose the liveness definition or implement it.
