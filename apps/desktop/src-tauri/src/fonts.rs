// System font enumeration for the typography font picker (audit item G3).
//
// The web Local Font Access API (`queryLocalFonts`) is Chromium-only and absent
// from the app's macOS WKWebView, so the picker's "Installed" group is filled
// from the native side instead. AppKit's `NSFontManager` already indexes every
// activated family and its members (post-script name, style name, Apple weight
// 0-15, trait mask), so no font file is parsed and no new crate is needed.
//
// `NSFontManager` is main-thread-only, so the walk is dispatched onto Tauri's
// main thread and bridged back over a channel — same shape as `eyedropper`. The
// result is cached for the process lifetime: it only changes when the user
// installs a font, and a stale list costs nothing but a missing entry.

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontFamily {
    pub family: String,
    /// CSS weights (100-900) the family actually ships, ascending and deduped.
    pub weights: Vec<u16>,
    /// True when at least one member of the family is an italic/oblique face.
    pub italic: bool,
    pub monospaced: bool,
}

/// Lists the font families installed on this machine, sorted by family name.
/// Returns an empty list on platforms without an enumeration backend — the
/// picker degrades to its bundled/generic families.
#[tauri::command]
pub async fn list_system_fonts(app: tauri::AppHandle) -> Result<Vec<SystemFontFamily>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::list(app).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(Vec::new())
    }
}

/// Maps AppKit's 0-15 weight scale onto CSS `font-weight`. Apple's anchors are
/// 2 = UltraLight, 3 = Thin, 4 = Light, 5 = Regular, 6 = Medium, 8 = Semibold,
/// 9 = Bold, 10 = Heavy, 12 = Black; the gaps are rounded to the nearest CSS step.
fn apple_weight_to_css(weight: i64) -> u16 {
    match weight {
        i64::MIN..=1 => 100,
        2 => 200,
        3 => 300,
        4 => 300,
        5 => 400,
        6 => 500,
        7 => 500,
        8 => 600,
        9 => 700,
        10 => 800,
        11 => 800,
        _ => 900,
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{apple_weight_to_css, SystemFontFamily};
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSFontManager;
    use objc2_foundation::{NSArray, NSNumber, NSString};
    use std::sync::{mpsc, OnceLock};
    use tauri::AppHandle;

    static CACHE: OnceLock<Vec<SystemFontFamily>> = OnceLock::new();

    // Bits of `NSFontTraitMask` that survive into the picker.
    const ITALIC_TRAIT: isize = 1 << 0;
    const FIXED_PITCH_TRAIT: isize = 1 << 10;

    // Layout of each member array returned by `availableMembersOfFontFamily:`:
    // [postScriptName, styleName, weight, traits].
    const MEMBER_WEIGHT_INDEX: usize = 2;
    const MEMBER_TRAITS_INDEX: usize = 3;
    const MEMBER_FIELD_COUNT: usize = 4;

    pub(super) async fn list(app: AppHandle) -> Result<Vec<SystemFontFamily>, String> {
        if let Some(cached) = CACHE.get() {
            return Ok(cached.clone());
        }

        let (tx, rx) = mpsc::channel::<Vec<SystemFontFamily>>();
        app.run_on_main_thread(move || {
            // Tauri guarantees this closure runs on the main thread, which is
            // exactly what `sharedFontManager` requires.
            let mtm = MainThreadMarker::new().expect("run_on_main_thread runs on the main thread");
            // The receiver is gone if the command future was dropped; ignore it.
            let _ = tx.send(enumerate(mtm));
        })
        .map_err(|e| format!("failed to dispatch font enumeration to the main thread: {e}"))?;

        // Wait for the walk without parking an async worker thread.
        let families = tauri::async_runtime::spawn_blocking(move || {
            rx.recv()
                .map_err(|_| "font enumeration finished without a result".to_string())
        })
        .await
        .map_err(|e| format!("font enumeration task failed: {e}"))??;

        Ok(CACHE.get_or_init(|| families).clone())
    }

    fn enumerate(mtm: MainThreadMarker) -> Vec<SystemFontFamily> {
        let manager = NSFontManager::sharedFontManager(mtm);
        let families = manager.availableFontFamilies();
        let mut out = Vec::with_capacity(families.count());

        for index in 0..families.count() {
            let family = families.objectAtIndex(index).to_string();
            // Leading-dot families are Apple's private system faces
            // (".AppleSystemUIFont", ".SF NS"); they cannot be used by name.
            if family.starts_with('.') {
                continue;
            }
            let Some(members) = manager.availableMembersOfFontFamily(&NSString::from_str(&family))
            else {
                continue;
            };

            let mut weights: Vec<u16> = Vec::new();
            let mut italic = false;
            let mut monospaced = false;

            for member_index in 0..members.count() {
                let member = members.objectAtIndex(member_index);
                if member.count() < MEMBER_FIELD_COUNT {
                    continue;
                }
                let traits = integer_at(&member, MEMBER_TRAITS_INDEX).unwrap_or(0);
                italic |= traits & ITALIC_TRAIT != 0;
                monospaced |= traits & FIXED_PITCH_TRAIT != 0;
                // Italic members carry the same weights as their upright twins,
                // so every member contributes — the italic flag is separate.
                if let Some(weight) = integer_at(&member, MEMBER_WEIGHT_INDEX) {
                    weights.push(apple_weight_to_css(weight as i64));
                }
            }

            if weights.is_empty() {
                continue;
            }
            weights.sort_unstable();
            weights.dedup();
            out.push(SystemFontFamily {
                family,
                weights,
                italic,
                monospaced,
            });
        }

        out.sort_by(|a, b| a.family.cmp(&b.family));
        out
    }

    /// Reads `member[index]` as an `NSNumber`. Returns `None` when the slot
    /// holds something else, which AppKit does not do but the array is untyped.
    fn integer_at(member: &Retained<NSArray<AnyObject>>, index: usize) -> Option<isize> {
        member
            .objectAtIndex(index)
            .downcast::<NSNumber>()
            .ok()
            .map(|number| number.integerValue())
    }
}
