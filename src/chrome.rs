use objc2_app_kit::{NSView, NSWindow, NSWindowButton};
use tauri::WebviewWindow;

// Tauri's public setter is unavailable in 2.12. Use AppKit on its main thread,
// with the same container geometry as Tao's traffic_light_position builder.
pub fn align(window: &WebviewWindow, height: f64) {
    let handle = window.clone();
    let _ = window.run_on_main_thread(move || {
        let Ok(pointer) = handle.ns_window() else {
            return;
        };
        // ns_window remains owned by this retained Tauri window throughout this closure.
        let window = unsafe { &*(pointer as *const NSWindow) };
        let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
            return;
        };
        let Some(container) = (unsafe { close.superview().and_then(|v| v.superview()) }) else {
            return;
        };
        let close_frame = NSView::frame(&close);
        let inset = height / 2.0;
        let mut frame = NSView::frame(&container);
        frame.size.height = close_frame.size.height + inset;
        frame.origin.y = window.frame().size.height - frame.size.height;
        container.setFrame(frame);
    });
}
