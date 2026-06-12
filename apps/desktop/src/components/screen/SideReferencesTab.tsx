import type { ReferenceRow } from "@/lib/storage/schema";
import { IconImage, IconPlus } from "@/components/icons";
import { ReferenceRowCard } from "@/components/references/ReferenceRowCard";
import { EmptyMessage } from "./EmptyMessage";

export function SideReferencesTab({
  references,
  query,
  onAdd,
  onOpen,
  onRemove,
}: {
  references: ReferenceRow[];
  query: string;
  onAdd: () => void;
  onOpen: (index: number) => void;
  onRemove?: (reference: ReferenceRow) => void;
}) {
  if (references.length === 0) {
    return (
      <EmptyMessage
        icon={<IconImage size={17} strokeWidth={1.7} />}
        title={query.trim() ? "No reference found" : "No references yet"}
        description="Add reference images or videos"
        onClick={onAdd}
      />
    );
  }

  return (
    <div className="col-span-full flex flex-col gap-3">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(164px, 1fr))" }}
      >
        {references.map((r, i) => (
          <ReferenceRowCard
            key={r.id}
            reference={r}
            onClick={() => onOpen(i)}
            onRemove={onRemove ? () => onRemove(r) : undefined}
          />
        ))}
        <ReferenceAddPin onClick={onAdd} />
      </div>
    </div>
  );
}

function ReferenceAddPin({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
    >
      <div className="relative flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-dashed border-[var(--border)] bg-[linear-gradient(180deg,var(--surface)_0%,var(--bg)_100%)] p-3 text-center text-[var(--text-muted)] shadow-[0_1px_0_rgba(255,255,255,0.03)] group-focus-visible:border-[var(--text)] group-focus-visible:outline-none group-focus-visible:ring-2 group-focus-visible:ring-[rgba(255,255,255,0.12)]">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-current bg-[rgba(255,255,255,0.03)]">
          <IconPlus size={12} strokeWidth={2} />
        </span>
        <span className="text-[11px] font-medium leading-tight">New reference</span>
      </div>
    </button>
  );
}
