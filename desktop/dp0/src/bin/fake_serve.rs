//! Test double for `repo-harness operator serve` in DP0.
//!
//! The shell starts it with the real argv. The behaviour comes from
//! `dp0-scenario.json` in the working directory, because the shell passes
//! only allowlisted environment variables. `collector` mode simulates a
//! detached collector group leader with the DP1 lifeline (plan section 4.4):
//! on stdin EOF it kills its own process group.

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use serde::Deserialize;

#[derive(Deserialize, Default, Clone)]
#[serde(deny_unknown_fields)]
struct Scenario {
    mode: String,
    /// Absolute directory for evidence files.
    out: String,
    #[serde(default)]
    page: Option<String>,
    #[serde(default)]
    cleanup_ms: u64,
}

static SIGTERM_SEEN: AtomicBool = AtomicBool::new(false);

extern "C" fn on_sigterm(_: libc::c_int) {
    SIGTERM_SEEN.store(true, Ordering::SeqCst);
}

fn append(path: &str, line: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("collector") {
        return collector(&args[2]);
    }
    let port: u16 = args
        .iter()
        .position(|a| a == "--port")
        .and_then(|i| args.get(i + 1))
        .and_then(|p| p.parse().ok())
        .expect("--port");
    let scenario: Scenario =
        serde_json::from_str(&fs::read_to_string("dp0-scenario.json").expect("scenario")).expect("scenario json");
    let out = scenario.out.clone();
    unsafe { libc::signal(libc::SIGTERM, on_sigterm as extern "C" fn(libc::c_int) as libc::sighandler_t) };
    // T-LIFE-9 evidence: no earlier serve may still be alive when a new one starts.
    for line in fs::read_to_string(format!("{out}/pids")).unwrap_or_default().lines() {
        if let Some(pid) = line.strip_prefix("serve ").and_then(|p| p.parse::<i32>().ok()) {
            if unsafe { libc::kill(pid, 0) } == 0 {
                append(&format!("{out}/events"), &format!("overlap {pid}"));
            }
        }
    }
    append(&format!("{out}/pids"), &format!("serve {}", std::process::id()));
    append(&format!("{out}/argv"), &args[1..].join(" "));
    let url = format!("http://127.0.0.1:{port}");
    let mut stderr = io::stderr();
    match scenario.mode.as_str() {
        "port-in-use" => {
            let _ = writeln!(stderr, r#"{{"ok":false,"error":"port_in_use"}}"#);
            std::process::exit(1);
        }
        "unavailable" => {
            let _ = writeln!(
                stderr,
                r#"{{"ok":false,"error":"operator_server_unavailable","message":"listen EADDRINUSE: address already in use 127.0.0.1:{port}"}}"#
            );
            std::process::exit(1);
        }
        "exit1-silent" => std::process::exit(1),
        "stderr-not-json" => {
            let _ = writeln!(stderr, "listen EADDRINUSE: address already in use 127.0.0.1:{port}");
            std::process::exit(1);
        }
        "stderr-too-long" => {
            let pad = "x".repeat(5000);
            let _ = writeln!(stderr, r#"{{"ok":false,"pad":"{pad}","error":"port_in_use"}}"#);
            std::process::exit(1);
        }
        "url-then-exit" => {
            println!("{url}");
            std::process::exit(0);
        }
        "no-url" => wait_for_eof(),
        "dump-env" => {
            let env: BTreeMap<String, String> = std::env::vars().collect();
            fs::write(format!("{out}/env.json"), serde_json::to_string(&env).unwrap()).unwrap();
            println!("{url}");
            wait_for_eof();
        }
        mode if mode.starts_with("bad-url:") => {
            let line = match &mode["bad-url:".len()..] {
                "extra" => format!("{url}/"),
                "other-port" => "http://127.0.0.1:4318".to_string(),
                "localhost" => format!("http://localhost:{port}"),
                "long" => format!("{url}{}", "x".repeat(300)),
                other => panic!("unknown bad-url variant {other}"),
            };
            println!("{line}");
            wait_for_eof();
        }
        "ok" | "flood" | "ignore-eof" => serve(&scenario, port, &url),
        other => panic!("unknown mode {other}"),
    }
}

fn wait_for_eof() {
    let _ = io::copy(&mut io::stdin(), &mut io::sink());
}

/// Bind the port, start one simulated collector group, print the URL line,
/// serve test pages, and close on stdin EOF.
fn serve(scenario: &Scenario, port: u16, url: &str) {
    let out = scenario.out.clone();
    let listener = match TcpListener::bind(("127.0.0.1", port)) {
        Ok(listener) => listener,
        Err(error) if error.kind() == io::ErrorKind::AddrInUse => {
            let _ = writeln!(io::stderr(), r#"{{"ok":false,"error":"port_in_use"}}"#);
            std::process::exit(1);
        }
        Err(_) => {
            let _ = writeln!(io::stderr(), r#"{{"ok":false,"error":"operator_server_unavailable"}}"#);
            std::process::exit(1);
        }
    };
    let me = std::env::current_exe().unwrap();
    let mut collector = Command::new(me)
        .args(["collector", &out])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .expect("collector");
    append(&format!("{out}/pids"), &format!("collector-group {}", collector.id()));
    let page = scenario.page.clone().unwrap_or_else(|| "plain".into());
    {
        let out = out.clone();
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let out = out.clone();
                let page = page.clone();
                thread::spawn(move || handle(stream, &out, &page, port));
            }
        });
    }
    println!("{url}");
    let _ = io::stdout().flush();
    if scenario.mode == "flood" {
        let block = vec![b'.'; 1024 * 1024];
        for _ in 0..10 {
            let _ = io::stdout().write_all(&block);
            let _ = io::stderr().write_all(&block);
        }
        append(&format!("{out}/events"), "flood-done");
    }
    if scenario.mode == "ignore-eof" {
        loop {
            thread::sleep(Duration::from_secs(3600));
        }
    }
    wait_for_eof();
    append(&format!("{out}/events"), &format!("stdin-eof sigterm_seen={}", SIGTERM_SEEN.load(Ordering::SeqCst)));
    // Orderly close: end the collector lifeline, wait for it, then exit.
    drop(collector.stdin.take());
    let _ = collector.wait();
    thread::sleep(Duration::from_millis(scenario.cleanup_ms));
    append(&format!("{out}/events"), "serve-exit");
}

/// Simulated detached collector: one grandchild in the same group, and a
/// lifeline that kills the whole group on stdin EOF.
fn collector(out: &str) {
    let grandchild = Command::new("/bin/sleep").arg("300").stdin(Stdio::null()).spawn().expect("sleep");
    append(&format!("{out}/pids"), &format!("collector-grandchild {}", grandchild.id()));
    wait_for_eof();
    unsafe { libc::kill(0, libc::SIGKILL) };
}

fn handle(mut stream: TcpStream, out: &str, page: &str, port: u16) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }
    let mut headers = BTreeMap::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
            break;
        }
        if let Some((k, v)) = line.trim_end().split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    let origin = headers.get("origin").cloned().unwrap_or_default();
    append(&format!("{out}/requests"), &format!("{} origin={origin}", request_line.trim_end()));
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    let body_len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut body = vec![0u8; body_len.min(1024 * 1024)];
    let _ = reader.read_exact(&mut body);
    let (status, extra, content_type, payload): (&str, String, &str, Vec<u8>) = match (method, target) {
        ("OPTIONS", _) => ("204 No Content", "Access-Control-Allow-Methods: POST\r\nAccess-Control-Allow-Headers: content-type\r\n".into(), "text/plain", vec![]),
        ("POST", "/result") => {
            append(&format!("{out}/results"), &String::from_utf8_lossy(&body));
            ("204 No Content", String::new(), "text/plain", vec![])
        }
        ("GET", "/redirect") => ("302 Found", "Location: https://example.com/dp0-redirect-target\r\n".into(), "text/plain", vec![]),
        ("GET", "/download") => (
            "200 OK",
            "Content-Disposition: attachment; filename=\"dp0-download.bin\"\r\n".into(),
            "application/octet-stream",
            b"dp0".to_vec(),
        ),
        ("GET", path) if path == "/" || path.starts_with("/?") || path.starts_with("/#") => {
            ("200 OK", String::new(), "text/html; charset=utf-8", page_html(page, port).into_bytes())
        }
        ("GET", _) => ("200 OK", String::new(), "text/plain", b"ok".to_vec()),
        _ => ("405 Method Not Allowed", String::new(), "text/plain", vec![]),
    };
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\n{extra}Connection: close\r\n\r\n",
        payload.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(&payload);
}

fn page_html(page: &str, port: u16) -> String {
    let script = match page {
        "bridge" => include_str!("../../pages/test/bridge.js"),
        "nav" => include_str!("../../pages/test/nav.js"),
        "poll" => include_str!("../../pages/test/poll.js"),
        _ => "",
    };
    format!(
        "<!doctype html><meta charset=utf-8><title>dp0 {page}</title><body><h1>dp0 {page} :{port}</h1>\
         <a id=pr href=\"https://github.com/o/r/pull/1\" target=\"_blank\" rel=\"noreferrer noopener\">PR</a>\
         <script>{script}</script></body>"
    )
}
