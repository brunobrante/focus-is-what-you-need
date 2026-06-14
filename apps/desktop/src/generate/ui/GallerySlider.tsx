import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Baseline, ChevronLeft, ChevronRight, LayoutGrid, Palette, Type } from "lucide-react";
import type { SavedComponent } from "../engine/types";
import { SceneCanvasViewer } from "@/components/screen/SceneCanvasViewer";
import {
  extractColors,
  runFlorence2TextCheck,
  runFontDetect,
  urlToBytes,
  type ColorEntry,
  type FontPrediction,
} from "../../lib/models/modelCommands";

export function GallerySlider({
  cuts,
  showColors = false,
  showText = false,
  showFont = false,
  onFocusChange,
}: {
  cuts: SavedComponent[];
  showColors?: boolean;
  showText?: boolean;
  showFont?: boolean;
  /** Reports the cut currently in view so the Builder can open the same item. */
  onFocusChange?: (cutId: string | null) => void;
}) {
  const [index, setIndex] = useState(0);
  const [colorResult, setColorResult] = useState<ColorEntry[] | null>(null);
  const [textResult, setTextResult] = useState<boolean | null>(null);
  const [fontResult, setFontResult] = useState<FontPrediction[] | null>(null);
  const [loadingColor, setLoadingColor] = useState(false);
  const [loadingText, setLoadingText] = useState(false);
  const [loadingFont, setLoadingFont] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [cuts.length]);

  useEffect(() => {
    setColorResult(null);
    setTextResult(null);
    setFontResult(null);
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

  useEffect(() => {
    onFocusChange?.(current?.id ?? null);
  }, [current?.id, onFocusChange]);

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

  const checkFont = useCallback(async () => {
    if (!current) return;
    setLoadingFont(true);
    setFontResult(null);
    try {
      const bytes = await urlToBytes(current.dataUrl);
      const result = await runFontDetect(bytes);
      setFontResult(result);
    } finally {
      setLoadingFont(false);
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
      <div className={["flex max-h-full max-w-full flex-col items-center gap-3 px-16", showColors || showText || showFont ? "pb-24" : ""].join(" ")}>
        <div
          key={current.id}
          className="animate-in fade-in zoom-in-95 duration-150 overflow-hidden rounded-[8px] shadow-[0_14px_60px_rgba(0,0,0,0.55)]"
          style={{ maxWidth: "100%", maxHeight: "calc(100% - 56px)" }}
        >
          <SceneCanvasViewer source="snapshot" url={current.dataUrl} />
        </div>

      </div>

      {/* Bottom action bar */}
      {(showColors || showText || showFont) && (
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
        {/* Results — each in its own titled box, sitting side by side above the buttons */}
        {(colorResult || textResult !== null || fontResult) && (
          <div className="flex flex-wrap items-end justify-center gap-2">
            {colorResult && (
              <ResultCard title="Colors">
                <div className="flex items-center gap-1.5">
                  {colorResult.map((c, i) => (
                    <div
                      key={i}
                      title={`rgb(${c.r},${c.g},${c.b})`}
                      className="h-5 w-5 shrink-0 rounded-full border border-[rgba(255,255,255,0.12)] shadow-sm"
                      style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
                    />
                  ))}
                </div>
              </ResultCard>
            )}

            {textResult !== null && (
              <ResultCard title="Text">
                <div className="flex items-center gap-2 text-[12px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: textResult ? "#4ade80" : "#f87171" }}
                  />
                  <span className="text-[var(--text)]">
                    {textResult ? "Text detected" : "No text detected"}
                  </span>
                </div>
              </ResultCard>
            )}

            {fontResult && (
              <ResultCard title="Font">
                <div className="flex items-center gap-2 text-[12px]">
                  {fontResult.length === 0 ? (
                    <span className="text-[var(--text-faint)]">No font detected</span>
                  ) : (
                    fontResult.map((f, i) => (
                      <span key={f.name} className="flex items-center gap-1.5">
                        {i > 0 ? <span className="text-[var(--text-faint)]">·</span> : null}
                        <span className={i === 0 ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>
                          {f.name}
                        </span>
                        <span className="text-[10.5px] text-[var(--text-faint)]">
                          {Math.round(f.confidence * 100)}%
                        </span>
                      </span>
                    ))
                  )}
                </div>
              </ResultCard>
            )}
          </div>
        )}

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
          {showFont && (
            <ActionButton
              icon={<Baseline size={13} strokeWidth={1.8} />}
              label="Font"
              loading={loadingFont}
              onClick={checkFont}
            />
          )}
        </div>
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

/** A titled little box that frames one detection result above the action bar. */
function ResultCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-[10px] border border-[var(--border)] bg-[rgba(12,12,13,0.92)] px-3 py-2 backdrop-blur-[6px]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[var(--text-faint)]">
        {title}
      </span>
      {children}
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
