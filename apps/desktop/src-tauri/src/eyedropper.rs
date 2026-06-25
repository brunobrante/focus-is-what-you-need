// Native screen color sampler (eyedropper).
//
// The web `EyeDropper` API is Chromium-only and is absent in the app's macOS
// WKWebView, so the Fill inspector needs a native fallback. On macOS we drive
// AppKit's `NSColorSampler`, which lets the user click any on-screen pixel and
// hands back an `NSColor` — without ever triggering the Screen Recording
// permission prompt (`NSColorSampler` is available on macOS 10.15+).
//
// AppKit requires all UI work on the main thread, and
// `NSColorSampler.show(completionHandler:)` is asynchronous. We therefore
// dispatch the call onto Tauri's main thread and bridge the completion handler
// back to the async command through a channel.

/// Picks a single on-screen color via the native macOS color sampler.
///
/// Returns `Ok(Some("#RRGGBB"))` when the user picks a pixel, `Ok(None)` when
/// the user cancels (the completion handler fires with `nil`), and `Err(msg)`
/// on failure. On non-macOS platforms it always returns an error so the rest
/// of the app can fall back gracefully.
#[tauri::command]
pub async fn pick_screen_color(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::pick(app).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("eyedropper not supported on this platform".to_string())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2_app_kit::{NSColor, NSColorSampler, NSColorSpace};
    use std::sync::mpsc;
    use tauri::AppHandle;

    pub(super) async fn pick(app: AppHandle) -> Result<Option<String>, String> {
        // The completion handler runs on the main thread; bridge its single
        // result back to this async command over a channel.
        let (tx, rx) = mpsc::channel::<Result<Option<String>, String>>();

        app.run_on_main_thread(move || {
            // Safety: Tauri invokes this closure on the main thread, which is
            // exactly what AppKit's color sampler requires.
            let sampler: Retained<NSColorSampler> = unsafe { NSColorSampler::new() };

            // `showSamplerWithSelectionHandler:` takes a block called with the
            // picked `NSColor`, or `nil` if the user cancelled. The objc2
            // binding models the nullable argument as a raw pointer.
            let handler = RcBlock::new(move |color: *mut NSColor| {
                let result = unsafe { color_to_hex(color) };
                // The receiver may already be gone if the command future was
                // dropped; ignore the send error in that case.
                let _ = tx.send(result);
            });

            unsafe {
                sampler.showSamplerWithSelectionHandler(&handler);
            }
        })
        .map_err(|e| format!("failed to dispatch color sampler to main thread: {e}"))?;

        // Wait for the user's pick (or cancel) without blocking the async
        // runtime's worker threads.
        tauri::async_runtime::spawn_blocking(move || {
            rx.recv()
                .map_err(|_| "color sampler completed without a result".to_string())?
        })
        .await
        .map_err(|e| format!("color sampler task failed: {e}"))?
    }

    /// Converts an `NSColor` (which may be `nil` on cancel) into a `#RRGGBB`
    /// sRGB hex string. Returns `Ok(None)` for a `nil` color.
    ///
    /// Safety: `color`, when non-null, must be a valid `NSColor` pointer handed
    /// to us by AppKit on the main thread.
    unsafe fn color_to_hex(color: *mut NSColor) -> Result<Option<String>, String> {
        let Some(color) = color.as_ref() else {
            return Ok(None);
        };

        // The sampler may return a color in any color space; normalize to sRGB
        // before reading components so the hex is device-independent.
        let srgb = color
            .colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())
            .ok_or_else(|| "could not convert picked color to sRGB".to_string())?;

        let r = srgb.redComponent();
        let g = srgb.greenComponent();
        let b = srgb.blueComponent();

        Ok(Some(format!(
            "#{:02X}{:02X}{:02X}",
            channel_to_u8(r),
            channel_to_u8(g),
            channel_to_u8(b),
        )))
    }

    fn channel_to_u8(value: f64) -> u8 {
        (value.clamp(0.0, 1.0) * 255.0).round() as u8
    }
}
