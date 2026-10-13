//! DP0 runtime proofs in a real WKWebView. They open windows on screen, so
//! they are ignored by default:
//! `cargo test --test gui -- --ignored --test-threads=1 --nocapture`

mod common;

use std::net::TcpListener;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use common::*;
use serde_json::{json, Value};

const APP_COMMANDS: [&str; 5] = dp0::commands::APP_COMMANDS;

fn launch(case: &Case, devtools: bool) -> Child {
    let mut command = Command::new(APP);
    command
        .env("DP0_CLI", FAKE)
        .env("DP0_CWD", &case.cwd)
        .env("DP0_OUT", &case.out)
        .env("DP0_PATH", "/usr/bin:/bin");
    if devtools {
        command.env("DP0_DEVTOOLS", "1");
    }
    command.spawn().expect("dp0-shell")
}

fn results(case: &Case) -> Vec<Value> {
    case.read("results").lines().filter_map(|l| serde_json::from_str(l).ok()).collect()
}

fn find<'a>(rows: &'a [Value], page: &str, probe: &str, cmd: Option<&str>) -> Option<&'a Value> {
    rows.iter().find(|r| r["page"] == page && r["probe"] == probe && cmd.is_none_or(|c| r["cmd"] == c))
}

/// Ask the app to quit through its normal exit path and wait for it.
fn quit(case: &Case, mut app: Child) {
    std::fs::write(case.out.join("quit"), "").unwrap();
    let exited = wait_until(Duration::from_secs(25), || app.try_wait().ok().flatten().is_some());
    if !exited {
        let _ = app.kill();
    }
    assert!(exited, "app exits on request");
}

fn bridge_run(name: &str, devtools: bool) {
    let case = Case::new(name, json!({ "mode": "ok", "page": "bridge" }));
    let app = launch(&case, devtools);
    let done = wait_until(Duration::from_secs(60), || {
        let rows = results(&case);
        find(&rows, "bridge", "done", None).is_some() && find(&rows, "status", "status-after-navigation", None).is_some()
    });
    quit(&case, app);
    let (rows, audit) = (results(&case), case.read("audit"));
    println!("=== {name} results ===\n{}\n=== {name} audit ===\n{audit}", case.read("results"));
    assert!(done, "both pages reported");

    // T-BRG-4: the five app commands are refused from the console origin and
    // none of them ran.
    for cmd in APP_COMMANDS {
        let row = find(&rows, "bridge", "invoke", Some(cmd)).expect(cmd);
        assert!(row["outcome"] == "rejected" || row["outcome"] == "no-invoke", "{cmd}: {row}");
        assert!(!audit.contains(&format!("cmd {cmd} window=console")), "{cmd} ran from the console");
    }
    // T-BRG-5: core and plugin commands are refused and left no trace.
    for cmd in ["plugin:app|version", "plugin:window|title", "plugin:window|close", "plugin:webview|create_webview_window",
        "plugin:event|emit", "plugin:shell|execute", "plugin:fs|write_text_file"] {
        let row = find(&rows, "bridge", "invoke", Some(cmd)).expect(cmd);
        assert!(row["outcome"] == "rejected" || row["outcome"] == "no-invoke", "{cmd}: {row}");
    }
    assert!(!std::path::Path::new("/tmp/dp0-shell-pwned").exists());
    assert!(!std::path::Path::new("/tmp/dp0-fs-pwned").exists());
    assert!(find(&rows, "bridge", "done", None).is_some(), "the console window survived plugin:window|close");
    assert!(!audit.contains("window=evil"));
    // Raw channels without the helpers ran nothing either.
    assert!(!audit.lines().any(|l| l.starts_with("cmd ") && l.contains("window=console")), "{audit}");
    // T-BRG-6 positive control: the five are allowed from the status page, and
    // other commands are refused there.
    for cmd in APP_COMMANDS {
        let row = find(&rows, "status", "invoke", Some(cmd)).expect(cmd);
        assert_eq!(row["outcome"], "resolved", "{cmd}: {row}");
        assert!(audit.contains(&format!("cmd {cmd} window=status")), "{cmd}");
    }
    for cmd in ["plugin:app|version", "plugin:window|title", "plugin:webview|create_webview_window"] {
        let row = find(&rows, "status", "invoke", Some(cmd)).expect(cmd);
        assert_eq!(row["outcome"], "rejected", "{cmd}: {row}");
    }
    // T-NAV-8: the status window stayed on its bundled page.
    let after = find(&rows, "status", "status-after-navigation", None).unwrap();
    assert!(after["href"].as_str().unwrap().starts_with("tauri://localhost/"), "{after}");
    assert!(audit.contains("navigation window=status url=http://127.0.0.1:4319/ decision=Deny"));
    // Orderly quit: the child left through the lifeline without a signal.
    assert!(audit.contains("sent_sigkill=false"), "{audit}");
    assert!(case.read("events").contains("stdin-eof sigterm_seen=false"));
}

// T-BRG-4, T-BRG-5, T-BRG-6, T-NAV-8
#[test]
#[ignore]
fn gui_bridge() {
    bridge_run("gui-bridge", false);
}

// T-BRG-7: the same refusals with DevTools open.
#[test]
#[ignore]
fn gui_bridge_with_devtools() {
    bridge_run("gui-bridge-devtools", true);
}

// T-NAV-2, T-NAV-3, T-NAV-5, T-NAV-6, T-NAV-7
#[test]
#[ignore]
fn gui_navigation() {
    let case = Case::new("gui-nav", json!({ "mode": "ok", "page": "nav" }));
    let app = launch(&case, false);
    let done = wait_until(Duration::from_secs(60), || {
        let rows = results(&case);
        find(&rows, "nav", "after-redirect", None).is_some()
    });
    std::thread::sleep(Duration::from_secs(2));
    quit(&case, app);
    let (rows, audit) = (results(&case), case.read("audit"));
    println!("=== nav results ===\n{}\n=== nav audit ===\n{audit}", case.read("results"));
    assert!(done, "the page survived every step");
    // Every check is evaluated and reported; the test fails if any failed.
    let mut checks: Vec<(&str, bool, String)> = Vec::new();
    let console_url = "http://127.0.0.1:4319/";
    for probe in ["after-download", "after-external-navigation", "after-redirect"] {
        let row = find(&rows, "nav", probe, None).cloned().unwrap_or(Value::Null);
        checks.push(("page stayed on the console origin", row["href"] == console_url, format!("{probe}: {row}")));
    }
    checks.push(("T-NAV-2", audit.contains("navigation window=console url=https://example.com/dp0-direct decision=Deny"), "direct navigation refused".into()));
    checks.push((
        "T-NAV-3",
        audit.contains("navigation window=console url=https://example.com/dp0-redirect-target decision=Deny")
            && !audit.lines().any(|l| l.starts_with("page-load") && l.contains("example.com")),
        "redirect hop refused, no external page load".into(),
    ));
    checks.push((
        "T-NAV-5",
        !audit.contains("new-window window=console url=https://github.com/o/r/pull/5"),
        "a timer-driven window.open without a gesture must not reach the new-window hand-off".into(),
    ));
    checks.push(("T-NAV-6", audit.contains("download-denied window=console url=http://127.0.0.1:4319/download"), "download refused".into()));
    let media = find(&rows, "nav", "getUserMedia", None).cloned().unwrap_or(Value::Null);
    checks.push(("T-NAV-7 media", media["outcome"] == "refused", media.to_string()));
    let geo = find(&rows, "nav", "geolocation", None).cloned().unwrap_or(Value::Null);
    checks.push(("T-NAV-7 geolocation", geo["outcome"] != "granted" && !geo.is_null(), geo.to_string()));
    let note = find(&rows, "nav", "notification", None).cloned().unwrap_or(Value::Null);
    checks.push(("T-NAV-7 notification", note["permission"] != "granted" && !note.is_null(), note.to_string()));
    // Observation for T-NAV-4 (not a pass/fail: a script click is not a gesture).
    println!(
        "observation: synthetic target=_blank click -> new-window={} navigation-deny={}",
        audit.contains("new-window window=console url=https://github.com/o/r/pull/1"),
        audit.contains("navigation window=console url=https://github.com/o/r/pull/1 decision=Deny")
    );
    for (id, ok, detail) in &checks {
        println!("CHECK {id}: {} ({detail})", if *ok { "PASS" } else { "FAIL" });
    }
    assert!(done, "the page reached its last step");
    let failed: Vec<&str> = checks.iter().filter(|c| !c.1).map(|c| c.0).collect();
    assert!(failed.is_empty(), "failed checks: {failed:?}");
}

// T-OWN-4 (GUI): the owned child is killed from outside while the console
// polls. The console closes at once, nothing restarts, and a new listener on
// 4319 receives no request from the app for 60 s.
#[test]
#[ignore]
fn gui_owned_child_killed() {
    let case = Case::new("gui-own4", json!({ "mode": "ok", "page": "poll" }));
    let app = launch(&case, false);
    assert!(wait_until(Duration::from_secs(30), || case.read("requests").matches("GET /poll").count() >= 3), "console polls");
    let serve = case.pid("serve").unwrap();
    let group = case.pid("collector-group").unwrap();
    unsafe { libc::kill(serve, libc::SIGKILL) };
    assert!(wait_until(Duration::from_secs(3), || case.read("audit").contains("console-closed")), "{}", case.read("audit"));
    let audit = case.read("audit");
    assert!(audit.contains(&format!("child-exited pid={serve} status=ExitStatus(unix_wait_status(9))")), "{audit}");
    assert!(audit.contains("spawned-total=1"), "{audit}");
    assert!(wait_until(Duration::from_secs(5), || !group_alive(group)), "collector group reaped");
    let listener = TcpListener::bind(("127.0.0.1", dp0::DESKTOP_PORT)).expect("4319 is free after the child died");
    listener.set_nonblocking(true).unwrap();
    let accepted = Arc::new(AtomicUsize::new(0));
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(60) {
        if listener.accept().is_ok() {
            accepted.fetch_add(1, Ordering::SeqCst);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    println!("=== own4 audit ===\n{}", case.read("audit"));
    assert_eq!(accepted.load(Ordering::SeqCst), 0, "no request reached the new holder of 4319");
    assert_eq!(case.pids("serve").len(), 1, "no second child");
    quit(&case, app);
}
