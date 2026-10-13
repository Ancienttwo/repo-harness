# Desktop DP0 proof

This directory is the DP0 proof for `plans/plan-20261013-desktop-app.md`
(PR #704). It is not the desktop shell. DP2 builds the shell later, after a
separate GO.

DP0 proves two boundaries before any shell work starts:

- **Bridge**: the console window (remote origin) cannot run any native
  command. Only the bundled status window can run the five app commands.
- **Lifecycle**: the shell owns exactly one `operator serve` child, and
  that child and its collector groups exit when the shell dies, quits, or
  times out.

## Contents

| Path | Role |
|---|---|
| `src/supervisor.rs` | Child ownership, URL line check, stderr classification, stop deadlines, capped log |
| `src/nav.rs` | Navigation and new-window decisions |
| `src/probe.rs` | Login-shell probe for three values |
| `src/env.rs` | Child environment allowlist |
| `src/commands.rs` | The five app commands; `build.rs` and `main.rs` use the same list |
| `src/main.rs` | Minimal Tauri v2 app that applies these rules and writes an audit file |
| `src/bin/fake_serve.rs` | Test double for `operator serve`, with a simulated collector lifeline |
| `src/bin/supervise_once.rs` | Stand-in shell process for the kill tests |
| `capabilities/status-window.json` | The only capability |
| `pages/app/` | Bundled status page |
| `pages/test/` | Console test pages served by the test double |
| `tests/` | `lifecycle.rs`, `static_bridge.rs`, `gui.rs` |

The test double simulates the DP1 CLI contract (`--exit-on-stdin-eof`,
`port_in_use`, the collector lifeline). The released CLI does not have that
contract yet, so DP0 proves the shell side and the operating-system
mechanisms, not the CLI.

## Run

Keep the Rust toolchain and the build output outside the repository. Put
`CARGO_TARGET_DIR` on a fast local disk: a first build on a USB hard disk is
bound by disk I/O and is many times slower.

```bash
export CARGO_TARGET_DIR=<a directory outside the repository>
cd desktop/dp0
cargo build --bins
cargo test --lib --test static_bridge --test lifecycle -- --test-threads=1
cargo test --test gui -- --ignored --test-threads=1 --nocapture   # opens windows
```

`icons/icon.png` is a placeholder that `generate_context!` requires. It is
not the product icon.

Optional real-system checks: `DP0_REAL_SHELL=1` runs the probe against
`/bin/zsh`. `DP0_REAL_CLI=<path>` starts the installed CLI with the DP1 argv.

All tests use port 4319. No test reads or connects to port 4318. Tests stop
only processes they started, by pid or by their own process group.
