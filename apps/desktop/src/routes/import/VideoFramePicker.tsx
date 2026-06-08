import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  extractVideoFrames,
  loadReferenceFrame,
  type ExtractedFrame,
} from "@/lib/tauri/referenceStorage";

export type FramePickerVideo = {
  id: string;
  ext: string;
  name: string;
  duration?: number;
};

const FPS_PRESETS = [0.5, 1, 1.5, 2, 4] as const;
const MAX_FRAMES = 300;

export function VideoFramePicker({
  video,
  busy = false,
  onCancel,
  onConfirm,
}: {
  video: FramePickerVideo;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (frames: ExtractedFrame[]) => void;
}) {
  const [fps, setFps] = useState(1.5);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The frame shown large in the preview pane (independent of multi-selection).
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void extractVideoFrames(video.id, video.ext, { fps, maxFrames: MAX_FRAMES, maxWidth: 480 })
      .then((result) => {
        if (cancelled) return;
        setFrames(result);
        // Keep only still-valid selections after a re-extract.
        setSelected((current) => {
          const valid = new Set(result.map((frame) => frame.file));
          return new Set([...current].filter((file) => valid.has(file)));
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[frames] extraction failed:", err);
        setError("Could not extract frames. Is ffmpeg installed?");
        setFrames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fps, video.ext, video.id]);

  // Keep a valid focused frame: default to the first one, and recover if the
  // current preview disappears after a re-extract.
  useEffect(() => {
    setPreviewFile((current) =>
      current && frames.some((frame) => frame.file === current)
        ? current
        : frames[0]?.file ?? null,
    );
  }, [frames]);

  const toggle = useCallback((file: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(frames.map((frame) => frame.file)));
  }, [frames]);

  const clearAll = useCallback(() => setSelected(new Set()), []);

  const selectedFrames = frames.filter((frame) => selected.has(frame.file));
  const focusedFrame = frames.find((frame) => frame.file === previewFile) ?? null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Pick video frames"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(0,0,0,0.7)] p-8 backdrop-blur-[6px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex max-h-full w-[min(960px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]" style={{ boxShadow: "var(--shadow-pop)" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-[18px] py-3.5">
          <div className="min-w-0">
            <h3 className="m-0 truncate text-[14px] font-semibold text-[var(--text)]">
              Pick frames — {video.name}
            </h3>
            <p className="m-0 mt-0.5 text-[11.5px] text-[var(--text-faint)]">
              Each selected frame becomes a screen (stack) in a new group.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onCancel}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] px-[18px] py-2.5">
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
            Sample rate
            <select
              value={fps}
              disabled={loading || busy}
              onChange={(event) => setFps(Number(event.target.value))}
              className="h-7 cursor-pointer rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11.5px] text-[var(--text)] outline-none hover:border-[var(--border-strong)] disabled:opacity-50"
            >
              {FPS_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset} fps
                </option>
              ))}
            </select>
          </label>
          <span className="text-[11px] tabular-nums text-[var(--text-faint)]">
            {frames.length} frame{frames.length === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              disabled={loading || busy || frames.length === 0}
              onClick={selectAll}
              className="h-7 cursor-pointer rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-40"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={clearAll}
              className="h-7 cursor-pointer rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex min-h-[380px] flex-1 flex-col overflow-hidden p-[18px]">
          {loading ? (
            <div className="flex h-full min-h-[240px] items-center justify-center gap-2 text-[12.5px] text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin" />
              Extracting frames…
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-[12.5px] text-[#ff8a8a]">
              {error}
            </div>
          ) : frames.length === 0 ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-[12.5px] text-[var(--text-faint)]">
              No frames extracted.
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col">
              <div className="relative mb-3 flex flex-1 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-[#0E0E0E]">
                {focusedFrame ? (
                  <FramePreview
                    key={focusedFrame.file}
                    referenceId={video.id}
                    frame={focusedFrame}
                    selected={selected.has(focusedFrame.file)}
                    onToggle={() => toggle(focusedFrame.file)}
                  />
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2 overflow-x-auto pb-2">
                {frames.map((frame) => (
                  <FrameTile
                    key={frame.file}
                    referenceId={video.id}
                    frame={frame}
                    selected={selected.has(frame.file)}
                    focused={focusedFrame?.file === frame.file}
                    onFocus={() => setPreviewFile(frame.file)}
                    onToggle={() => toggle(frame.file)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-[18px] py-3">
          <span className="text-[12px] text-[var(--text-muted)]">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="h-8 cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[12.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => onConfirm(selectedFrames)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] px-3.5 text-[12.5px] font-semibold text-[var(--accent-fg)] hover:bg-white disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--text-faint)]"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2.2} />}
              {busy ? "Creating group…" : `Use ${selected.size} frame${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FramePreview({
  referenceId,
  frame,
  selected,
  onToggle,
}: {
  referenceId: string;
  frame: ExtractedFrame;
  selected: boolean;
  onToggle: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    void loadReferenceFrame(referenceId, frame.file).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [frame.file, referenceId]);

  return (
    <>
      {url ? (
        <img src={url} alt={`Frame ${frame.index}`} className="max-h-full max-w-full object-contain" />
      ) : (
        <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
      )}
      <span className="pointer-events-none absolute left-3 top-3 rounded-[6px] border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.7)] px-2 py-1 text-[11px] tabular-nums text-white backdrop-blur">
        {formatTimestamp(frame.timestamp_ms)}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={[
          "absolute right-3 top-3 inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
          selected
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
            : "border-[var(--border-strong)] bg-[rgba(0,0,0,0.6)] text-white hover:border-[var(--text)]",
        ].join(" ")}
      >
        <Check size={13} strokeWidth={2.4} />
        {selected ? "Selected" : "Select frame"}
      </button>
    </>
  );
}

function FrameTile({
  referenceId,
  frame,
  selected,
  focused,
  onFocus,
  onToggle,
}: {
  referenceId: string;
  frame: ExtractedFrame;
  selected: boolean;
  focused: boolean;
  onFocus: () => void;
  onToggle: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadReferenceFrame(referenceId, frame.file).then((blob) => {
          if (cancelled || !blob) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        });
      },
      { root: node.parentElement, rootMargin: "300px" },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [frame.file, referenceId]);

  return (
    <div ref={containerRef} className="relative w-[150px] shrink-0">
      <button
        type="button"
        onClick={onFocus}
        className={[
          "block w-full overflow-hidden rounded-[8px] border bg-[var(--bg)] text-left transition-colors duration-[120ms]",
          focused
            ? "border-[var(--text)] ring-1 ring-[var(--text)]"
            : selected
              ? "border-[var(--accent)]"
              : "border-[var(--border)] hover:border-[var(--border-strong)]",
        ].join(" ")}
      >
        <div className="relative aspect-video w-full bg-[#0E0E0E]">
          {url ? (
            <img src={url} alt={`Frame ${frame.index}`} className="h-full w-full object-contain" />
          ) : null}
        </div>
        <span className="block px-2 py-1 text-[10.5px] tabular-nums text-[var(--text-muted)]">
          {formatTimestamp(frame.timestamp_ms)}
        </span>
      </button>
      <button
        type="button"
        aria-label={selected ? "Deselect frame" : "Select frame"}
        onClick={onToggle}
        className={[
          "absolute right-1.5 top-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded-full border text-[var(--accent-fg)] transition-colors",
          selected
            ? "border-[var(--accent)] bg-[var(--accent)]"
            : "border-[var(--border-strong)] bg-[rgba(0,0,0,0.5)] hover:border-[var(--text)]",
        ].join(" ")}
      >
        {selected ? <Check size={12} strokeWidth={2.6} /> : null}
      </button>
    </div>
  );
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
