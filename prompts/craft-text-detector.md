**Context:** Tauri desktop app (Rust + React/TypeScript). The Builder (`/tools` route) shows cut cards from reference images. The Processing Features install system already exists in Settings — BiRefNet, Real-ESRGAN, and Florence-2 are already implemented following that pattern. Read `prompts/processing-features.md` to understand the established conventions before starting.

**Goal:** Add a fourth optional AI feature — **CRAFT Text Detector** — that detects whether a cut contains text. When installed, a button "Is text?" appears on each cut card in the Builder. Clicking it runs CRAFT on that cut's image and responds with a **Yes** or **No** badge. The feature is invisible until installed from Settings, following the exact same pattern as the other three features.

---

### 1 — Domain / persistence

In `src/domain/settings/types.ts`, add `craft` alongside the existing fields in `processingFeatures`:

```ts
processingFeatures: {
  birefnet:   { installed: boolean }
  realEsrgan: { installed: boolean }
  florence2:  { installed: boolean }
  craft:      { installed: boolean }   // add this
}
```

Add default `installed: false` in `src/domain/settings/defaults.ts`.
Persistence via `putRecord` — same as the other features.

---

### 2 — Backend (Rust — `src-tauri/src/models.rs`)

Extend the existing model system. CRAFT is a single ONNX file.

**File to download** (save to `$APP_DATA/models/craft.onnx`):

| Filename | URL | Size |
|---|---|---|
| `craft.onnx` | https://huggingface.co/Bingsu/craft-onnx/resolve/main/craft_mlt_25k.onnx | ~20 MB |

`model_is_installed("craft")` — check that `craft.onnx` exists.
`model_install("craft", window)` — download with `model://progress` events (same as other models).
`model_uninstall("craft")` — delete the file.

**New command — `run_craft`:**

```rust
run_craft(image_bytes: Vec<u8>) -> Result<bool, String>
```

Returns `true` if text is detected, `false` otherwise.

Inference pipeline:
1. Decode image bytes with the `image` crate
2. Resize to fit within 1280px on the longest side, keeping dimensions as multiples of 32
3. Normalize pixel values: subtract ImageNet mean `[0.485, 0.456, 0.406]`, divide by std `[0.229, 0.224, 0.225]`
4. Build input tensor `[1, 3, H, W]` as `Float32`
5. Run ONNX session with `ort`
6. Read first output (region score map); compute `max(region_score)`
7. Return `max > 0.3`

Register `run_craft` in `main.rs`.

---

### 3 — Frontend: extend the existing hook

In `src/lib/models/useProcessingFeatures.ts`, add `craft` following the same shape as the other features:

```ts
craft: {
  installed: boolean
  installing: boolean
  progress: number
  install(): void
  uninstall(): void
}
```

Add a wrapper in `src/lib/models/modelManager.ts`:

```ts
runCraft(imageBytes: Uint8Array): Promise<boolean>
```

Create a focused hook `src/lib/models/useCraftCheck.ts` that manages per-card state:

```ts
type CraftStatus = "idle" | "running" | "done" | "error"

function useCraftCheck(): {
  status: CraftStatus
  isText: boolean | null
  check(imageBytes: Uint8Array): void
  reset(): void
}
```

`check()` calls `runCraft`, sets `isText` on completion, sets status to `"error"` on failure.

---

### 4 — Settings UI

In the existing **"Processing Features"** settings section, add a fourth row:

- **Text Detector** — CRAFT · ~20 MB · "Detects whether a cut contains text"
- Same install / uninstall / progress UI as the other rows

---

### 5 — Builder UI

**When `craft.installed` is false:** no change — the feature is invisible.

**When `craft.installed` is true:** add an **"Is text?"** button to each cut card in the Builder.

Button states:
- **Idle** → label "Is text?", icon `ScanText` from lucide-react
- **Running** → spinner, disabled
- **Done** → label "Check again" + a badge next to it:
  - Text detected → green badge **"Yes"**
  - No text → red badge **"No"**
- **Error** → label "Retry"

Clicking "Check again" calls `reset()` then `check()` immediately.

The result is **display-only** — it is not persisted to `ReferenceRow` or any storage in v1. Add a `// TODO: persist text detection result to ReferenceRow` comment where the result is handled.

---

### Constraints
- No Python, no bundled binaries — pure Rust + ONNX Runtime via `ort`
- Settings persist via `putRecord` — no direct SQLite writes
- English in all code; UI copy follows the product's interface language
- Do not modify `schema.ts` — use the existing settings override mechanism
- Update `UX.md`: document the Text Detector row in Processing Features settings and the "Is text?" button on Builder cut cards
