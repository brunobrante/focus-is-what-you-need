/**
 * Sticky header + tab strip shared by the workspace and project edit panels
 * (D7). Renders the title, Cancel / Save buttons, and a tablist; the caller
 * supplies its own tab set and body below.
 */
export function EditPanelHeader<T extends string>({
  title,
  onCancel,
  onSave,
  saveDisabled,
  saving,
  tabs,
  activeTab,
  onSelectTab,
}: {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
  tabs: ReadonlyArray<{ id: T; label: string }>;
  activeTab: T;
  onSelectTab: (id: T) => void;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between px-7 py-3">
        <span className="text-[13px] font-medium text-[var(--text)]">{title}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            className="btn btn-primary"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      {/* Tabs */}
      <div role="tablist" className="flex gap-0.5 px-5">
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onSelectTab(t.id)}
              className={[
                "relative cursor-pointer border-0 bg-transparent px-3 py-2.5 text-[12px] font-medium",
                isActive ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {t.label}
              {isActive && (
                <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded-[2px] bg-[var(--text)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
