import { Check, ChevronLeft, Trash2 } from "lucide-react";
import type { SavedComponent } from "../types";
import { cutVariants, resolveActiveVariantId, VARIANT_TOOL_LABELS } from "../engine/variants";

/**
 * Sidebar panel that replaces the component tree to show one cut's non-crop edit
 * history (its variants). The user picks which variant is the "main" one and can
 * delete AI variants. A back button returns to the tree.
 */
export function VariantsPanel({
  cut,
  onBack,
  onSetMain,
  onRemove,
}: {
  cut: SavedComponent;
  onBack: () => void;
  onSetMain: (variantId: string) => void;
  onRemove: (variantId: string) => void;
}) {
  const variants = cutVariants(cut);
  const activeId = resolveActiveVariantId(cut);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3">
        <button
          type="button"
          aria-label="Back to tree"
          title="Back to tree"
          onClick={onBack}
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <ChevronLeft size={14} strokeWidth={1.8} />
        </button>
        <div
          className="h-8 w-8 shrink-0 rounded-[5px] border border-[var(--border)] bg-[#0E0E0E] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${cut.dataUrl}")` }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-semibold text-[var(--text)]">
              {cut.name}
            </h3>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--text-faint)]">
              {variants.length}
            </span>
          </div>
          <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">Variants</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
        {variants.map((variant) => {
          const isActive = variant.id === activeId;
          const isOriginal = variant.tool === "original";
          const canRemove = !isOriginal && !isActive;
          return (
            <div
              key={variant.id}
              onClick={() => {
                if (!isActive) onSetMain(variant.id);
              }}
              className={[
                "flex h-11 cursor-pointer items-center gap-1.5 rounded-[8px] border bg-[var(--bg-elev)] px-1.5 py-1 transition-colors duration-[120ms]",
                isActive
                  ? "border-[var(--text)]"
                  : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]",
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                  isActive
                    ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                    : "border-[var(--border)] text-transparent",
                ].join(" ")}
              >
                <Check size={12} strokeWidth={2.4} />
              </span>
              <div
                className="h-8 w-8 shrink-0 rounded-[5px] border border-[var(--border)] bg-[#0E0E0E] bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${variant.dataUrl}")` }}
              />
              <div className="min-w-0 flex-1">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-[var(--text)]">
                  {VARIANT_TOOL_LABELS[variant.tool] ?? variant.tool}
                </span>
                {isActive ? (
                  <span className="block text-[10px] font-medium text-[var(--text-faint)]">Main</span>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Delete variant"
                title={
                  isOriginal
                    ? "The original cannot be deleted"
                    : isActive
                      ? "Pick another variant as main to delete this one"
                      : "Delete variant"
                }
                disabled={!canRemove}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canRemove) onRemove(variant.id);
                }}
                className={[
                  "grid h-[26px] w-[26px] shrink-0 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[#ff8a8a]",
                  !canRemove
                    ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]"
                    : "",
                ].join(" ")}
              >
                <Trash2 size={13} strokeWidth={1.8} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
