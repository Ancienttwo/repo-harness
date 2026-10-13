//! Static audit of the compiled bridge (T-BRG-1..3) and of the HTTP client
//! surface (T-OWN-5). Run after `cargo build`, which generates `gen/schemas`.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use dp0::commands::APP_COMMANDS;

fn crate_file(rel: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel);
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn allow_permissions() -> BTreeSet<String> {
    APP_COMMANDS.iter().map(|c| format!("allow-{}", c.replace('_', "-"))).collect()
}

fn lock_packages() -> Vec<String> {
    crate_file("Cargo.lock")
        .lines()
        .filter_map(|l| l.strip_prefix("name = \"").and_then(|r| r.strip_suffix('"')).map(str::to_string))
        .collect()
}

// T-BRG-1: the compiled capability set is exactly one local-only capability
// for the status window with the five app permissions.
#[test]
fn t_brg_1_compiled_capabilities() {
    let compiled: serde_json::Value = serde_json::from_str(&crate_file("gen/schemas/capabilities.json")).unwrap();
    let map = compiled.as_object().expect("capabilities map");
    assert_eq!(map.keys().collect::<Vec<_>>(), ["status-window"]);
    let cap = &map["status-window"];
    assert_eq!(cap["windows"], serde_json::json!(["status"]));
    assert!(cap.get("remote").is_none_or(|r| r.is_null()), "no remote origin: {cap}");
    assert!(cap.get("webviews").is_none_or(|w| w.as_array().is_some_and(|a| a.is_empty())), "{cap}");
    let perms: BTreeSet<String> =
        cap["permissions"].as_array().unwrap().iter().map(|p| p.as_str().expect("plain permission").to_string()).collect();
    assert_eq!(perms, allow_permissions());
    eprintln!("compiled capabilities: {}", serde_json::to_string(&compiled).unwrap());
}

// T-BRG-2: no Tauri plugin at all (the plan allows single-instance only, and
// DP0 does not need it).
#[test]
fn t_brg_2_no_plugins() {
    let plugins: Vec<String> = lock_packages().into_iter().filter(|n| n.starts_with("tauri-plugin")).collect();
    assert!(plugins.is_empty(), "{plugins:?}");
    let conf: serde_json::Value = serde_json::from_str(&crate_file("tauri.conf.json")).unwrap();
    assert_eq!(conf["app"]["withGlobalTauri"], serde_json::json!(false));
    assert_eq!(conf["identifier"], serde_json::json!("com.repoharness.app"));
    assert!(conf.get("plugins").is_none());
}

// T-BRG-3: invoke_handler == app manifest == capability grants.
#[test]
fn t_brg_3_command_sets_do_not_drift() {
    let main = crate_file("src/main.rs");
    let start = main.find("generate_handler![").expect("generate_handler") + "generate_handler![".len();
    let end = start + main[start..].find(']').unwrap();
    let registered: BTreeSet<String> = main[start..end].split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    let declared: BTreeSet<String> = APP_COMMANDS.iter().map(|s| s.to_string()).collect();
    assert_eq!(registered, declared);
    let build = crate_file("build.rs");
    assert!(build.contains("include!(\"src/commands.rs\")") && build.contains(".commands(&APP_COMMANDS)"));
    let capability: serde_json::Value = serde_json::from_str(&crate_file("capabilities/status-window.json")).unwrap();
    let granted: BTreeSet<String> =
        capability["permissions"].as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_string()).collect();
    assert_eq!(granted, allow_permissions());
}

/// Package names in the dependency graph that macOS arm64 actually resolves.
/// `Cargo.lock` lists every platform's packages, so it is not the evidence.
fn macos_arm64_packages() -> BTreeSet<String> {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let output = std::process::Command::new(cargo)
        .args(["metadata", "--format-version", "1", "--locked", "--filter-platform", "aarch64-apple-darwin"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("cargo metadata");
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let meta: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    let names: std::collections::HashMap<&str, &str> = meta["packages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (p["id"].as_str().unwrap(), p["name"].as_str().unwrap()))
        .collect();
    meta["resolve"]["nodes"].as_array().unwrap().iter().map(|n| names[n["id"].as_str().unwrap()].to_string()).collect()
}

// T-OWN-5: the shell has no HTTP client in the graph that macOS arm64 builds.
#[test]
fn t_own_5_no_http_client() {
    let clients = ["reqwest", "ureq", "hyper", "hyper-util", "isahc", "attohttpc", "curl", "surf", "minreq", "ehttp"];
    let resolved = macos_arm64_packages();
    assert!(resolved.contains("tauri") && resolved.contains("wry"), "the graph is the real one");
    let found: Vec<&str> = clients.iter().copied().filter(|c| resolved.contains(*c)).collect();
    assert!(found.is_empty(), "{found:?}");
    let in_lock: Vec<String> = lock_packages().into_iter().filter(|n| clients.contains(&n.as_str())).collect();
    eprintln!("in Cargo.lock for other platforms only: {in_lock:?}; resolved for aarch64-apple-darwin: none");
}
