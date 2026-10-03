use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    busy: AtomicBool,
    installing: AtomicBool,
    pending: Mutex<Option<Pending>>,
}
struct Pending {
    update: Update,
    bytes: Vec<u8>,
    waiting: HashSet<String>,
}

pub fn cancel(app: &tauri::AppHandle) {
    if app.state::<UpdateState>().installing.load(Ordering::SeqCst) {
        return;
    }
    app.state::<UpdateState>().pending.lock().unwrap().take();
    app.state::<UpdateState>()
        .busy
        .store(false, Ordering::SeqCst);
    for window in app.webview_windows().values() {
        let _ = window.eval("window.paradiseUpdateLock?.(false)");
    }
}

pub fn window_change(app: &tauri::AppHandle) -> bool {
    let state = app.state::<UpdateState>();
    if state.installing.load(Ordering::SeqCst) {
        return false;
    }
    let pending = state.pending.lock().unwrap().is_some();
    if pending {
        cancel(app);
    }
    true
}

pub fn installing(app: &tauri::AppHandle) -> bool {
    app.state::<UpdateState>().installing.load(Ordering::SeqCst)
}

pub fn check(app: &tauri::AppHandle) {
    if app.state::<UpdateState>().busy.swap(true, Ordering::SeqCst) {
        super::failure(app, "An update check or download is already in progress.");
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = download(&app).await;
        match result {
            Ok(Some((update, bytes))) => {
                let windows = app.webview_windows();
                let waiting = windows.keys().cloned().collect();
                *app.state::<UpdateState>().pending.lock().unwrap() = Some(Pending {
                    update,
                    bytes,
                    waiting,
                });
                for window in windows.values() {
                    if window.eval("window.paradiseWorkbench.prepareUpdate().then(ok=>{if(ok)window.paradiseUpdateLock(true);window.paradiseNative(ok?'update-approved':'update-cancelled')}).catch(()=>window.paradiseNative('update-cancelled'))").is_err() { cancel(&app); break; }
                }
            }
            Ok(None) => cancel(&app),
            Err(error) => {
                cancel(&app);
                super::failure(&app,format!("Update failed: {error}\nYour installed version is unchanged. Retry from Paradise Code → Check for Updates."));
            }
        }
    });
}
async fn download(
    app: &tauri::AppHandle,
) -> Result<Option<(Update, Vec<u8>)>, Box<dyn std::error::Error + Send + Sync>> {
    let Some(mut update) = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()?
        .check()
        .await?
    else {
        super::failure(app, "You’re up to date.");
        return Ok(None);
    };
    // The feed cannot turn the updater into an arbitrary network downloader.
    if update.download_url.scheme() != "https"
        || update.download_url.host_str() != Some("github.com")
        || !update
            .download_url
            .path()
            .starts_with("/alimortazavi-pr/paradise-code/releases/download/")
    {
        return Err("The update URL is outside the Paradise Code release repository".into());
    }
    let proceed = app.dialog().message(format!("Paradise Code {} is available. Download the signed update? You can keep working during the download.", update.version))
        .title("Update available").buttons(MessageDialogButtons::OkCancelCustom("Download".into(), "Later".into())).blocking_show();
    if !proceed {
        return Ok(None);
    }
    update.timeout = Some(Duration::from_secs(1800));
    let progress_app = app.clone();
    for window in app.webview_windows().values() {
        let _ = window.eval("window.paradiseUpdateStatus?.('Downloading signed update…')");
    }
    let mut received = 0usize;
    let mut last_percent = 0u64;
    let bytes = update
        .download(
            move |chunk, total| {
                received += chunk;
                if let Some(total) = total.filter(|t| *t > 0) {
                    let percent = ((received as u64 * 100) / total).min(100);
                    if percent >= last_percent + 5 {
                        last_percent = percent;
                        for window in progress_app.webview_windows().values() {
                            let _ = window.eval(format!("window.paradiseUpdateStatus?.('Downloading signed update: {percent}%')"));
                        }
                    }
                }
            },
            || {},
        )
        .await?;
    for window in app.webview_windows().values() {
        let _ = window.eval("window.paradiseUpdateStatus?.(null)");
    }
    let install = app.dialog().message("Update signature verified. Save your work and restart to install? Active terminals will be stopped after you confirm in each window.")
        .title("Ready to update").buttons(MessageDialogButtons::OkCancelCustom("Save and Restart".into(), "Later".into())).blocking_show();
    Ok(install.then_some((update, bytes)))
}

pub fn approved(app: &tauri::AppHandle, label: &str) {
    let state = app.state::<UpdateState>();
    let pending = {
        let mut lock = state.pending.lock().unwrap();
        let Some(pending) = lock.as_mut() else {
            if !state.installing.load(Ordering::SeqCst) {
                if let Some(window) = app.get_webview_window(label) {
                    let _ = window.eval("window.paradiseUpdateLock?.(false)");
                }
            }
            return;
        };
        pending.waiting.remove(label);
        if !pending.waiting.is_empty() {
            return;
        }
        lock.take().unwrap()
    };
    // Keep windows and backend alive until installation succeeds. A cancelled/failed update
    // must leave the working session usable.
    super::save_session(app);
    state.installing.store(true, Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || match pending.update.install(&pending.bytes) {
        Ok(()) => {
            if let Some(mut child) = app.state::<super::Runtime>().child.lock().unwrap().take() {
                super::stop_group(&mut child);
            }
            app.restart();
        }
        Err(error) => {
            app.state::<UpdateState>()
                .installing
                .store(false, Ordering::SeqCst);
            cancel(&app);
            super::failure(&app,format!("Could not install the update: {error}. Keep the app in a writable folder and try again."));
        }
    });
}
