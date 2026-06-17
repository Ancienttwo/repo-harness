# Implementation Notes: ChatGPT Browser Engine

## Decision

Implemented the browser engine MVP as a repo-harness-owned CLI/session/MCP boundary first, with Oracle as the executable browser provider wrapper and native installed-Chrome CDP automation as the local browser spike.

## Why

The sprint design itself recommends validating with an Oracle provider before building native browser automation. That keeps the stable repo-harness contract local: prompt policy, session store, MCP safety gate, docs, and Skill behavior are all testable without a live ChatGPT account.

## Preserved Invariants

- Browser profile, tokens, and local ChatGPT state are not committed.
- Browser MCP tools are not exposed by default; `repo-harness mcp serve --enable-chatgpt-browser` is required.
- File input is explicit and policy checked before provider execution.
- Dry-run creates a session without opening a browser.
- ChatGPT Web output is saved as repo-local evidence, not treated as the only source of truth.
- Follow-up/open/cleanup commands operate on the repo-local session store; `browser-open` only launches the system browser when explicitly passed `--launch`.
- Oracle artifacts are imported only when the provider output reports a local file path that exists on disk.
- Native provider is implemented against installed Google Chrome by default, using a local Chrome DevTools Protocol websocket instead of bundled Chromium or Playwright-launched browser flags. It keeps persistent profile, visible composer detection, prompt submission, response capture, and explicit failure sessions for missing login/selector/timeout.

## Verification

- `bun test tests/cli/chatgpt-browser.test.ts`
- `bun test tests/cli/mcp-tools.test.ts`
- `repo-harness setup check --target codex --check-updates --json`
- `repo-harness chatgpt browser-consult --provider native --browser-channel chrome --timeout-ms 10000 --prompt "Reply exactly OK"` reaches the live ChatGPT boundary through installed Google Chrome and writes explicit failure evidence when no logged-in browser profile is available or ChatGPT selectors drift.
- `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version` reports `Google Chrome 149.0.7827.155`.
- `repo-harness chatgpt browser-consult --provider native --browser-channel chrome --profile-dir <fresh-profile> --timeout-ms 30000 --prompt "Reply exactly OK"` opens installed Google Chrome through direct CDP and captures the real assistant output `OK` in session `chgpt_20260617_195714_native-chrome-cdp-ok-smoke`.

## Deferred

Live manual login smoke, browser reattach, generated asset downloader selectors, and model-picker hardening are intentionally outside this staged slice.
