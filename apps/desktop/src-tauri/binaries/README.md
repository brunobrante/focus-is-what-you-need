# Bundled sidecar binaries

## ffmpeg (video frame extraction)

The Builder's video frame extraction (`extract_video_frames`,
`extract_video_frame_full` in `src/lib.rs`) shells out to `ffmpeg`.

### Development

Nothing to do. `resolve_ffmpeg()` falls back to a system `ffmpeg` on `PATH`
(e.g. Homebrew's `/opt/homebrew/bin/ffmpeg`). Install one with:

```sh
brew install ffmpeg
```

`invoke("ffmpeg_available")` returns `true` once any ffmpeg is resolvable.

### Production (bundling a sidecar)

To ship ffmpeg with the app instead of relying on the user's system:

1. Drop a static ffmpeg build here, named with the Rust target triple suffix:

   ```
   binaries/ffmpeg-aarch64-apple-darwin     # Apple Silicon
   binaries/ffmpeg-x86_64-apple-darwin      # Intel mac
   binaries/ffmpeg-x86_64-pc-windows-msvc.exe
   binaries/ffmpeg-x86_64-unknown-linux-gnu
   ```

   Find the dev triple with `rustc -Vv | grep host`. Static macOS builds:
   https://evermeet.cx/ffmpeg/ — Windows/Linux: https://ffmpeg.org/download.html

2. Re-enable the sidecar in `tauri.conf.json`:

   ```jsonc
   "bundle": {
     "externalBin": ["binaries/ffmpeg"]
   }
   ```

`resolve_ffmpeg()` already prefers a binary named `ffmpeg` next to the app
executable (where Tauri places `externalBin` at bundle time), so no Rust change
is needed — it just starts using the bundled copy.
