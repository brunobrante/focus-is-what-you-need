import { X, Wand2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

export function GeneratorHeader({ breadcrumb }: { breadcrumb?: ReactNode }) {
  const navigate = useNavigate();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
      <div className="inline-flex items-center gap-2 text-[12.5px] font-medium">
        <Wand2 size={13} strokeWidth={1.7} className="opacity-70" />
        <span className="text-[var(--text)]">Builder</span>
        {breadcrumb}
      </div>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Close Builder"
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </header>
  );
}
