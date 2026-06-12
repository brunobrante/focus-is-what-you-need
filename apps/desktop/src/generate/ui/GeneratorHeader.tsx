import { PanelLeft, Wand2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BuilderStackTabs } from "./RailTools";

export function GeneratorHeader({
  showGroupNavToggle = false,
  onGroupNavToggle,
  tabActive,
  stackDisabled,
  onBuilder,
  onStack,
  onGallery,
}: {
  showGroupNavToggle?: boolean;
  onGroupNavToggle?: () => void;
  tabActive?: "builder" | "stack" | "gallery";
  stackDisabled?: boolean;
  onBuilder?: () => void;
  onStack?: () => void;
  onGallery?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--border)] px-4 text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
      <div className="flex items-center gap-2.5">
        {showGroupNavToggle ? (
          <button
            type="button"
            onClick={onGroupNavToggle}
            aria-label="Open screens panel"
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <PanelLeft size={13} strokeWidth={1.8} />
          </button>
        ) : null}
        <div className="inline-flex items-center gap-2 text-[12.5px] font-medium">
          <Wand2 size={13} strokeWidth={1.7} className="opacity-70" />
          <span className="text-[var(--text)]">Builder</span>
        </div>
      </div>

      <div className="flex items-center">
        {tabActive !== undefined && onBuilder && onStack && onGallery ? (
          <BuilderStackTabs
            active={tabActive}
            stackDisabled={stackDisabled ?? false}
            onBuilder={onBuilder}
            onStack={onStack}
            onGallery={onGallery}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Close Builder"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
