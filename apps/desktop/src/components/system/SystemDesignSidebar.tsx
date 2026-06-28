import { Link } from "react-router-dom";
import { SYSTEM_DESIGN_CATEGORIES, CATEGORY_LABEL } from "@/domain/system-design/defaults";
import { CATEGORY_ICON } from "@/system-design/shared";
import type { SystemDesignCategory } from "@/lib/storage/schema";

export function SystemDesignSidebar({
  activeCategory,
  systemBase,
  onSelect,
}: {
  activeCategory: SystemDesignCategory;
  systemBase?: string;
  onSelect?: (cat: SystemDesignCategory) => void;
}) {
  return (
    <aside className="flex w-[196px] shrink-0 flex-col border-r border-[var(--border)]">
      <div className="px-4 pb-3 pt-5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.9px] text-[var(--text-faint)]">
          Design System
        </span>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        {SYSTEM_DESIGN_CATEGORIES.map((category) => {
          const isActive = category === activeCategory;
          const cls = [
            "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-[9px] text-[13px] font-medium transition-colors no-underline",
            isActive
              ? "bg-[var(--surface-hover)] text-[var(--text)]"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
          ].join(" ");
          const content = (
            <>
              <span className={isActive ? "opacity-80" : "opacity-50"}>{CATEGORY_ICON[category]}</span>
              {CATEGORY_LABEL[category]}
            </>
          );
          return systemBase ? (
            <Link key={category} to={`${systemBase}/${category}`} replace className={cls}>
              {content}
            </Link>
          ) : (
            <button key={category} type="button" onClick={() => onSelect?.(category)} className={[cls, "border-0"].join(" ")}>
              {content}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
