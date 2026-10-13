//! Login-shell probe (plan section 4.5). The probe prints only three values
//! between fixed markers. It never reads the full environment.

use std::io::Read;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

pub const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
pub const PROBE_OUTPUT_CAP: usize = 64 * 1024;

const BEGIN: &str = "\x1eRH-PROBE-BEGIN\x1e";
const END: &str = "\x1eRH-PROBE-END\x1e";
const SCRIPT: &str = r#"printf '\036RH-PROBE-BEGIN\036%s\036%s\036%s\036RH-PROBE-END\036' "$PATH" "$(command -v repo-harness 2>/dev/null)" "${REPO_HARNESS_HOME-}""#;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeValues {
    pub path: String,
    pub cli_path: PathBuf,
    pub repo_harness_home: Option<PathBuf>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ProbeError {
    Spawn,
    Timeout,
    OutputTooLarge,
    MarkersMissing,
    CliNotFound,
    NotAbsolute,
}

/// Run `<shell> -l -i -c <script>` with stdin `/dev/null`.
pub fn run(shell: &Path, timeout: Duration) -> Result<ProbeValues, ProbeError> {
    let mut child = Command::new(shell)
        .args(["-l", "-i", "-c", SCRIPT])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|_| ProbeError::Spawn)?;
    let pgid = child.id() as i32;
    let mut stdout = child.stdout.take().expect("piped stdout");
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 8192];
        loop {
            match stdout.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    buf.extend_from_slice(&chunk[..n]);
                    if buf.len() > PROBE_OUTPUT_CAP {
                        let _ = tx.send(Err(ProbeError::OutputTooLarge));
                        return;
                    }
                }
            }
        }
        let _ = tx.send(Ok(buf));
    });
    let outcome = rx.recv_timeout(timeout);
    // The probe and anything its rc files started share one process group.
    unsafe { libc::killpg(pgid, libc::SIGKILL) };
    let _ = child.wait();
    let bytes = match outcome {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(error)) => return Err(error),
        Err(_) => return Err(ProbeError::Timeout),
    };
    parse(&String::from_utf8_lossy(&bytes))
}

pub fn parse(output: &str) -> Result<ProbeValues, ProbeError> {
    let start = output.find(BEGIN).ok_or(ProbeError::MarkersMissing)? + BEGIN.len();
    let len = output[start..].find(END).ok_or(ProbeError::MarkersMissing)?;
    let fields: Vec<&str> = output[start..start + len].split('\x1e').collect();
    let [path, cli, home] = fields[..] else { return Err(ProbeError::MarkersMissing) };
    if cli.is_empty() {
        return Err(ProbeError::CliNotFound);
    }
    let cli_path = PathBuf::from(cli);
    let repo_harness_home = (!home.is_empty()).then(|| PathBuf::from(home));
    if !cli_path.is_absolute() || repo_harness_home.as_ref().is_some_and(|h| !h.is_absolute()) {
        return Err(ProbeError::NotAbsolute);
    }
    Ok(ProbeValues { path: path.to_string(), cli_path, repo_harness_home })
}
