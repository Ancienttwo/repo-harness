//! DP0 shell-side lifecycle, ownership and environment proofs.
//! `cargo test --test lifecycle -- --test-threads=1`

mod common;

use std::fs;
use std::net::TcpListener;
use std::os::unix::fs::PermissionsExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use common::*;
use dp0::env::child_env;
use dp0::probe;
use dp0::supervisor::{self, killed_by, start, StartError, Supervisor, LOG_FILE_CAP, T_SHELL};
use serde_json::json;

/// Accepts and counts connections on 4319. Dropping it releases the port.
struct PortWatcher {
    accepted: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl PortWatcher {
    fn bind() -> Self {
        let listener = TcpListener::bind(("127.0.0.1", dp0::DESKTOP_PORT)).expect("4319 must be free for this test");
        listener.set_nonblocking(true).unwrap();
        let accepted = Arc::new(AtomicUsize::new(0));
        let stop = Arc::new(AtomicBool::new(false));
        let (counter, stopping) = (accepted.clone(), stop.clone());
        let thread = std::thread::spawn(move || {
            while !stopping.load(Ordering::SeqCst) {
                if listener.accept().is_ok() {
                    counter.fetch_add(1, Ordering::SeqCst);
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        });
        Self { accepted, stop, thread: Some(thread) }
    }

    fn count(&self) -> usize {
        self.accepted.load(Ordering::SeqCst)
    }
}

impl Drop for PortWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

// T-OWN-1: the port is held by another listener. The child's bind fails with
// the structured code, the shell shows "port in use", and the shell itself
// never connects to the port.
#[test]
fn t_own_1_busy_port_is_reported_only_from_structured_evidence() {
    let watcher = PortWatcher::bind();
    let case = Case::new("own1", json!({ "mode": "ok" }));
    let result = start(&case.spec(FAKE));
    std::thread::sleep(Duration::from_millis(500));
    assert_eq!(result.err(), Some(StartError::PortInUse));
    assert_eq!(watcher.count(), 0, "the shell must not connect to the busy port");
    assert!(!alive(case.pid("serve").unwrap()), "the failed child is reaped");
}

// T-OWN-2: a correct URL line followed by an exit. The shell sees the exit of
// its own child and does not start another one.
#[test]
fn t_own_2_url_then_exit_is_seen_as_an_exit() {
    let case = Case::new("own2", json!({ "mode": "url-then-exit" }));
    let supervisor = Supervisor::default();
    let owned = supervisor.restart(&case.spec(FAKE)).expect("URL line arrives first");
    assert!(wait_until(Duration::from_secs(3), || owned.try_exit().is_some()));
    std::thread::sleep(Duration::from_secs(2));
    assert_eq!(supervisor.spawned().len(), 1, "no automatic restart");
    assert_eq!(case.pids("serve").len(), 1);
}

// T-OWN-3: any URL line that is not exactly http://127.0.0.1:4319 is refused,
// and the child is stopped and reaped.
#[test]
fn t_own_3_url_line_must_match_exactly() {
    for variant in ["extra", "other-port", "localhost", "long"] {
        let case = Case::new(&format!("own3-{variant}"), json!({ "mode": format!("bad-url:{variant}") }));
        let started = Instant::now();
        assert_eq!(start(&case.spec(FAKE)).err(), Some(StartError::BadUrlLine), "{variant}");
        let pid = case.pid("serve").unwrap();
        assert!(!alive(pid), "{variant}: child {pid} reaped");
        assert!(started.elapsed() < T_SHELL, "{variant}: the child left on stdin EOF");
    }
}

// T-OWN-4 (shell level): the child is killed from outside. The shell's Child
// reports SIGKILL, nothing restarts, and the child's detached collector group
// is gone through its lifeline.
#[test]
fn t_own_4_external_kill_is_observed_on_the_real_child() {
    let case = Case::new("own4", json!({ "mode": "ok" }));
    let supervisor = Supervisor::default();
    let owned = supervisor.restart(&case.spec(FAKE)).unwrap();
    let group = case.pid("collector-group").expect("collector started");
    assert!(group_alive(group));
    unsafe { libc::kill(owned.pid as i32, libc::SIGKILL) };
    assert!(wait_until(Duration::from_secs(3), || owned.try_exit().is_some()));
    let status = owned.try_exit().unwrap();
    assert!(killed_by(&status, libc::SIGKILL), "{status:?}");
    assert!(wait_until(Duration::from_secs(5), || !group_alive(group)), "collector group {group} reaped");
    std::thread::sleep(Duration::from_secs(1));
    assert_eq!(supervisor.spawned().len(), 1);
}

// T-OWN-6: start failures that are not a busy port, including a message that
// mentions EADDRINUSE and an over-long line that ends with port_in_use.
#[test]
fn t_own_6_other_start_failures_are_generic() {
    for mode in ["unavailable", "exit1-silent", "stderr-not-json", "stderr-too-long"] {
        let case = Case::new(&format!("own6-{mode}"), json!({ "mode": mode }));
        let error = start(&case.spec(FAKE)).err().expect(mode);
        assert!(matches!(error, StartError::StartFailed { .. }), "{mode}: {error:?}");
    }
}

// T-OWN-6 with the installed CLI (opt-in: DP0_REAL_CLI=<path>). The current
// release has no --exit-on-stdin-eof yet (DP1), so it must fail generically.
#[test]
fn t_own_6_real_cli_without_the_dp1_flag_fails_generically() {
    let Ok(cli) = std::env::var("DP0_REAL_CLI") else { return eprintln!("skipped: DP0_REAL_CLI not set") };
    let watcher = PortWatcher::bind();
    let case = Case::new("own6-real", json!({ "mode": "unused" }));
    let mut spec = case.spec(&cli);
    spec.env = child_env(&std::env::var("PATH").unwrap(), None, |k| std::env::var(k).ok());
    let error = start(&spec).err().expect("the release CLI must refuse the DP1 flag");
    eprintln!("real CLI: {error:?}; log: {}", case.read("logs/serve.log").lines().next().unwrap_or(""));
    assert!(matches!(error, StartError::StartFailed { .. }), "{error:?}");
    assert_eq!(watcher.count(), 0);
}

// T-LIFE-3: the shell process is killed with SIGKILL. The child sees stdin
// EOF and exits; its collector group follows.
#[test]
fn t_life_3_shell_kill_9_stops_the_child() {
    run_shell_kill_case("life3", false);
}

// T-LIFE-4: the shell starts another process after the child (like the probe
// or `open`). That process must not inherit the lifeline write end.
#[test]
fn t_life_4_lifeline_write_end_is_not_inherited() {
    run_shell_kill_case("life4", true);
}

fn run_shell_kill_case(name: &str, linger: bool) {
    let case = Case::new(name, json!({ "mode": "ok" }));
    let mut args = vec![FAKE.to_string(), case.cwd.display().to_string(), case.out.display().to_string()];
    if linger {
        args.push("--linger".into());
    }
    let mut shell = Command::new(SHELL_STANDIN).args(&args).stdin(Stdio::null()).spawn().unwrap();
    assert!(wait_until(Duration::from_secs(10), || case.out.join("shell-ready").exists()));
    let ready = case.read("shell-ready");
    let serve = case.pid("serve").unwrap();
    let group = case.pid("collector-group").unwrap();
    let linger_pid: Option<i32> = ready.lines().find_map(|l| l.strip_prefix("linger ").and_then(|p| p.parse().ok()));
    assert_eq!(linger, linger_pid.is_some());
    unsafe { libc::kill(shell.id() as i32, libc::SIGKILL) };
    let _ = shell.wait();
    let gone = wait_until(Duration::from_secs(5), || !alive(serve));
    if let Some(pid) = linger_pid {
        assert!(alive(pid), "the unrelated process is still running, so it could hold an inherited pipe");
        unsafe { libc::kill(pid, libc::SIGKILL) };
    }
    assert!(gone, "child {serve} exited after the shell died");
    assert!(wait_until(Duration::from_secs(5), || !group_alive(group)), "collector group {group} reaped");
    assert!(case.read("events").contains("stdin-eof"), "the child left through the lifeline");
}

// T-LIFE-7: 10 MiB on each of stdout and stderr. The child never blocks and
// the log stays within two files of 1 MiB.
#[test]
fn t_life_7_output_is_drained_and_capped() {
    let case = Case::new("life7", json!({ "mode": "flood" }));
    let owned = start(&case.spec(FAKE)).unwrap();
    assert!(wait_until(Duration::from_secs(30), || case.read("events").contains("flood-done")), "child finished writing");
    let logs = case.out.join("logs");
    let mut names: Vec<String> = fs::read_dir(&logs).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
    names.sort();
    assert_eq!(names, ["serve.log", "serve.log.1"]);
    for name in &names {
        assert!(file_size(&logs.join(name)) <= LOG_FILE_CAP, "{name}");
        let mode = fs::metadata(logs.join(name)).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "{name}");
    }
    assert!(!owned.stop().sent_sigkill);
}

// T-LIFE-8: no URL line before the start deadline. The deadline is scaled
// down for the test; the production value is fixed in the unit test.
#[test]
fn t_life_8_start_deadline_stops_and_reaps_the_child() {
    let case = Case::new("life8", json!({ "mode": "no-url" }));
    let mut spec = case.spec(FAKE);
    spec.start_deadline = Duration::from_secs(2);
    let started = Instant::now();
    assert_eq!(start(&spec).err(), Some(StartError::Timeout));
    assert!(started.elapsed() >= Duration::from_secs(2));
    assert!(!alive(case.pid("serve").unwrap()));
}

// T-LIFE-9: retries from two threads at once. At most one owned child is
// alive at any time; the child records any overlap it sees at start.
#[test]
fn t_life_9_retry_never_overlaps_children() {
    let case = Case::new("life9", json!({ "mode": "ok" }));
    let spec = case.spec(FAKE);
    let supervisor = Arc::new(Supervisor::default());
    let threads: Vec<_> = (0..2)
        .map(|_| {
            let (supervisor, spec) = (supervisor.clone(), spec.clone());
            std::thread::spawn(move || {
                for _ in 0..2 {
                    supervisor.restart(&spec).expect("restart");
                }
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    let serves = case.pids("serve");
    assert_eq!(serves.len(), 4);
    assert_eq!(supervisor.spawned().len(), 4);
    assert!(!case.read("events").contains("overlap"), "{}", case.read("events"));
    let alive_now: Vec<i32> = serves.iter().copied().filter(|p| alive(*p)).collect();
    assert_eq!(alive_now.len(), 1);
    supervisor.stop();
}

// T-LIFE-14: the child is stuck (SIGSTOP). The shell sends nothing before
// T_SHELL, then kills the child's group; the collector group follows.
#[test]
fn t_life_14_stuck_child_is_killed_only_after_the_outer_deadline() {
    let case = Case::new("life14", json!({ "mode": "ok" }));
    let owned = start(&case.spec(FAKE)).unwrap();
    let group = case.pid("collector-group").unwrap();
    unsafe { libc::kill(owned.pid as i32, libc::SIGSTOP) };
    let report = owned.stop();
    assert!(report.waited >= T_SHELL, "{report:?}");
    assert!(report.sent_sigkill);
    assert!(killed_by(&report.status.unwrap(), libc::SIGKILL));
    assert!(!case.read("events").contains("stdin-eof"), "a stopped child cannot run its close path");
    assert!(wait_until(Duration::from_secs(5), || !group_alive(group)), "collector group {group} reaped");
}

// T-LIFE-15: an orderly close inside T_SERVE needs no signal from the shell.
#[test]
fn t_life_15_orderly_close_sends_no_signal() {
    let case = Case::new("life15", json!({ "mode": "ok", "cleanup_ms": 1000 }));
    let owned = start(&case.spec(FAKE)).unwrap();
    let report = owned.stop();
    assert!(!report.sent_sigkill, "{report:?}");
    assert!(report.waited >= Duration::from_secs(1) && report.waited < supervisor::T_SERVE, "{report:?}");
    assert!(report.status.unwrap().success());
    let events = case.read("events");
    assert!(events.contains("stdin-eof sigterm_seen=false") && events.contains("serve-exit"), "{events}");
}

/// A fake login shell for T-ENV-1: it runs the probe script with its own PATH.
fn fake_shell(dir: &std::path::Path, body: &str) -> std::path::PathBuf {
    let bin = dir.join("bin");
    fs::create_dir_all(&bin).unwrap();
    let cli = bin.join("repo-harness");
    fs::write(&cli, "#!/bin/sh\n").unwrap();
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).unwrap();
    let shell = dir.join("fake-shell");
    let script = format!("#!/bin/sh\nexport PATH={}:/usr/bin:/bin\nexport GH_TOKEN=fake-token-value\n{body}\n", bin.display());
    fs::write(&shell, script).unwrap();
    fs::set_permissions(&shell, fs::Permissions::from_mode(0o755)).unwrap();
    shell
}

// T-ENV-1: rc noise, a read from stdin, a hang, too much output, and a
// missing CLI.
#[test]
fn t_env_1_probe_survives_rc_files() {
    let dir = std::env::temp_dir().join(format!("dp0-env1-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let noisy = fake_shell(&dir.join("noisy"), "echo 'Welcome!'; read line; /bin/sh -c \"$4\"; echo 'bye'");
    let values = probe::run(&noisy, probe::PROBE_TIMEOUT).expect("noisy rc");
    assert!(values.cli_path.ends_with("bin/repo-harness") && values.cli_path.is_absolute());
    assert!(values.path.contains("/usr/bin"));
    assert!(!format!("{values:?}").contains("fake-token-value"), "the probe never returns other variables");

    let hang = fake_shell(&dir.join("hang"), "echo $$ > \"$(dirname \"$0\")/pid\"; /bin/sleep 30; /bin/sh -c \"$4\"");
    let started = Instant::now();
    assert_eq!(probe::run(&hang, Duration::from_secs(2)), Err(probe::ProbeError::Timeout));
    assert!(started.elapsed() < Duration::from_secs(4));
    let pid: i32 = fs::read_to_string(dir.join("hang/pid")).unwrap().trim().parse().unwrap();
    assert!(wait_until(Duration::from_secs(2), || !alive(pid)), "the hung probe group is killed");

    let flood = fake_shell(&dir.join("flood"), "/usr/bin/yes x | /usr/bin/head -c 200000; /bin/sh -c \"$4\"");
    assert_eq!(probe::run(&flood, probe::PROBE_TIMEOUT), Err(probe::ProbeError::OutputTooLarge));

    let missing = dir.join("missing");
    fs::create_dir_all(&missing).unwrap();
    let shell = missing.join("fake-shell");
    fs::write(&shell, "#!/bin/sh\nexport PATH=/usr/bin:/bin\n/bin/sh -c \"$4\"\n").unwrap();
    fs::set_permissions(&shell, fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(probe::run(&shell, probe::PROBE_TIMEOUT), Err(probe::ProbeError::CliNotFound));
    let _ = fs::remove_dir_all(&dir);
}

// T-ENV-1 against the real login shell (opt-in: DP0_REAL_SHELL=1). Prints
// only booleans, never the PATH.
#[test]
fn t_env_1_real_login_shell() {
    if std::env::var("DP0_REAL_SHELL").as_deref() != Ok("1") {
        return eprintln!("skipped: DP0_REAL_SHELL not set");
    }
    let started = Instant::now();
    let values = probe::run(std::path::Path::new("/bin/zsh"), probe::PROBE_TIMEOUT).expect("real probe");
    eprintln!(
        "real probe: cli_absolute={} cli_name_ok={} path_has_entries={} rh_home_set={} elapsed_ms={}",
        values.cli_path.is_absolute(),
        values.cli_path.ends_with("repo-harness"),
        values.path.split(':').count() > 1,
        values.repo_harness_home.is_some(),
        started.elapsed().as_millis()
    );
    assert!(values.cli_path.is_absolute());
}

// T-ENV-2 (child part) and T-ENV-3: the child sees exactly the allowlist, and
// a token in the parent never reaches the child or any evidence file.
#[test]
fn t_env_3_child_environment_is_the_allowlist() {
    let case = Case::new("env3", json!({ "mode": "dump-env" }));
    let mut spec = case.spec(FAKE);
    spec.env = child_env("/usr/bin:/bin", Some("/tmp/dp0-rh-home"), |key| match key {
        "GH_TOKEN" => Some("fake-token-value".into()),
        other => std::env::var(other).ok(),
    });
    std::env::set_var("GH_TOKEN", "fake-token-value");
    let owned = start(&spec).unwrap();
    std::env::remove_var("GH_TOKEN");
    let env: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&case.read("env.json")).unwrap();
    let mut keys: Vec<&str> = env.keys().map(String::as_str).collect();
    keys.sort();
    let mut expected: Vec<&str> = ["PATH", "REPO_HARNESS_HOME"].to_vec();
    expected.extend(dp0::env::INHERITED_KEYS.iter().copied().filter(|k| std::env::var(k).is_ok()));
    expected.sort();
    assert_eq!(keys, expected);
    owned.stop();
    for entry in fs::read_dir(&case.out).unwrap().flatten() {
        if entry.path().is_file() {
            assert!(!fs::read_to_string(entry.path()).unwrap_or_default().contains("fake-token-value"), "{:?}", entry.path());
        }
    }
    assert!(!case.read("logs/serve.log").contains("fake-token-value"));
}
