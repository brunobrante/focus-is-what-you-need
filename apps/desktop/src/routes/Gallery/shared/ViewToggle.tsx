import { useState } from "react";
import { IconGrid, IconListView } from "@/components/icons";

export function ViewToggle({
  value,
  onChange,
}: {
  value?: "grid" | "list";
  onChange?: (value: "grid" | "list") => void;
}) {
  const [internalView, setInternalView] = useState<"grid" | "list">("grid");
  const view = value ?? internalView;
  const setView = onChange ?? setInternalView;
  return (
    <div
      role="tablist"
      aria-label="Preview"
      className="inline-flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-[3px]"
    >
      <button
        type="button"
        aria-label="Grid"
        onClick={() => setView("grid")}
        className={[
          "grid h-[26px] w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent",
          view === "grid"
            ? "bg-[var(--pill)] text-[var(--text)]"
            : "text-[var(--text-muted)]",
        ].join(" ")}
        style={view === "grid" ? { background: "var(--pill)" } : undefined}
      >
        <IconGrid size={14} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        aria-label="List"
        onClick={() => setView("list")}
        className={[
          "grid h-[26px] w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent",
          view === "list"
            ? "bg-[var(--pill)] text-[var(--text)]"
            : "text-[var(--text-muted)]",
        ].join(" ")}
        style={view === "list" ? { background: "var(--pill)" } : undefined}
      >
        <IconListView size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}
