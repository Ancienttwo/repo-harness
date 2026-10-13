//! DP0 shell prototype. It runs the real ownership, bridge and navigation
//! rules against a test double or the real CLI, and writes every decision to
//! an audit file that the DP0 tests read.
//!
//! Inputs (test-only environment variables):
//! - `DP0_CLI`: absolute path of the CLI to start.
//! - `DP0_CWD`: working directory of the child (the main repository).
//! - `DP0_OUT`: evidence directory (audit, logs, quit request).
//! - `DP0_PATH`: PATH for the child. `DP0_DEVTOOLS=1` opens DevTools.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use dp0::env::child_env;
use dp0::nav::{self, Decision, WindowKind};
use dp0::supervisor::{LaunchSpec, Supervisor};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent, PermissionResponse};
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};

struct Shared {
    out: PathBuf,
    spec: LaunchSpec,
    supervisor: Supervisor,
    report: Mutex<serde_json::Value>,
    exiting: AtomicBool,
    devtools: bool,
}

impl Shared {
    fn audit(&self, line: &str) {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(self.out.join("audit")) {
            let _ = writeln!(file, "{line}");
        }
    }
}

fn record(shared: &Shared, webview: &tauri::Webview, name: &str) {
    shared.audit(&format!("cmd {name} window={} url={}", webview.label(), webview.url().map(|u| u.to_string()).unwrap_or_default()));
}

#[tauri::command]
fn status_report(webview: tauri::Webview, shared: State<'_, Arc<Shared>>) -> String {
    record(&shared, &webview, "status_report");
    shared.report.lock().unwrap().to_string()
}

#[tauri::command]
fn retry_start(webview: tauri::Webview, shared: State<'_, Arc<Shared>>) {
    record(&shared, &webview, "retry_start");
}

#[tauri::command]
fn choose_main_repo(webview: tauri::Webview, shared: State<'_, Arc<Shared>>) {
    record(&shared, &webview, "choose_main_repo");
}

#[tauri::command]
fn open_config(webview: tauri::Webview, shared: State<'_, Arc<Shared>>) {
    record(&shared, &webview, "open_config");
}

#[tauri::command]
fn quit_app(webview: tauri::Webview, shared: State<'_, Arc<Shared>>) {
    record(&shared, &webview, "quit_app");
}

fn required(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"))
}

fn main() {
    let out = PathBuf::from(required("DP0_OUT"));
    let path = std::env::var("DP0_PATH").unwrap_or_else(|_| "/usr/bin:/bin".into());
    let spec = LaunchSpec::new(
        PathBuf::from(required("DP0_CLI")),
        PathBuf::from(required("DP0_CWD")),
        dp0::DESKTOP_PORT,
        child_env(&path, None, |k| std::env::var(k).ok()),
        out.join("logs"),
    );
    let shared = Arc::new(Shared {
        out,
        spec,
        supervisor: Supervisor::default(),
        report: Mutex::new(serde_json::json!({ "state": "starting" })),
        exiting: AtomicBool::new(false),
        devtools: std::env::var("DP0_DEVTOOLS").as_deref() == Ok("1"),
    });
    let setup_shared = shared.clone();
    let permission_shared = shared.clone();
    let app = tauri::Builder::default()
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![status_report, retry_start, choose_main_repo, open_config, quit_app])
        .on_permission_request(move |webview, kind| {
            permission_shared.audit(&format!("permission-denied scope=app window={} kind={kind:?}", webview.label()));
            PermissionResponse::Deny
        })
        .setup(move |app| {
            let shared = setup_shared.clone();
            build_status_window(app.handle(), &shared)?;
            let handle = app.handle().clone();
            thread::spawn(move || start_flow(handle, shared.clone()));
            let quit_shared = setup_shared.clone();
            let quit_handle = app.handle().clone();
            thread::spawn(move || loop {
                if quit_shared.out.join("quit").exists() {
                    quit_shared.audit("quit-requested");
                    quit_handle.exit(0);
                    return;
                }
                thread::sleep(Duration::from_millis(100));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("build app");
    app.run(move |_, event| match event {
        RunEvent::ExitRequested { .. } => shared.exiting.store(true, Ordering::SeqCst),
        RunEvent::Exit => {
            shared.exiting.store(true, Ordering::SeqCst);
            match shared.supervisor.stop() {
                Some(r) => shared.audit(&format!(
                    "stopped status={:?} waited_ms={} sent_sigkill={}",
                    r.status, r.waited.as_millis(), r.sent_sigkill
                )),
                None => shared.audit("stopped none"),
            }
        }
        _ => {}
    });
}

fn build_status_window(app: &AppHandle, shared: &Arc<Shared>) -> tauri::Result<()> {
    let nav_shared = shared.clone();
    let popup_shared = shared.clone();
    let download_shared = shared.clone();
    WebviewWindowBuilder::new(app, "status", WebviewUrl::App("status.html".into()))
        .title("repo-harness")
        .inner_size(480.0, 240.0)
        .on_navigation(move |url| {
            let decision = nav::navigation(WindowKind::Status, url);
            nav_shared.audit(&format!("navigation window=status url={url} decision={decision:?}"));
            decision == Decision::Stay
        })
        .on_new_window(move |url, _| {
            popup_shared.audit(&format!("new-window window=status url={url} decision=Deny"));
            NewWindowResponse::Deny
        })
        .on_download(move |_, event| {
            if let DownloadEvent::Requested { url, .. } = event {
                download_shared.audit(&format!("download-denied window=status url={url}"));
            }
            false
        })
        .build()?;
    Ok(())
}

fn start_flow(handle: AppHandle, shared: Arc<Shared>) {
    shared.audit(&format!("spawn-request port={}", shared.spec.port));
    let owned = match shared.supervisor.restart(&shared.spec) {
        Ok(owned) => owned,
        Err(error) => {
            shared.audit(&format!("start-failed code={}", error.code()));
            *shared.report.lock().unwrap() = serde_json::json!({ "state": "failed", "error": error.code() });
            if let Some(status) = handle.get_webview_window("status") {
                let _ = status.eval(format!("window.dp0ShowFailure({:?})", error.code()));
            }
            return;
        }
    };
    shared.audit(&format!("started pid={} url={}", owned.pid, owned.url));
    *shared.report.lock().unwrap() = serde_json::json!({ "state": "running", "url": owned.url });
    let port = shared.spec.port;
    let url: tauri::Url = owned.url.parse().expect("owned url");
    let (nav_s, popup_s, dl_s, perm_s, load_s) = (shared.clone(), shared.clone(), shared.clone(), shared.clone(), shared.clone());
    let console = WebviewWindowBuilder::new(&handle, "console", WebviewUrl::External(url))
        .title("repo-harness")
        .inner_size(900.0, 640.0)
        .devtools(shared.devtools)
        .on_navigation(move |url| {
            let decision = nav::navigation(WindowKind::Console { port }, url);
            nav_s.audit(&format!("navigation window=console url={url} decision={decision:?}"));
            decision == Decision::Stay
        })
        .on_new_window(move |url, _| {
            let decision = nav::new_window(WindowKind::Console { port }, &url);
            popup_s.audit(&format!("new-window window=console url={url} decision={decision:?}"));
            if decision == Decision::OpenExternal {
                // DP0 records the hand-off. It never opens a browser.
                popup_s.audit(&format!("would-open-external url={url}"));
            }
            NewWindowResponse::Deny
        })
        .on_download(move |_, event| {
            if let DownloadEvent::Requested { url, .. } = event {
                dl_s.audit(&format!("download-denied window=console url={url}"));
            }
            false
        })
        .on_permission_request(move |_, kind| {
            perm_s.audit(&format!("permission-denied scope=console kind={kind:?}"));
            PermissionResponse::Deny
        })
        .on_page_load(move |_, payload| {
            let phase = match payload.event() {
                PageLoadEvent::Started => "started",
                PageLoadEvent::Finished => "finished",
            };
            load_s.audit(&format!("page-load window=console phase={phase} url={}", payload.url()));
        })
        .build();
    let console = match console {
        Ok(console) => console,
        Err(error) => {
            shared.audit(&format!("console-build-failed {error}"));
            return;
        }
    };
    if shared.devtools {
        console.open_devtools();
        shared.audit("devtools-opened");
    }
    if let Some(status) = handle.get_webview_window("status") {
        let _ = status.hide();
    }
    // Watch the owned child. An exit while the app runs closes the console at
    // once, so its refresh cannot reach a later holder of the port.
    loop {
        if shared.exiting.load(Ordering::SeqCst) {
            return;
        }
        if let Some(status) = owned.try_exit() {
            if shared.exiting.load(Ordering::SeqCst) {
                return;
            }
            shared.audit(&format!("child-exited pid={} status={status:?}", owned.pid));
            let _ = console.destroy();
            shared.audit("console-closed");
            *shared.report.lock().unwrap() = serde_json::json!({ "state": "failed", "error": "child_exited" });
            if let Some(window) = handle.get_webview_window("status") {
                let _ = window.show();
                let _ = window.eval("window.dp0ShowFailure('child_exited')");
            }
            shared.audit(&format!("spawned-total={}", shared.supervisor.spawned().len()));
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
}
