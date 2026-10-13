//! Ownership and lifecycle of the one `operator serve` child (plan sections
//! 4.1 to 4.4, S2 and S5).
//!
//! Ownership comes only from the `Child` handle, the URL line on that child's
//! stdout and the child's liveness. The supervisor never opens a connection
//! to the port and never signals any process except its own child's group.

use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Close deadline inside `operator serve` (plan section 4.4).
pub const T_SERVE: Duration = Duration::from_secs(10);
/// Margin between the inner and the outer deadline (plan section 4.2).
pub const T_MARGIN: Duration = Duration::from_secs(5);
/// Outer deadline in the shell. It must stay at least `T_SERVE + T_MARGIN`.
pub const T_SHELL: Duration = Duration::from_secs(15);
/// From spawn to the URL line (plan section 4.1).
pub const START_DEADLINE: Duration = Duration::from_secs(30);
pub const URL_LINE_MAX: usize = 256;
pub const STDERR_LINE_MAX: usize = 4096;
pub const LOG_FILE_CAP: u64 = 1024 * 1024;
const POLL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone)]
pub struct LaunchSpec {
    pub cli: PathBuf,
    pub cwd: PathBuf,
    pub port: u16,
    pub env: Vec<(String, String)>,
    pub log_dir: PathBuf,
    pub start_deadline: Duration,
    pub stop_deadline: Duration,
}

impl LaunchSpec {
    pub fn new(cli: PathBuf, cwd: PathBuf, port: u16, env: Vec<(String, String)>, log_dir: PathBuf) -> Self {
        Self { cli, cwd, port, env, log_dir, start_deadline: START_DEADLINE, stop_deadline: T_SHELL }
    }

    pub fn expected_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartError {
    /// Structured `{"ok":false,"error":"port_in_use"}` on the first stderr line.
    PortInUse,
    /// Any other exit before the URL line. `code` is the decoded `error` field.
    StartFailed { code: Option<String> },
    /// The first stdout line is not exactly the expected URL.
    BadUrlLine,
    /// No URL line before the start deadline.
    Timeout,
    Spawn(String),
}

impl StartError {
    pub fn code(&self) -> String {
        match self {
            StartError::PortInUse => "port_in_use".into(),
            StartError::StartFailed { code: Some(code) } => format!("start_failed:{code}"),
            StartError::StartFailed { code: None } => "start_failed".into(),
            StartError::BadUrlLine => "bad_url_line".into(),
            StartError::Timeout => "start_timeout".into(),
            StartError::Spawn(_) => "spawn_failed".into(),
        }
    }
}

/// What the shell did to stop its child. Tests read it as evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StopReport {
    pub status: Option<ExitStatus>,
    pub waited: Duration,
    pub sent_sigkill: bool,
}

enum FirstLine {
    Line(Vec<u8>),
    Overflow,
    Eof,
}

/// One running child that this shell owns.
pub struct Owned {
    child: Arc<Mutex<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    pub pid: u32,
    pub url: String,
    stop_deadline: Duration,
}

impl Owned {
    /// `Some(status)` once the child has exited and has been reaped.
    pub fn try_exit(&self) -> Option<ExitStatus> {
        self.child.lock().unwrap().try_wait().ok().flatten()
    }

    /// Close the lifeline, wait for the child, and only after the outer
    /// deadline kill the child's own process group.
    pub fn stop(&self) -> StopReport {
        stop_child(&self.child, &self.stdin, self.pid, self.stop_deadline)
    }
}

fn stop_child(child: &Mutex<Child>, stdin: &Mutex<Option<ChildStdin>>, pid: u32, deadline: Duration) -> StopReport {
    drop(stdin.lock().unwrap().take());
    let started = Instant::now();
    loop {
        if let Some(status) = child.lock().unwrap().try_wait().ok().flatten() {
            return StopReport { status: Some(status), waited: started.elapsed(), sent_sigkill: false };
        }
        if started.elapsed() >= deadline {
            break;
        }
        thread::sleep(POLL);
    }
    // The child leads its own group (spawned with process_group(0)), so this
    // reaches the child and its non-detached descendants only.
    unsafe { libc::killpg(pid as i32, libc::SIGKILL) };
    let status = child.lock().unwrap().wait().ok();
    StopReport { status, waited: started.elapsed(), sent_sigkill: true }
}

/// Spawn `operator serve` and wait for its URL line.
pub fn start(spec: &LaunchSpec) -> Result<Owned, StartError> {
    fs::create_dir_all(&spec.log_dir).map_err(|e| StartError::Spawn(e.to_string()))?;
    let port = spec.port.to_string();
    let mut child = Command::new(&spec.cli)
        .args(["operator", "serve", "--host", "127.0.0.1", "--port", &port, "--exit-on-stdin-eof"])
        .current_dir(&spec.cwd)
        .env_clear()
        .envs(spec.env.iter().map(|(k, v)| (k, v)))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|e| StartError::Spawn(e.to_string()))?;
    let pid = child.id();
    let stdin = child.stdin.take();
    let first_line = drain_stdout(child.stdout.take().expect("piped stdout"));
    let stderr_line = drain_stderr(child.stderr.take().expect("piped stderr"), &spec.log_dir);
    let child = Arc::new(Mutex::new(child));
    let stdin = Mutex::new(stdin);
    let error = match first_line.recv_timeout(spec.start_deadline) {
        Ok(FirstLine::Line(line)) if line == spec.expected_url().as_bytes() => {
            return Ok(Owned { child, stdin, pid, url: spec.expected_url(), stop_deadline: spec.stop_deadline });
        }
        Ok(FirstLine::Line(_)) | Ok(FirstLine::Overflow) => StartError::BadUrlLine,
        Err(RecvTimeoutError::Timeout) => StartError::Timeout,
        Ok(FirstLine::Eof) | Err(RecvTimeoutError::Disconnected) => {
            stop_child(&child, &stdin, pid, spec.stop_deadline);
            // stderr reaches EOF once the child and every holder of the pipe are gone.
            let line = stderr_line.recv_timeout(Duration::from_secs(2)).ok().flatten();
            return Err(classify_stderr(line.as_deref()));
        }
    };
    // Every failure stops and reaps the child before it is reported.
    stop_child(&child, &stdin, pid, spec.stop_deadline);
    Err(error)
}

/// Only the structured `port_in_use` code means a busy port. The `message`
/// text and the exit code are never parsed.
pub fn classify_stderr(first_line: Option<&[u8]>) -> StartError {
    let Some(line) = first_line else { return StartError::StartFailed { code: None } };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(line) else {
        return StartError::StartFailed { code: None };
    };
    let code = value.get("error").and_then(|e| e.as_str()).map(str::to_string);
    let refused = value.get("ok") == Some(&serde_json::Value::Bool(false));
    match code {
        Some(code) if refused && code == "port_in_use" => StartError::PortInUse,
        Some(code) if refused && is_code(&code) => StartError::StartFailed { code: Some(code) },
        _ => StartError::StartFailed { code: None },
    }
}

fn is_code(code: &str) -> bool {
    !code.is_empty() && code.len() <= 64 && code.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')
}

/// Read the first line (at most `URL_LINE_MAX` bytes), then keep draining so
/// the child never blocks on a full pipe.
fn drain_stdout(stdout: impl Read + Send + 'static) -> Receiver<FirstLine> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        let first = match reader.by_ref().take(URL_LINE_MAX as u64 + 1).read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => FirstLine::Eof,
            Ok(_) if line.last() == Some(&b'\n') => {
                line.pop();
                FirstLine::Line(line)
            }
            Ok(_) if line.len() > URL_LINE_MAX => FirstLine::Overflow,
            Ok(_) => FirstLine::Eof,
        };
        let _ = tx.send(first);
        let _ = io::copy(&mut reader, &mut io::sink());
    });
    rx
}

/// Copy stderr into a capped, rotated log and report its first line.
fn drain_stderr(stderr: impl Read + Send + 'static, log_dir: &Path) -> Receiver<Option<Vec<u8>>> {
    let (tx, rx) = mpsc::channel();
    let log = RotatingLog::new(log_dir.join("serve.log"));
    thread::spawn(move || {
        let mut log = log;
        let mut reader = BufReader::new(stderr);
        let mut line = Vec::new();
        let first = match reader.by_ref().take(STDERR_LINE_MAX as u64 + 1).read_until(b'\n', &mut line) {
            Ok(n) if n > 0 => {
                log.write(&line);
                if line.last() == Some(&b'\n') {
                    line.pop();
                    Some(line)
                } else if line.len() > STDERR_LINE_MAX {
                    None
                } else {
                    Some(line)
                }
            }
            _ => None,
        };
        let _ = tx.send(first);
        let mut chunk = [0u8; 64 * 1024];
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => log.write(&chunk[..n]),
            }
        }
    });
    rx
}

/// `serve.log` plus one rotated `serve.log.1`, each at most `LOG_FILE_CAP`.
struct RotatingLog {
    path: PathBuf,
    file: Option<File>,
    size: u64,
}

impl RotatingLog {
    fn new(path: PathBuf) -> Self {
        Self { path, file: None, size: 0 }
    }

    fn open(&mut self) -> Option<&mut File> {
        if self.file.is_none() {
            let file = OpenOptions::new().create(true).append(true).mode(0o600).open(&self.path).ok()?;
            self.size = file.metadata().map(|m| m.len()).unwrap_or(0);
            self.file = Some(file);
        }
        self.file.as_mut()
    }

    fn write(&mut self, mut bytes: &[u8]) {
        while !bytes.is_empty() {
            if self.size >= LOG_FILE_CAP {
                self.file = None;
                let _ = fs::rename(&self.path, self.path.with_extension("log.1"));
                self.size = 0;
            }
            let room = (LOG_FILE_CAP - self.size.min(LOG_FILE_CAP)) as usize;
            let take = room.min(bytes.len());
            let Some(file) = self.open() else { return };
            if file.write_all(&bytes[..take]).is_err() {
                return;
            }
            self.size += take as u64;
            bytes = &bytes[take..];
        }
    }
}

/// Serialized start and restart: at most one owned child at any time.
#[derive(Default)]
pub struct Supervisor {
    current: Mutex<Option<Arc<Owned>>>,
    spawned: Mutex<Vec<u32>>,
}

impl Supervisor {
    /// Stop and reap the old child, then start a new one, under one lock.
    pub fn restart(&self, spec: &LaunchSpec) -> Result<Arc<Owned>, StartError> {
        let mut current = self.current.lock().unwrap();
        if let Some(old) = current.take() {
            old.stop();
        }
        let owned = Arc::new(start(spec)?);
        self.spawned.lock().unwrap().push(owned.pid);
        *current = Some(owned.clone());
        Ok(owned)
    }

    pub fn stop(&self) -> Option<StopReport> {
        self.current.lock().unwrap().take().map(|owned| owned.stop())
    }

    pub fn spawned(&self) -> Vec<u32> {
        self.spawned.lock().unwrap().clone()
    }
}

/// True when the exit status says the child was killed by `signal`.
pub fn killed_by(status: &ExitStatus, signal: i32) -> bool {
    status.signal() == Some(signal)
}

#[cfg(test)]
mod tests {
    use super::*;

    // T-LIFE-15
    #[test]
    fn outer_deadline_leaves_the_margin() {
        assert_eq!(T_SERVE, Duration::from_secs(10));
        assert!(T_SHELL >= T_SERVE + T_MARGIN);
        assert_eq!(START_DEADLINE, Duration::from_secs(30));
    }

    // T-OWN-1, T-OWN-6: classification reads only the structured code.
    #[test]
    fn only_structured_port_in_use_means_a_busy_port() {
        assert_eq!(classify_stderr(Some(br#"{"ok":false,"error":"port_in_use"}"#)), StartError::PortInUse);
        let generic = [
            &br#"{"ok":false,"error":"operator_server_unavailable","message":"listen EADDRINUSE: address already in use 127.0.0.1:4319"}"#[..],
            br#"listen EADDRINUSE: address already in use"#,
            br#"{"ok":true,"error":"port_in_use"}"#,
            br#"{"error":"port_in_use"}"#,
            br#"{"ok":false,"error":"PORT_IN_USE"}"#,
        ];
        for line in generic {
            assert_ne!(classify_stderr(Some(line)), StartError::PortInUse, "{}", String::from_utf8_lossy(line));
        }
        assert_eq!(classify_stderr(None), StartError::StartFailed { code: None });
    }
}
