import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Palette, Type } from "lucide-react";
import type { SavedComponent } from "../engine/types";
import {
  extractColors,
  runFlorence2TextCheck,
  urlToBytes,
  type ColorEntry,
} from "../../lib/models/modelCommands";

export function GallerySlider({
  cuts,
  showColors = false,
  showText = false,
}: {
  cuts: SavedComponent[];
  showColors?: boolean;
  showText?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [colorResult, setColorResult] = useState<ColorEntry[] | null>(null);
  const [textResult, setTextResult] = useState<boolean | null>(null);
  const [loadingColor, setLoadingColor] = useState(false);
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [cuts.length]);

  useEffect(() => {
    setColorResult(null);
    setTextResult(null);
  }, [index]);

  const go = (next: number) => setIndex(((next % cuts.length) + cuts.length) % cuts.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, cuts.length]);

  const current = cuts[index];

  const checkColors = useCallback(async () => {
    if (!current) return;
    setLoadingColor(true);
    setColorResult(null);
    try {
      const bytes = await urlToBytes(current.dataUrl);
      const result = await extractColors(bytes);
      setColorResult(result.slice(0, 12));
    } finally {
      setLoadingColor(false);
    }
  }, [current]);

  const checkText = useCallback(async () => {
    if (!current) return;
    setLoadingText(true);
    setTextResult(null);
    try {
      const bytes = await urlToBytes(current.dataUrl);
      const result = await runFlorence2TextCheck(bytes);
      setTextResult(result);
    } finally {
      setLoadingText(false);
    }
  }, [current]);

  if (cuts.length === 0) {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 text-[var(--text-faint)]">
        <LayoutGrid size={24} strokeWidth={1.5} />
        <span className="text-[13px]">No cuts yet</span>
      </div>
    );
  }

  return (
    <div data-selection-action className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg)]">
      {/* Left arrow */}
      <button
        type="button"
        aria-label="Previous cut"
        onClick={() => go(index - 1)}
        className="absolute left-4 z-30 grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border)] bg-[rgba(12,12,13,0.88)] text-[var(--text-muted)] shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-[6px] transition-all duration-[120ms] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>

      {/* Cut image + info */}
      <div className={["flex max-h-full max-w-full flex-col items-center gap-3 px-16", showColors || showText ? "pb-24" : ""].join(" ")}>
        <div
          key={current.id}
          className="animate-in fade-in zoom-in-95 duration-150 rounded-[8px] shadow-[0_14px_60px_rgba(0,0,0,0.55)]"
          style={{ maxWidth: "100%", maxHeight: "calc(100% - 56px)" }}
        >
          <img
            src={current.dataUrl}
            alt={current.name}
            draggable={false}
            className="block rounded-[8px]"
            style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-[var(--text)]">{current.name}</span>
          <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--text-faint)]">
            {index + 1} / {cuts.length}
          </span>
        </div>

        {cuts.length <= 20 ? (
          <div className="flex items-center gap-1">
            {cuts.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to cut ${i + 1}`}
                onClick={() => go(i)}
                className={[
                  "h-1.5 rounded-full transition-all duration-[120ms] cursor-pointer",
                  i === index
                    ? "w-4 bg-[var(--text)]"
                    : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--text-faint)]",
                ].join(" ")}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Bottom action bar */}
      {(showColors || showText) && (
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          {showColors && (
            <ActionButton
              icon={<Palette size={13} strokeWidth={1.8} />}
              label="Colors"
              loading={loadingColor}
              onClick={checkColors}
            />
          )}
          {showText && (
            <ActionButton
              icon={<Type size={13} strokeWidth={1.8} />}
              label="Text"
              loading={loadingText}
              onClick={checkText}
            />
          )}
        </div>

        {colorResult && (
          <div className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[rgba(12,12,13,0.92)] px-3 py-2 backdrop-blur-[6px]">
            {colorResult.map((c, i) => (
              <div
                key={i}
                title={`rgb(${c.r},${c.g},${c.b})`}
                className="h-5 w-5 shrink-0 rounded-full border border-[rgba(255,255,255,0.12)] shadow-sm"
                style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
              />
            ))}
          </div>
        )}

        {textResult !== null && (
          <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[rgba(12,12,13,0.92)] px-3 py-2 text-[12px] backdrop-blur-[6px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: textResult ? "#4ade80" : "#f87171" }}
            />
            <span className="text-[var(--text)]">
              {textResult ? "Text detected" : "No text detected"}
            </span>
          </div>
        )}
      </div>
      )}

      {/* Right arrow */}
      <button
        type="button"
        aria-label="Next cut"
        onClick={() => go(index + 1)}
        className="absolute right-4 z-30 grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border)] bg-[rgba(12,12,13,0.88)] text-[var(--text-muted)] shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-[6px] transition-all duration-[120ms] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[rgba(12,12,13,0.92)] px-3 text-[12px] font-medium text-[var(--text-muted)] backdrop-blur-[6px] transition-colors duration-[120ms] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-wait disabled:opacity-50"
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border border-[var(--text-faint)] border-t-[var(--text)]" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
