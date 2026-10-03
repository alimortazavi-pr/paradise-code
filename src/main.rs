#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    os::unix::{
        fs::{symlink, OpenOptionsExt},
        io::AsRawFd,
        process::CommandExt,
    },
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    webview::NewWindowResponse,
    Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const VOLUME: &str = "/Volumes/ParadiseCodeBuild";
#[derive(Default, Serialize, Deserialize)]
struct Session {
    port: u16,
    urls: Vec<String>,
}
struct Runtime {
    child: Mutex<Option<Child>>,
    quitting: AtomicBool,
    profile: PathBuf,
    origin: String,
    webview_origin: String,
    token: String,
    approved: Mutex<HashSet<String>>,
    sequence: AtomicUsize,
    _lock: File,
}
impl Drop for Runtime {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            if let Some(mut child) = child.take() {
                stop_group(&mut child);
            }
        }
        let _ = fs::remove_file(self.profile.join("connection-token"));
    }
}
fn stop_group(child: &mut Child) {
    // PTYs create their own sessions, so killing only the launcher group misses them.
    let mut descendants = vec![child.id() as i32];
    if let Ok(output) = Command::new("/bin/ps")
        .args(["-axo", "pid=,ppid="])
        .output()
    {
        let pairs: Vec<(i32, i32)> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| {
                let mut values = line.split_whitespace();
                Some((values.next()?.parse().ok()?, values.next()?.parse().ok()?))
            })
            .collect();
        loop {
            let before = descendants.len();
            for &(pid, parent) in &pairs {
                if descendants.contains(&parent) && !descendants.contains(&pid) {
                    descendants.push(pid);
                }
            }
            if before == descendants.len() {
                break;
            }
        }
    }
    for pid in descendants.iter().rev() {
        unsafe {
            libc::kill(*pid, libc::SIGTERM);
        }
    }
    let group = -(child.id() as i32);
    unsafe {
        libc::kill(group, libc::SIGTERM);
    }
    thread::sleep(Duration::from_millis(200));
    unsafe {
        libc::kill(group, libc::SIGKILL);
    }
    let _ = child.wait();
}
fn failure(app: &tauri::AppHandle, message: impl Into<String>) {
    app.dialog()
        .message(message.into())
        .title("Paradise Code")
        .show(|_| {});
}
fn write_private(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(data)
}
fn start_backend(resource: &Path) -> Result<Runtime, Box<dyn std::error::Error>> {
    if !Path::new(VOLUME).join(".paradise-volume").is_file() {
        return Err("The Paradise SSD build volume is not mounted. Attach ParadiseCodeBuild.sparsebundle and retry.".into());
    }
    let profile = std::env::var_os("PARADISE_PROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(VOLUME).join("profiles/default"));
    if !profile.starts_with(VOLUME) {
        return Err("The profile must be on the Paradise external volume.".into());
    }
    fs::create_dir_all(&profile)?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .open(profile.join("app.lock"))?;
    if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err("Paradise Code is already using this profile.".into());
    }
    // WKWebView does not support Tauri's data_directory on macOS. Redirect only our own directories.
    if let Some(home) = std::env::var_os("HOME") {
        for parent in [
            "Library/WebKit",
            "Library/Caches",
            "Library/Application Support",
        ] {
            let link = PathBuf::from(&home).join(parent).join("dev.paradise.code");
            let target = profile.join(parent.replace('/', "-"));
            fs::create_dir_all(&target)?;
            fs::create_dir_all(link.parent().unwrap())?;
            match fs::symlink_metadata(&link) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    symlink(&target, &link)?
                }
                Ok(_) if fs::read_link(&link).ok().as_ref() == Some(&target) => (),
                _ => {
                    return Err(format!(
                        "Existing app storage at {} needs review; refusing to overwrite it.",
                        link.display()
                    )
                    .into())
                }
            }
        }
    }
    let session: Session = fs::read(profile.join("session.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    let listener = TcpListener::bind(("127.0.0.1", session.port))?;
    let port = listener.local_addr()?.port();
    let origin = format!("http://127.0.0.1:{port}");
    let token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();
    let token_file = profile.join("connection-token");
    write_private(&token_file, token.as_bytes())?;
    fs::create_dir_all(profile.join("server-data/data/User"))?;
    let settings = profile.join("server-data/data/User/settings.json");
    if !settings.exists() {
        write_private(&settings, br#"{"telemetry.telemetryLevel":"off","workbench.enableExperiments":false,"chat.disableAIFeatures":true,"workbench.startupEditor":"welcomePage","window.title":"${dirty}${activeEditorShort}${separator}${rootName}${separator}Paradise Code","terminal.integrated.defaultProfile.osx":"zsh"}"#)?;
    }
    let backend = std::env::var_os("PARADISE_BACKEND")
        .map(PathBuf::from)
        .unwrap_or_else(|| resource.join("resources/backend"));
    let launcher = resource.join("resources/backend-launcher.mjs");
    if !backend.join("node").is_file() || !backend.join("out/server-main.js").is_file() {
        return Err(format!(
            "The bundled Code - OSS backend is missing at {}.",
            backend.display()
        )
        .into());
    }
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .mode(0o600)
        .open(profile.join("backend.log"))?;
    drop(listener);
    let mut command = Command::new(backend.join("node"));
    command
        .arg(launcher)
        .arg(&backend)
        .arg(&profile)
        .arg(port.to_string())
        .arg(&token_file)
        .env("TMPDIR", Path::new(VOLUME).join("tmp"))
        .env(
            "PATH",
            format!(
                "{}/bin:{}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                backend.display(),
                backend.display()
            ),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log));
    for (name, directory) in [
        ("npm_config_cache", "npm"),
        ("npm_config_devdir", "node-gyp"),
        ("CARGO_HOME", "cargo"),
        ("CARGO_TARGET_DIR", "workspace-target"),
        ("XDG_CACHE_HOME", "xdg"),
        ("CLANG_MODULE_CACHE_PATH", "clang"),
        ("ELECTRON_CACHE", "electron"),
        ("PLAYWRIGHT_BROWSERS_PATH", "playwright"),
    ] {
        let path = Path::new(VOLUME).join("cache").join(directory);
        fs::create_dir_all(&path)?;
        command.env(name, path);
    }
    command.process_group(0);
    let mut child = command.spawn()?;
    let started = Instant::now();
    loop {
        if child.try_wait()?.is_some() {
            return Err(format!(
                "The local backend exited. See {}.",
                profile.join("backend.log").display()
            )
            .into());
        }
        if let Ok(mut stream) = TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse()?,
            Duration::from_millis(200),
        ) {
            stream.set_read_timeout(Some(Duration::from_millis(500)))?;
            let request = format!(
                "GET /version HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            );
            let mut response = [0u8; 64];
            if stream.write_all(request.as_bytes()).is_ok()
                && stream.read(&mut response).is_ok()
                && String::from_utf8_lossy(&response).contains("200 OK")
            {
                break;
            }
        }
        if started.elapsed() > Duration::from_secs(45) {
            stop_group(&mut child);
            return Err(
                "The local backend did not become ready within 45 seconds. Check backend.log."
                    .into(),
            );
        }
        thread::sleep(Duration::from_millis(150));
    }
    write_private(
        &profile.join("session.json"),
        &serde_json::to_vec(&Session {
            port,
            urls: session.urls,
        })?,
    )?;
    let webview_origin = fs::read_to_string(profile.join("webview-origin"))?;
    Ok(Runtime {
        webview_origin,
        child: Mutex::new(Some(child)),
        quitting: AtomicBool::new(false),
        profile,
        origin,
        token,
        approved: Mutex::new(HashSet::new()),
        sequence: AtomicUsize::new(0),
        _lock: lock,
    })
}
fn save_session(app: &tauri::AppHandle) {
    let state = app.state::<Runtime>();
    let urls = app
        .webview_windows()
        .values()
        .filter_map(|w| w.url().ok())
        .filter(|u| u.origin().ascii_serialization() == state.origin)
        .map(|mut u| {
            let pairs = u
                .query_pairs()
                .filter(|(key, _)| key != "tkn")
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect::<Vec<_>>();
            u.set_query(None);
            u.query_pairs_mut().extend_pairs(pairs);
            u.to_string()
        })
        .collect();
    if let Ok(port) = url::Url::parse(&state.origin).map(|u| u.port().unwrap()) {
        let _ = write_private(
            &state.profile.join("session.json"),
            &serde_json::to_vec(&Session { port, urls }).unwrap_or_default(),
        );
    }
}
fn request_close(window: &WebviewWindow) {
    let _=window.eval("if(window.paradiseWorkbench){window.paradiseWorkbench.prepareClose().then(ok=>{window.paradiseNative(ok?'close-approved':'close-cancelled')}).catch(e=>console.error(e))}else{alert('The editor is still starting or unavailable. Your session is preserved; use Force Quit only if it cannot recover.')} ");
}
fn open_window(app: &tauri::AppHandle, destination: Option<url::Url>) -> tauri::Result<()> {
    let state = app.state::<Runtime>();
    let mut url = destination.unwrap_or_else(|| url::Url::parse(&state.origin).unwrap());
    if url.origin().ascii_serialization() != state.origin {
        return Ok(());
    }
    url.query_pairs_mut().append_pair("tkn", &state.token);
    let label = format!("editor-{}", state.sequence.fetch_add(1, Ordering::SeqCst));
    let nonce: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();
    let script = format!(
        r#"if(window===window.top && location.origin===ORIGIN){{const key={};Object.defineProperty(window,'paradiseNative',{{value:action=>{{location.href='paradise-native://'+action+'?key='+key}}}});window.close=()=>window.paradiseNative('request-close');}}"#,
        serde_json::to_string(&nonce).unwrap()
    );
    let script = script.replace("ORIGIN", &serde_json::to_string(&state.origin).unwrap());
    let webview_port = url::Url::parse(&state.webview_origin.replace("{{uuid}}", "asset"))
        .unwrap()
        .port();
    let origin = state.origin.clone();
    let app_nav = app.clone();
    let label_nav = label.clone();
    let app_page = app.clone();
    let app_new = app.clone();
    let origin_new = origin.clone();
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title("Paradise Code")
        .inner_size(1320., 860.)
        .min_inner_size(800., 520.)
        .initialization_script(script)
        .disable_drag_drop_handler()
        .on_page_load(move |_, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                save_session(&app_page);
            }
        })
        .on_navigation(move |url| {
            if url.scheme() == "paradise-native" {
                if url.query_pairs().any(|(k, v)| k == "key" && v == nonce) {
                    if let Some(window) = app_nav.get_webview_window(&label_nav) {
                        match url.host_str() {
                            Some("request-close") => request_close(&window),
                            Some("close-approved") => {
                                if !app_nav.state::<Runtime>().quitting.load(Ordering::SeqCst) {
                                    save_session(&app_nav);
                                }
                                app_nav
                                    .state::<Runtime>()
                                    .approved
                                    .lock()
                                    .unwrap()
                                    .insert(label_nav.clone());
                                let _ = window.close();
                            }
                            Some("close-cancelled") => {
                                app_nav
                                    .state::<Runtime>()
                                    .quitting
                                    .store(false, Ordering::SeqCst);
                            }
                            _ => (),
                        }
                    }
                }
                return false;
            }
            url.origin().ascii_serialization() == origin
                || (url.scheme() == "http"
                    && url.port() == webview_port
                    && url
                        .host_str()
                        .is_some_and(|host| host.ends_with(".localhost")))
                || url.as_str() == "about:blank"
                || url.as_str() == "about:srcdoc"
        })
        .on_new_window(move |url, _| {
            if url.origin().ascii_serialization() == origin_new {
                let app = app_new.clone();
                let app2 = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let _ = open_window(&app2, Some(url));
                });
            } else if ["https", "http"].contains(&url.scheme()) {
                let _ = app_new.opener().open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .build()?;
    let close_window = window.clone();
    let app_close = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if !app_close
                .state::<Runtime>()
                .approved
                .lock()
                .unwrap()
                .remove(close_window.label())
            {
                api.prevent_close();
                request_close(&close_window);
            }
        }
    });
    Ok(())
}
fn focused(app: &tauri::AppHandle) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| app.webview_windows().into_values().next())
}
fn execute(app: &tauri::AppHandle, command: &str) {
    if let Some(window) = focused(app) {
        let _ = window.eval(format!(
            "window.paradiseWorkbench?.executeCommand({})",
            serde_json::to_string(command).unwrap()
        ));
    }
}
fn menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let item = |id, text, key: Option<&str>| MenuItem::with_id(app, id, text, true, key);
    let main = Submenu::with_items(
        app,
        "Paradise Code",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("settings", "Settings…", Some("Cmd+,"))?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "Quit Paradise Code", Some("Cmd+Q"))?,
        ],
    )?;
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("new", "New Window", Some("Cmd+Shift+N"))?,
            &item("open-file", "Open File…", Some("Cmd+O"))?,
            &item("open-folder", "Open Folder…", Some("Cmd+Alt+O"))?,
            &item("save", "Save", Some("Cmd+S"))?,
            &item("save-all", "Save All", Some("Cmd+Alt+S"))?,
            &item("close", "Close Window", Some("Cmd+Shift+W"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item("palette", "Command Palette…", Some("Cmd+Shift+P"))?,
            &item("terminal", "Terminal", Some("Ctrl+`"))?,
            &item("reload", "Reload Window", None)?,
        ],
    )?;
    #[cfg(debug_assertions)]
    view.append(&item("devtools", "Web Inspector", None)?)?;
    Menu::with_items(app, &[&main, &file, &edit, &view])
}
fn destination_url(origin: &str, path: &Path) -> url::Url {
    let mut url = url::Url::parse(origin).expect("validated backend origin");
    if path.is_dir() {
        url.query_pairs_mut()
            .append_pair("folder", &path.to_string_lossy());
    } else if path.extension().is_some_and(|ext| ext == "code-workspace") {
        url.query_pairs_mut()
            .append_pair("workspace", &path.to_string_lossy());
    } else {
        let authority = url::Url::parse(origin).unwrap().authority().to_string();
        let mut file = url::Url::parse(&format!("vscode-remote://{authority}/")).unwrap();
        file.set_path(&path.to_string_lossy());
        url.query_pairs_mut().append_pair(
            "payload",
            &serde_json::to_string(&vec![("openFile", file.as_str())]).unwrap(),
        );
    }
    url
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let resource = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            } else {
                app.path().resource_dir()?
            };
            match start_backend(&resource) {
                Ok(runtime) => app.manage(runtime),
                Err(error) => {
                    let message = serde_json::to_string(&error.to_string())?;
                    WebviewWindowBuilder::new(app, "startup-error", WebviewUrl::App("index.html".into()))
                        .title("Paradise Code — Unable to Start")
                        .inner_size(680., 360.)
                        .initialization_script(format!("document.addEventListener('DOMContentLoaded',()=>{{document.querySelector('p').textContent={message}}})"))
                        .build()?;
                    return Ok(());
                }
            };
            app.set_menu(menu(app.handle())?)?;
            let state = app.state::<Runtime>();
            let session: Session = fs::read(state.profile.join("session.json"))
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default();
            let urls = session
                .urls
                .into_iter()
                .filter_map(|s| url::Url::parse(&s).ok())
                .filter(|u| u.origin().ascii_serialization() == state.origin)
                .collect::<Vec<_>>();
            if urls.is_empty() {
                open_window(app.handle(), None)?;
            } else {
                for url in urls {
                    open_window(app.handle(), Some(url))?;
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "new" => {
                let _ = open_window(app, None);
            }
            "quit" => {
                app.state::<Runtime>()
                    .quitting
                    .store(true, Ordering::SeqCst);
                save_session(app);
                for window in app.webview_windows().values() {
                    request_close(window);
                }
            }
            "close" => {
                if let Some(w) = focused(app) {
                    request_close(&w)
                }
            }
            "open-file" | "open-folder" => {
                let folder = event.id().as_ref() == "open-folder";
                let app = app.clone();
                thread::spawn(move || {
                    let picker = app.dialog().file();
                    let selected = if folder {
                        picker.blocking_pick_folder()
                    } else {
                        picker.blocking_pick_file()
                    };
                    if let Some(selected) = selected {
                        if let Ok(path) = selected.into_path() {
                            let state = app.state::<Runtime>();
                            let url = destination_url(&state.origin, &path);
                            let app2 = app.clone();
                            let _ = app.run_on_main_thread(move || {
                                if let Err(e) = open_window(&app2, Some(url)) {
                                    failure(&app2, e.to_string());
                                }
                            });
                        }
                    }
                });
            }
            "settings" => execute(app, "workbench.action.openSettings"),
            "save" => execute(app, "workbench.action.files.save"),
            "save-all" => execute(app, "workbench.action.files.saveAll"),
            "palette" => execute(app, "workbench.action.showCommands"),
            "terminal" => execute(app, "workbench.action.terminal.toggleTerminal"),
            "reload" => execute(app, "workbench.action.reloadWindow"),
            #[cfg(debug_assertions)]
            "devtools" => {
                if let Some(w) = focused(app) {
                    w.open_devtools();
                }
            }
            _ => (),
        })
        .build(tauri::generate_context!())
        .expect("Unable to initialize Paradise Code");
    app.run(|handle, event| match event {
        tauri::RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none()
                && handle.try_state::<Runtime>().is_some()
                && !handle.webview_windows().is_empty()
            {
                api.prevent_exit();
                handle
                    .state::<Runtime>()
                    .quitting
                    .store(true, Ordering::SeqCst);
                save_session(handle);
                for window in handle.webview_windows().values() {
                    request_close(window);
                }
            }
        }
        tauri::RunEvent::Exit => {
            if let Some(state) = handle.try_state::<Runtime>() {
                if let Ok(mut child) = state.child.lock() {
                    if let Some(mut child) = child.take() {
                        stop_group(&mut child);
                    }
                }
            }
        }
        tauri::RunEvent::Opened { urls } => {
            if handle.try_state::<Runtime>().is_none() {
                return;
            }
            for file in urls {
                if let Ok(path) = file.to_file_path() {
                    let state = handle.state::<Runtime>();
                    let url = destination_url(&state.origin, &path);
                    let _ = open_window(handle, Some(url));
                }
            }
        }
        _ => (),
    });
}
