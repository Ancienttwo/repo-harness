# ChatGPT Browser Product-Session Binding Notes

## Context

The native ChatGPT browser provider previously opened an unbound fresh Chrome
profile unless callers passed `--profile-dir`. That made GPT Pro setup easy to
misread as "Chrome can open" instead of "the intended ChatGPT account session is
usable."

## Decisions

- Native provider readiness now distinguishes provider availability from
  ChatGPT product-session binding. A missing binding keeps
  `browser-doctor --provider native` at `partial`.
- `browser-setup --profile-dir <dir>` writes ignored local binding metadata.
  `browser-bind --open` starts the local authorization server and prints the
  localhost URL plus generated extension directory for user handoff. The
  authorization page calls repo-harness locally to validate the selected
  profile through the product-scoped extension heartbeat, and opens ChatGPT
  login only when login is required. repo-harness does not copy cookies,
  tokens, or browser storage.
- Chrome profile subdirectories are treated as selected profiles. The runtime
  stores the parent user data dir plus `--profile-directory <name>`, so a user
  can bind a named Chrome profile subdirectory instead of a throwaway profile
  root.
- Native consults consume the saved binding by default and fail closed with
  `NATIVE_PROFILE_NOT_BOUND` when neither a binding nor an explicit
  `--profile-dir` exists.
- Native CDP now fails closed for the default Chrome data directory with
  `NATIVE_DEFAULT_PROFILE_CDP_BLOCKED` / `blocked_default_profile`. Chrome 136+
  no longer honors remote-debugging switches against the default data directory,
  so an existing signed-in real Chrome profile uses the bridge provider rather
  than this CDP provider.
- Bridge consults use a generated unpacked extension scoped to ChatGPT domains
  and the localhost bridge URL. The extension reads/drives only the visible
  ChatGPT page DOM and does not request cookie or storage permissions.
- The authorization page now distinguishes extension not installed, extension
  disabled, extension connected without a visible composer, and ready states.
  It guides the user through Chrome Extensions -> Developer mode -> Load
  unpacked -> ChatGPT composer -> Bind ChatGPT instead of presenting a dead
  Bind button.
- Chrome can record a manually loaded unpacked extension path in
  `Secure Preferences` before the normal `Preferences` entry contains the
  manifest. Binding diagnostics must read both files, otherwise a visibly
  installed extension is misreported as not installed.
- Bridge provider tests use an isolated override port so a real user-installed
  ChatGPT bridge extension polling the default localhost port cannot pollute
  fail-closed test scenarios.
- Follow-up sessions inherit the source session profile/channel metadata unless
  the caller overrides it.

## Verification Focus

- `tests/cli/chatgpt-browser.test.ts` covers unbound native doctor state,
  product-session binding output, native dry-run profile inheritance,
  fail-closed unbound native consults, and fail-closed default Chrome profile
  blocking before CDP launch. It also covers product-scoped extension
  permissions and bridge provider fail-closed behavior when the extension is
  not connected.
- Live smoke on 2026-06-18: the selected `Profile 1` bridge extension reached
  `installed` plus `composerVisible=true`, `/api/authorize` returned `ready`,
  and `browser-consult --provider bridge --prompt "Reply exactly OK"` completed
  with output `OK`.
