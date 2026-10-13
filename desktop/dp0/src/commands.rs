// The only app commands (plan S3). `build.rs` declares the same list in the
// app manifest, `main.rs` registers it in `invoke_handler`, and
// `capabilities/status-window.json` grants it to the status window.
// `tests/static_bridge.rs` checks that the three sets are equal (T-BRG-3).

pub const APP_COMMANDS: [&str; 5] = [
    "status_report",
    "retry_start",
    "choose_main_repo",
    "open_config",
    "quit_app",
];
