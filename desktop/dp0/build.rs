// The app manifest puts every app command under capability control
// (plan S3). The list must equal `src/commands.rs` (checked by T-BRG-3).
include!("src/commands.rs");

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&APP_COMMANDS)),
    )
    .expect("tauri build");
}
