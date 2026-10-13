//! Stand-in for the shell process in T-LIFE-3 and T-LIFE-4. It starts the
//! child with the real supervisor, optionally starts an unrelated process
//! afterwards (like the probe or `open`), then waits to be killed.

use std::path::PathBuf;
use std::process::{Command, Stdio};

use dp0::env::child_env;
use dp0::supervisor::{start, LaunchSpec};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (cli, cwd, out) = (PathBuf::from(&args[1]), PathBuf::from(&args[2]), PathBuf::from(&args[3]));
    let linger = args.get(4).map(String::as_str) == Some("--linger");
    let spec = LaunchSpec::new(cli, cwd, dp0::DESKTOP_PORT, child_env("/usr/bin:/bin", None, |k| std::env::var(k).ok()), out.join("logs"));
    let owned = start(&spec).expect("start");
    let mut lines = vec![format!("serve {}", owned.pid)];
    if linger {
        let sleeper = Command::new("/bin/sleep").arg("300").stdin(Stdio::null()).spawn().expect("sleep");
        lines.push(format!("linger {}", sleeper.id()));
        let _ = Command::new("/bin/sh").args(["-c", "true"]).status();
    }
    std::fs::write(out.join("shell-ready"), lines.join("\n")).unwrap();
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}
