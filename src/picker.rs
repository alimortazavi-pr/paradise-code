use serde::Deserialize;
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    id: String,
    #[serde(default)]
    save: bool,
    #[serde(default)]
    folders: bool,
    #[serde(default)]
    multiple: bool,
    title: Option<String>,
    default_path: Option<String>,
    #[serde(default)]
    filters: Vec<Filter>,
}
#[derive(Deserialize)]
struct Filter {
    name: String,
    extensions: Vec<String>,
}

pub fn show(window: WebviewWindow, payload: &str) {
    if payload.len() > 8192 {
        return;
    }
    let Ok(request) = serde_json::from_str::<Request>(payload) else {
        return;
    };
    if request.id.is_empty()
        || request.id.len() > 20
        || !request.id.bytes().all(|b| b.is_ascii_digit())
    {
        return;
    }
    std::thread::spawn(move || {
        let mut dialog = window.dialog().file().set_parent(&window);
        if let Some(title) = request.title {
            dialog = dialog.set_title(title);
        }
        if let Some(default) = request.default_path {
            let path = std::path::Path::new(&default);
            if path.is_absolute() {
                if path.is_dir() {
                    dialog = dialog.set_directory(path);
                } else if let Some(parent) = path.parent().filter(|p| p.is_dir()) {
                    dialog = dialog.set_directory(parent);
                    if request.save {
                        if let Some(name) = path.file_name() {
                            dialog = dialog.set_file_name(name.to_string_lossy());
                        }
                    }
                }
            }
        }
        // An editor's "All Files" option must allow dotfiles and new extensions too.
        // macOS combines filters into one allowlist, so omitting '*' alone narrows it.
        let all_files = request
            .filters
            .iter()
            .any(|filter| filter.extensions.iter().any(|extension| extension == "*"));
        for filter in request
            .filters
            .into_iter()
            .take(if all_files { 0 } else { 20 })
        {
            let extensions: Vec<&str> = filter
                .extensions
                .iter()
                .map(String::as_str)
                .filter(|v| {
                    !v.is_empty()
                        && v.len() < 32
                        && v.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                })
                .collect();
            if !extensions.is_empty() {
                dialog = dialog.add_filter(filter.name, &extensions);
            }
        }
        let files = if request.save {
            dialog.blocking_save_file().map(|f| vec![f])
        } else if request.folders && request.multiple {
            dialog.blocking_pick_folders()
        } else if request.folders {
            dialog.blocking_pick_folder().map(|f| vec![f])
        } else if request.multiple {
            dialog.blocking_pick_files()
        } else {
            dialog.blocking_pick_file().map(|f| vec![f])
        };
        let paths = files.map(|files| {
            files
                .into_iter()
                .filter_map(|f| f.into_path().ok())
                .collect::<Vec<_>>()
        });
        let _ = window.eval(format!(
            "window.paradiseResolve({}, {})",
            serde_json::to_string(&request.id).unwrap(),
            serde_json::to_string(&paths).unwrap()
        ));
    });
}
