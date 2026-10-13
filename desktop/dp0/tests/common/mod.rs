#![allow(dead_code)]
//! Shared helpers for the DP0 tests. Every test uses port 4319 and never
//! touches port 4318. Run with `--test-threads=1`.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use dp0::env::child_env;
use dp0::supervisor::LaunchSpec;

pub const FAKE: &str = env!("CARGO_BIN_EXE_fake-serve");
pub const SHELL_STANDIN: &str = env!("CARGO_BIN_EXE_supervise-once");
pub const APP: &str = env!("CARGO_BIN_EXE_dp0-shell");

pub struct Case {
    pub root: PathBuf,
    pub cwd: PathBuf,
    pub out: PathBuf,
}

impl Case {
    /// A fresh directory with `cwd/dp0-scenario.json` and an `out` directory.
    pub fn new(name: &str, scenario: serde_json::Value) -> Self {
        let root = std::env::temp_dir().join(format!("dp0-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let (cwd, out) = (root.join("repo"), root.join("out"));
        fs::create_dir_all(&cwd).unwrap();
        fs::create_dir_all(&out).unwrap();
        let mut scenario = scenario;
        scenario["out"] = serde_json::Value::String(out.display().to_string());
        fs::write(cwd.join("dp0-scenario.json"), scenario.to_string()).unwrap();
        Self { root, cwd, out }
    }

    pub fn spec(&self, cli: &str) -> LaunchSpec {
        LaunchSpec::new(
            PathBuf::from(cli),
            self.cwd.clone(),
            dp0::DESKTOP_PORT,
            child_env("/usr/bin:/bin", None, |k| std::env::var(k).ok()),
            self.out.join("logs"),
        )
    }

    pub fn read(&self, file: &str) -> String {
        fs::read_to_string(self.out.join(file)).unwrap_or_default()
    }

    /// Value of the first `<key> <n>` line in `out/pids`.
    pub fn pid(&self, key: &str) -> Option<i32> {
        self.read("pids").lines().find_map(|l| l.strip_prefix(&format!("{key} ")).and_then(|p| p.parse().ok()))
    }

    pub fn pids(&self, key: &str) -> Vec<i32> {
        self.read("pids").lines().filter_map(|l| l.strip_prefix(&format!("{key} ")).and_then(|p| p.parse().ok())).collect()
    }
}

impl Drop for Case {
    fn drop(&mut self) {
        // Kill only processes this case recorded, and only after checking that
        // the pid still runs the expected program (a reaped pid can be reused).
        for (key, program) in [("collector-grandchild", "sleep"), ("serve", "fake-serve")] {
            for pid in self.pids(key) {
                if pid > 1 && runs(pid, program) {
                    unsafe { libc::kill(pid, libc::SIGKILL) };
                }
            }
        }
        for pgid in self.pids("collector-group") {
            if pgid > 1 && runs(pgid, "fake-serve") {
                unsafe { libc::killpg(pgid, libc::SIGKILL) };
            }
        }
        let _ = fs::remove_dir_all(&self.root);
    }
}

/// True when `pid` is alive and its executable name is `program`.
pub fn runs(pid: i32, program: &str) -> bool {
    let Ok(out) = std::process::Command::new("/bin/ps").args(["-o", "comm=", "-p", &pid.to_string()]).output() else { return false };
    let comm = String::from_utf8_lossy(&out.stdout);
    comm.trim().rsplit('/').next() == Some(program)
}

pub fn alive(pid: i32) -> bool {
    unsafe { libc::kill(pid, 0) == 0 }
}

pub fn group_alive(pgid: i32) -> bool {
    unsafe { libc::killpg(pgid, 0) == 0 }
}

pub fn wait_until(timeout: Duration, mut done: impl FnMut() -> bool) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if done() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    done()
}

pub fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}
