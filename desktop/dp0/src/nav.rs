//! Navigation and new-window decisions (plan section 4.7, S4).
//!
//! Top-level navigation never opens anything outside the window: the
//! navigation callback carries no user-gesture signal. A GitHub link reaches
//! the system browser only through a new-window request, which WKWebView
//! raises for `target="_blank"` and `window.open` only when it allows the
//! popup. T-NAV-5 measures whether a script without a gesture gets that far.

use url::{Host, Url};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowKind {
    /// Loads only the serve URL of this app's own child.
    Console { port: u16 },
    /// Loads only the app's bundled pages.
    Status,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Stay,
    OpenExternal,
    Deny,
}

fn no_userinfo(url: &Url) -> bool {
    url.username().is_empty() && url.password().is_none()
}

fn is_owned_console_origin(url: &Url, port: u16) -> bool {
    url.scheme() == "http"
        && url.host() == Some(Host::Ipv4(std::net::Ipv4Addr::LOCALHOST))
        && url.port() == Some(port)
        && no_userinfo(url)
}

fn is_bundled_page(url: &Url) -> bool {
    url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none() && no_userinfo(url)
}

fn is_github_https(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host() == Some(Host::Domain("github.com"))
        && url.port().is_none()
        && no_userinfo(url)
}

/// Decision for a top-level navigation, including each redirect hop.
pub fn navigation(kind: WindowKind, url: &Url) -> Decision {
    let stay = match kind {
        WindowKind::Console { port } => is_owned_console_origin(url, port),
        WindowKind::Status => is_bundled_page(url),
    };
    if stay { Decision::Stay } else { Decision::Deny }
}

/// Decision for a new-window request. The shell never creates a window.
pub fn new_window(kind: WindowKind, url: &Url) -> Decision {
    match kind {
        WindowKind::Console { .. } if is_github_https(url) => Decision::OpenExternal,
        _ => Decision::Deny,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONSOLE: WindowKind = WindowKind::Console { port: 4319 };

    fn nav(kind: WindowKind, raw: &str) -> Decision {
        navigation(kind, &Url::parse(raw).expect(raw))
    }

    fn popup(kind: WindowKind, raw: &str) -> Decision {
        new_window(kind, &Url::parse(raw).expect(raw))
    }

    // T-NAV-1
    #[test]
    fn console_navigation_table() {
        let stay = ["http://127.0.0.1:4319/", "http://127.0.0.1:4319/#/board", "http://127.0.0.1:4319/api/v1/setup?x=1"];
        for raw in stay {
            assert_eq!(nav(CONSOLE, raw), Decision::Stay, "{raw}");
        }
        let deny = [
            "http://localhost:4319/",
            "http://[::1]:4319/",
            "http://127.0.0.1:4318/",
            "http://127.0.0.1/",
            "https://127.0.0.1:4319/",
            "http://user@127.0.0.1:4319/",
            "http://user:pw@127.0.0.1:4319/",
            "file:///etc/passwd",
            "data:text/html,hi",
            "blob:http://127.0.0.1:4319/0b1c",
            "javascript:alert(1)",
            "about:blank",
            "tauri://localhost/status.html",
            "repo-harness://retry",
            "https://github.com/o/r/pull/1",
            "https://example.com/",
        ];
        for raw in deny {
            assert_eq!(nav(CONSOLE, raw), Decision::Deny, "{raw}");
        }
    }

    // T-NAV-1
    #[test]
    fn console_new_window_table() {
        assert_eq!(popup(CONSOLE, "https://github.com/o/r/pull/1"), Decision::OpenExternal);
        assert_eq!(popup(CONSOLE, "https://github.com:443/o/r/pull/1"), Decision::OpenExternal);
        let deny = [
            "http://github.com/o/r/pull/1",
            "https://github.com.evil.example/o/r",
            "https://evil.example/github.com",
            "https://user@github.com/o/r",
            "https://github.com:8443/o/r",
            "https://api.github.com/repos/o/r",
            "http://127.0.0.1:4319/",
            "file:///tmp/x",
            "javascript:alert(1)",
            "about:blank",
        ];
        for raw in deny {
            assert_eq!(popup(CONSOLE, raw), Decision::Deny, "{raw}");
        }
    }

    // T-NAV-1, T-NAV-8
    #[test]
    fn status_window_stays_on_bundled_pages() {
        assert_eq!(nav(WindowKind::Status, "tauri://localhost/status.html"), Decision::Stay);
        for raw in ["http://127.0.0.1:4319/", "https://github.com/o/r", "tauri://evil/status.html", "file:///tmp/x"] {
            assert_eq!(nav(WindowKind::Status, raw), Decision::Deny, "{raw}");
        }
        assert_eq!(popup(WindowKind::Status, "https://github.com/o/r/pull/1"), Decision::Deny);
    }

    // T-NAV-1: the standard parser normalizes IPv4 shorthand, so the
    // comparison is on the parsed host, not on the text.
    #[test]
    fn ipv4_shorthand_resolves_to_the_same_address() {
        assert_eq!(nav(CONSOLE, "http://127.1:4319/"), Decision::Stay);
        assert_eq!(nav(CONSOLE, "http://0x7f.0.0.1:4319/"), Decision::Stay);
    }
}
