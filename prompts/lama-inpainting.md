**Context:** Tauri desktop app (Rust + React/TypeScript). The Builder (`/tools` route) shows cut cards from reference images. The Processing Features install system already exists in Settings — BiRefNet, Real-ESRGAN, Florence-2, and CRAFT are already implemented following that pattern. Read `prompts/processing-features.md` to understand the established conventions before starting.

**Goal:** Add a fifth optional AI feature — **LaMa Inpainting (Remove Element)** — that removes a selected element from a cut by painting over a user-drawn mask. When installed, a "Remove element" button appears on each cut card in the Builder. Clicking it enters a mask-drawing mode where the user paints over what they want removed; confirming runs LaMa and returns the inpainted result. The feature is invisible until installed from Settings, following the exact same pattern as the other features.

---

### 1 — Domain / persistence

In `src/domain/settings/types.ts`, add `lama` alongside the existing fields in `processingFeatures`:

```ts
processingFeatures: {
  birefnet:   { installed: boolean }
  realEsrgan: { installed: boolean }
  florence2:  { installed: boolean }
  craft:      { installed: boolean }
  lama:       { installed: boolean }   // add this
}
```

Add default `installed: false` in `src/domain/settings/defaults.ts`.
Persistence via `putRecord` — same as the other features.

---

### 2 — Backend (Rust — `src-tauri/src/models.rs`)

Extend the existing model system. LaMa is a single ONNX file.

**File to download** (save to `$APP_DATA/models/lama.onnx`):

| Filename | URL | Size |
|---|---|---|
| `lama.onnx` | https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx | ~208 MB |

`model_is_installed("lama")` — check that `lama.onnx` exists.
`model_install("lama", window)` — download with `model://progress` events (same pattern as other models).
`model_uninstall("lama")` — delete the file.

**New command — `run_lama`:**

```rust
run_lama(image_bytes: Vec<u8>, mask_bytes: Vec<u8>) -> Result<Vec<u8>, String>
```

- `image_bytes`: PNG of the cut (original image)
- `mask_bytes`: PNG grayscale mask — white (255) = area to remove, black (0) = keep
- Returns: PNG bytes of the inpainted result at the original image resolution

Inference pipeline:
1. Decode both images with the `image` crate
2. Resize both to 512×512 (LaMa's fixed input size)
3. Normalize image to Float32: subtract ImageNet mean `[0.485, 0.456, 0.406]`, divide by std `[0.229, 0.224, 0.225]` → tensor `[1, 3, 512, 512]`
4. Normalize mask to Float32: divide by 255.0 → tensor `[1, 1, 512, 512]`
5. Run ONNX session with `ort`; feed both tensors (check `session.inputNames` for correct key order)
6. Decode output tensor `[1, 3, 512, 512]`: reverse normalization (multiply by std, add mean, clamp to `[0,1]`, multiply by 255)
7. Resize result back to original image dimensions
8. Composite: where mask is white, use inpainted pixels; where mask is black, use original pixels
9. Encode as PNG and return

Use `ort` for ONNX Runtime, `image` + `ndarray` for tensor ops. Register `run_lama` in `main.rs`.

---

### 3 — Frontend: extend the existing hook

In `src/lib/models/useProcessingFeatures.ts`, add `lama` following the same shape as the other features:

```ts
lama: {
  installed: boolean
  installing: boolean
  progress: number
  install(): void
  uninstall(): void
}
```

Add a wrapper in `src/lib/models/modelManager.ts`:

```ts
runLama(imageBytes: Uint8Array, maskBytes: Uint8Array): Promise<Uint8Array>
```

Create a focused hook `src/lib/models/useLamaInpainting.ts` that manages the mask-drawing + inference flow:

```ts
type LamaStatus = "idle" | "masking" | "running" | "done" | "error"

function useLamaInpainting(imageUrl: string): {
  status: LamaStatus
  resultUrl: string | null
  canvasRef: React.RefObject<HTMLCanvasElement>
  startMasking(): void
  confirmMask(): void
  cancel(): void
  reset(): void
}
```

- `startMasking()` → sets status to `"masking"`, activates the brush on `canvasRef`
- `confirmMask()` → reads mask pixels from canvas, calls `runLama`, sets status to `"running"` then `"done"`
- `cancel()` → clears canvas, resets to `"idle"`
- `reset()` → back to `"idle"`, clears result

**Mask canvas behavior (status === "masking"):**
- Render the cut image as background
- Overlay a semi-transparent canvas on top (`pointer-events: all`)
- Mouse drag paints white circles (radius ~20px) onto the canvas — this is the mask
- Cursor is a circle showing the brush size
- No keyboard shortcuts needed in v1

---

### 4 — Settings UI

In the existing **"Processing Features"** settings section, add a fifth row:

- **Remove Element** — LaMa · ~208 MB · "Removes a painted selection from a cut using LaMa inpainting"
- Same install / uninstall / progress UI as the other rows

---

### 5 — Builder UI

**When `lama.installed` is false:** no change — the feature is invisible.

**When `lama.installed` is true:** add a **"Remove element"** button to each cut card in the Builder (same row as other feature buttons like "Remove BG" and "Upscale").

**Click flow:**

1. User clicks **"Remove element"**
2. Cut card expands to show the image with a brush overlay canvas on top
3. User paints over the element they want removed (white brush, semi-transparent red preview)
4. Two buttons appear below the canvas:
   - **"Apply"** — runs LaMa inference; shows spinner while running
   - **"Cancel"** — discards mask, collapses back to normal card
5. On success: card displays the inpainted result image
6. A **"Undo"** button appears to revert back to the original cut image (session-local only)

The result is **session-local** — it is not persisted to `ReferenceRow` in v1. Add a `// TODO: persist inpainting result to ReferenceRow` comment where the result is handled.

---

### Constraints
- No Python, no bundled binaries — pure Rust + ONNX Runtime via `ort`
- Settings persist via `putRecord` — no direct SQLite writes
- English in all code; UI copy follows the product's interface language
- Do not modify `schema.ts` — use the existing settings override mechanism
- The mask canvas is a plain HTML `<canvas>` element rendered as an overlay — do not use CanvasKit or the main canvas editor for this
- Update `UX.md`: document the Remove Element row in Processing Features settings and the mask-drawing flow on Builder cut cards
