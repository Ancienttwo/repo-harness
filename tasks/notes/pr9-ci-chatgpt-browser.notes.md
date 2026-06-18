# PR9 ChatGPT Browser CI Note

## 2026-06-19 CI failure follow-up

- Scope: PR #9 (`chore/drop-legacy-project-initializer`) failed the GitHub Actions `Test` job in `tests/cli/chatgpt-browser.test.ts`.
- Root cause: the `browser setup binds a user-selected ChatGPT profile and native dry-run uses it` assertion assumed the native provider was installed and would recommend `browser-doctor --provider native --validate-session`. GitHub's Linux runner does not have the macOS Chrome provider available, so `browserDoctor` correctly reports `Install Google Chrome before native provider execution.`
- Decision: keep runtime behavior unchanged and make the test assert the next step that matches `readiness.native.installed`.
- Verification: target test passed locally; targeted CI gate passed install/typecheck and the target test before task-sync required this note.
