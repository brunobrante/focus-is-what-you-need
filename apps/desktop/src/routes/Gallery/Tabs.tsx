import type { Tab } from "./types";

export function Tabs({
  tab,
  onChange,
  screensCount,
  componentsCount,
  referencesCount,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  screensCount: number;
  componentsCount: number;
  referencesCount: number;
}) {
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "screens", label: "Screens", count: screensCount },
    { id: "components", label: "Components", count: componentsCount },
    { id: "references", label: "References" },
    { id: "system", label: "System" },
  ];
  return (
    <nav role="tablist" className="flex gap-1 border-b border-[var(--border)] px-7">
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            onClick={() => onChange(t.id)}
            aria-selected={active}
            className={[
              "relative cursor-pointer border-0 bg-transparent px-3.5 py-3 text-[13px] font-medium tracking-[0.1px]",
              active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {t.label}
            {t.count != null && (
              <span
                className={[
                  "ml-1.5 inline-block rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-px text-[11px]",
                  active ? "text-[var(--text)]" : "text-[var(--text-faint)]",
                ].join(" ")}
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {t.count}
              </span>
            )}
            {active && (
              <span className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-[2px] bg-[var(--text)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
