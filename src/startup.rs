use rand::{distributions::Alphanumeric, Rng};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

pub fn show(app: &tauri::AppHandle, message: &str) -> tauri::Result<()> {
    let nonce: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();
    let script = format!("document.addEventListener('DOMContentLoaded',()=>{{document.querySelector('#message').textContent={};for(const a of document.querySelectorAll('[data-action]'))a.href='paradise-recovery://'+a.dataset.action+'?key='+{};}})", serde_json::to_string(message).unwrap(), serde_json::to_string(&nonce).unwrap());
    let handle = app.clone();
    let busy = Arc::new(AtomicBool::new(false));
    WebviewWindowBuilder::new(app, "startup-error", WebviewUrl::App("index.html".into()))
        .title("Paradise Code — Reconnect your workspace")
        .inner_size(720., 510.)
        .min_inner_size(600., 450.)
        .initialization_script(script)
        .on_navigation(move |url| {
            if url.scheme() != "paradise-recovery" {
                return matches!(url.scheme(), "tauri" | "http") && matches!(url.host_str(), Some("localhost" | "tauri.localhost"));
            }
            if !url.query_pairs().any(|(k,v)| k == "key" && v == nonce) { return false; }
            let action = url.host_str().unwrap_or("").to_owned();
            if !matches!(action.as_str(), "retry" | "quit" | "folder" | "default") || busy.swap(true, Ordering::SeqCst) { return false; }
            let app = handle.clone(); let busy = busy.clone();
            std::thread::spawn(move || {
                if action == "quit" { app.exit(0); return; }
                if action == "retry" { app.restart(); }
                let Some(window) = app.get_webview_window("startup-error") else { return; };
                if std::env::var_os("PARADISE_PROFILE").is_some() {
                    super::failure(&app, "A custom PARADISE_PROFILE override is active. Reconnect that folder or remove the override before choosing another storage location.");
                    busy.store(false, Ordering::SeqCst); return;
                }
                let result = (|| -> Result<bool, Box<dyn std::error::Error>> {
                    let home = PathBuf::from(std::env::var_os("HOME").ok_or("Home directory is unavailable")?);
                    let profile = if action == "default" {
                        let confirm = app.dialog().message("Use a separate profile in this Mac’s Application Support folder? Your previous files, settings and unsaved work stay in the old storage folder. They will not be moved or deleted.")
                            .title("Use local storage?").parent(&window)
                            .buttons(MessageDialogButtons::OkCancelCustom("Use Local Storage".into(), "Cancel".into())).blocking_show();
                        if !confirm { return Ok(false); }
                        let path = super::storage::default_profile(&home);
                        std::fs::create_dir_all(&path)?; path
                    } else {
                        let Some(path) = app.dialog().file().set_parent(&window).set_title("Choose your Paradise Code data folder").blocking_pick_folder() else { return Ok(false); };
                        path.into_path().map_err(|_| "Choose a local folder.")?
                    };
                    super::storage::select_profile(&home, &profile)?;
                    Ok(true)
                })();
                match result {
                    Ok(true) => app.restart(),
                    Ok(false) => (),
                    Err(error) => super::failure(&app, error.to_string()),
                }
                busy.store(false, Ordering::SeqCst);
            });
            false
        }).build()?;
    Ok(())
}
