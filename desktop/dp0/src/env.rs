//! Child environment allowlist (plan section 4.5, S7).

/// Keys taken from the app's own process environment.
pub const INHERITED_KEYS: [&str; 6] = ["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG"];

/// Build the exact child environment. `path` and `repo_harness_home` come from
/// the probe or the config file. Every other variable is dropped.
pub fn child_env(
    path: &str,
    repo_harness_home: Option<&str>,
    parent: impl Fn(&str) -> Option<String>,
) -> Vec<(String, String)> {
    let mut env = vec![("PATH".to_string(), path.to_string())];
    if let Some(home) = repo_harness_home {
        env.push(("REPO_HARNESS_HOME".to_string(), home.to_string()));
    }
    for key in INHERITED_KEYS {
        if let Some(value) = parent(key) {
            env.push((key.to_string(), value));
        }
    }
    env
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_everything_outside_the_allowlist() {
        let parent = |key: &str| match key {
            "HOME" => Some("/Users/example".to_string()),
            "GH_TOKEN" => Some("fake-token-value".to_string()),
            _ => None,
        };
        let env = child_env("/usr/bin:/bin", Some("/tmp/rh"), parent);
        let keys: Vec<&str> = env.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(keys, ["PATH", "REPO_HARNESS_HOME", "HOME"]);
    }
}
