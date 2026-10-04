//! Clipboard access is confined to the authenticated top-level workbench bridge.
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{Manager, WebviewWindow};

const MAX_TEXT: usize = 8 * 1024 * 1024;
const MAX_FILES: usize = 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    id: String,
    operation: Operation,
    #[serde(default)]
    text: String,
    #[serde(default)]
    paths: Vec<String>,
    #[serde(default)]
    move_files: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
    ReadText,
    WriteText,
    ReadResources,
    WriteResources,
}

fn validate(request: &Request) -> Result<(), &'static str> {
    if request.id.is_empty()
        || request.id.len() > 20
        || !request.id.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("Invalid clipboard request identifier");
    }
    if request.text.len() > MAX_TEXT || request.paths.len() > MAX_FILES {
        return Err("Clipboard content exceeds the supported size");
    }
    if request
        .paths
        .iter()
        .any(|path| path.len() > 32768 || path.contains('\0') || !Path::new(path).is_absolute())
    {
        return Err("Clipboard file paths must be absolute local paths");
    }
    Ok(())
}

fn reply<T: Serialize>(window: &WebviewWindow, id: &str, result: Result<T, &str>) {
    let (value, error) = match result {
        Ok(value) => (serde_json::to_value(value).unwrap_or_default(), None),
        Err(error) => (serde_json::Value::Null, Some(error)),
    };
    let _ = window.eval(format!(
        "window.paradiseResolve({}, {}, {})",
        serde_json::to_string(id).unwrap(),
        value,
        serde_json::to_string(&error).unwrap()
    ));
}

pub fn handle(window: &WebviewWindow, payload: &str) {
    if payload.len() > MAX_TEXT * 2 {
        return;
    }
    let Ok(request) = serde_json::from_str::<Request>(payload) else {
        return;
    };
    if let Err(error) = validate(&request) {
        reply::<()>(window, &request.id, Err(error));
        return;
    }
    #[cfg(target_os = "macos")]
    reply(
        window,
        &request.id,
        macos::operate(
            request.operation,
            &request.text,
            &request.paths,
            request.move_files,
        ),
    );
    #[cfg(not(target_os = "macos"))]
    reply::<()>(
        window,
        &request.id,
        Err("Native clipboard is unavailable on this platform"),
    );
}

#[cfg(target_os = "macos")]
pub fn menu(app: &tauri::AppHandle, action: &str) {
    let action = action.to_owned();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        use objc2::{rc::Retained, MainThreadMarker};
        use objc2_app_kit::NSApplication;
        let Some(marker) = MainThreadMarker::new() else {
            return;
        };
        let native_app = NSApplication::sharedApplication(marker);
        if let Some(native_window) = native_app.keyWindow().or_else(|| native_app.mainWindow()) {
            // A menu can temporarily clear Tauri's focus flag. AppKit's key/main
            // window remains authoritative; a native panel must keep its responder.
            for window in handle.webview_windows().into_values() {
                if window.ns_window().is_ok_and(|pointer| {
                    pointer.cast_const() == Retained::as_ptr(&native_window).cast()
                }) {
                    let _ = window.eval(format!(
                        "window.paradiseEdit?.({})",
                        serde_json::to_string(&action).unwrap()
                    ));
                    return;
                }
            }
        }
        edit(&action);
    });
}

#[cfg(target_os = "macos")]
pub fn edit(action: &str) {
    use objc2::{sel, MainThreadMarker};
    use objc2_app_kit::NSApplication;
    let Some(marker) = MainThreadMarker::new() else {
        return;
    };
    let selector = match action {
        "copy" => sel!(copy:),
        "cut" => sel!(cut:),
        "paste" => sel!(paste:),
        _ => return,
    };
    // AppKit routes to the focused WKWebView/input, preserving native text paste events.
    unsafe {
        NSApplication::sharedApplication(marker).sendAction_to_from(selector, None, None);
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{Operation, MAX_FILES, MAX_TEXT};
    use objc2::{rc::Retained, runtime::ProtocolObject};
    use objc2_app_kit::{
        NSPasteboard, NSPasteboardItem, NSPasteboardTypeFileURL, NSPasteboardTypeString,
        NSPasteboardWriting,
    };
    use objc2_foundation::{NSArray, NSString, NSURL};
    use serde_json::{json, Value};

    pub(super) fn local_path(value: &NSString) -> Option<String> {
        // Finder puts file-reference URLs (file:///.file/id=...) on the pasteboard.
        // Foundation resolves these to the actual path; URL string parsing cannot.
        NSURL::URLWithString(value)
            .filter(|url| url.isFileURL())
            .and_then(|url| url.filePathURL())
            .and_then(|url| url.path())
            .map(|path| path.to_string())
    }

    pub(super) fn operate(
        operation: Operation,
        text: &str,
        paths: &[String],
        move_files: bool,
    ) -> Result<Value, &'static str> {
        let pasteboard = NSPasteboard::generalPasteboard();
        // These AppKit constants have process lifetime and are immutable.
        let text_type = unsafe { NSPasteboardTypeString };
        let file_type = unsafe { NSPasteboardTypeFileURL };
        let operation_type = NSString::from_str("dev.paradise.code.file-operation");
        match operation {
            Operation::ReadText => {
                let text = pasteboard
                    .stringForType(text_type)
                    .map(|s| s.to_string())
                    .unwrap_or_default();
                if text.len() > MAX_TEXT {
                    return Err("Clipboard text exceeds the supported size");
                }
                Ok(json!(text))
            }
            Operation::WriteText => {
                pasteboard.clearContents();
                if !pasteboard.setString_forType(&NSString::from_str(text), text_type) {
                    return Err("Unable to write text to the macOS clipboard");
                }
                Ok(Value::Null)
            }
            Operation::ReadResources => {
                let mut paths = Vec::new();
                let mut move_files = false;
                if let Some(items) = pasteboard.pasteboardItems() {
                    for item in items.iter().take(MAX_FILES + 1) {
                        if paths.is_empty() {
                            move_files = item
                                .stringForType(&operation_type)
                                .is_some_and(|value| value.to_string() == "cut");
                        }
                        if let Some(value) = item.stringForType(file_type) {
                            if let Some(path) = local_path(&value) {
                                paths.push(path);
                            }
                        }
                    }
                }
                if paths.len() > MAX_FILES {
                    return Err("Too many files on the clipboard");
                }
                Ok(json!({ "paths": paths, "moveFiles": move_files }))
            }
            Operation::WriteResources => {
                let mut items: Vec<Retained<ProtocolObject<dyn NSPasteboardWriting>>> = Vec::new();
                for (index, path) in paths.iter().enumerate() {
                    let url = url::Url::from_file_path(path)
                        .map_err(|_| "Invalid local clipboard path")?;
                    let item = NSPasteboardItem::new();
                    if !item.setString_forType(&NSString::from_str(url.as_str()), file_type) {
                        return Err("Unable to prepare clipboard files");
                    }
                    if index == 0
                        && !item
                            .setString_forType(&NSString::from_str(&paths.join("\n")), text_type)
                    {
                        return Err("Unable to prepare clipboard text");
                    }
                    if !item.setString_forType(
                        &NSString::from_str(if move_files { "cut" } else { "copy" }),
                        &operation_type,
                    ) {
                        return Err("Unable to prepare clipboard operation");
                    }
                    items.push(ProtocolObject::from_retained(item));
                }
                pasteboard.clearContents();
                if !items.is_empty()
                    && !pasteboard.writeObjects(&NSArray::from_retained_slice(&items))
                {
                    return Err("Unable to write files to the macOS clipboard");
                }
                Ok(Value::Null)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(paths: Vec<String>) -> Request {
        Request {
            id: "1".into(),
            operation: Operation::WriteResources,
            text: String::new(),
            paths,
            move_files: false,
        }
    }

    #[test]
    fn preserves_spaces_unicode_and_multiple_paths() {
        assert!(validate(&request(vec![
            "/tmp/project فارسی/test file.ts".into(),
            "/tmp/second".into()
        ]))
        .is_ok());
    }

    #[test]
    fn rejects_relative_null_and_oversized_clipboard_requests() {
        for path in ["relative/file", "/tmp/bad\0file"] {
            assert!(validate(&request(vec![path.into()])).is_err());
        }
        assert!(validate(&request(vec!["/tmp/a".into(); MAX_FILES + 1])).is_err());
        let mut value = request(Vec::new());
        value.text = "a".repeat(MAX_TEXT + 1);
        assert!(validate(&value).is_err());
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn finder_file_reference_urls_resolve_to_real_unicode_paths() {
        use objc2_foundation::{NSString, NSURL};
        let file = std::env::temp_dir().join(format!(
            "paradise-clipboard-{}-فارسی file.txt",
            std::process::id()
        ));
        std::fs::write(&file, "Finder proof").unwrap();
        let value = url::Url::from_file_path(&file).unwrap();
        let native = NSURL::URLWithString(&NSString::from_str(value.as_str())).unwrap();
        let reference = native.fileReferenceURL().unwrap();
        let resolved = macos::local_path(&reference.absoluteString().unwrap()).unwrap();
        std::fs::remove_file(&file).unwrap();
        assert_eq!(resolved, file.to_string_lossy());
        assert!(macos::local_path(&NSString::from_str("https://example.com/file.txt")).is_none());
    }
}
