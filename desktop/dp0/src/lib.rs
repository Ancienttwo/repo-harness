//! DP0 proof for the repo-harness desktop shell.
//!
//! This crate is a prototype. It exists to prove the bridge and lifecycle
//! boundaries in `plans/plan-20261013-desktop-app.md` (sections 4 and 5)
//! before any product shell is written. It is not the DP2 shell.

pub mod commands;
pub mod env;
pub mod nav;
pub mod probe;
pub mod supervisor;

/// Bundle ID locked in plan section 11, item 11.
pub const BUNDLE_ID: &str = "com.repoharness.app";
/// Desktop service port locked in plan section 11, item 7.
pub const DESKTOP_PORT: u16 = 4319;
