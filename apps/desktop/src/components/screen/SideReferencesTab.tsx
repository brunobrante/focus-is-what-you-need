import type { ReferenceRow } from "@/lib/storage/schema";

const masonryItemStyle = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
  WebkitColumnBreakInside: "avoid",
};

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
      <div className="col-span-full flex flex-col items-center gap-4 py-16 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </span>
        <div>
          <p className="m-0 text-[13px] font-medium text-[var(--text)]">
            {query.trim() ? "No reference found" : "No references yet"}
          </p>
          <p className="m-0 mt-1 text-[12px] text-[var(--text-faint)]">
            Add reference images or videos
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add reference
        </button>
      </div>
    );
  }

  return (
    <div className="col-span-full flex flex-col gap-3">
      <style>{`
        .side-reference-grid {
          column-width: 164px;
          column-gap: 12px;
        }
        @media (min-width: 1280px) {
          .side-reference-grid {
            column-width: 178px;
          }
        }
      `}</style>
      <div className="side-reference-grid">
        {references.map((r, i) => (
          <RefSidePin
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
      className="group mb-3 inline-block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
      style={masonryItemStyle}
    >
      <div className="relative flex aspect-[4/3] min-h-[102px] flex-col items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-dashed border-[var(--border)] bg-[linear-gradient(180deg,var(--surface)_0%,var(--bg)_100%)] p-3 text-center text-[var(--text-muted)] shadow-[0_1px_0_rgba(255,255,255,0.03)] group-focus-visible:border-[var(--text)] group-focus-visible:outline-none group-focus-visible:ring-2 group-focus-visible:ring-[rgba(255,255,255,0.12)]">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-current bg-[rgba(255,255,255,0.03)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="text-[11px] font-medium leading-tight">New reference</span>
      </div>
    </button>
  );
}

function RefSidePin({
  reference,
  onClick,
  onRemove,
}: {
  reference: ReferenceRow;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className="group relative mb-3 inline-block w-full text-left align-top"
      style={masonryItemStyle}
    >
      <button
        type="button"
        onClick={onClick}
        className="block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
      >
        <div className="relative overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_20px_rgba(0,0,0,0.12)] transition-[border-color,transform,box-shadow] duration-150 group-hover:-translate-y-0.5 group-hover:border-[var(--border-strong)] group-hover:shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_26px_rgba(0,0,0,0.18)]">
        {reference.thumbnailUrl ? (
          <>
            <img
              src={reference.thumbnailUrl}
              alt=""
              className="block h-auto w-full"
              draggable={false}
            />
            {reference.stack?.enabled ? (
              <span
                className={[
                  "pointer-events-none absolute top-2 rounded-[5px] border border-white/15 bg-black/65 px-1.5 py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.35px] text-white backdrop-blur",
                  onRemove ? "left-2" : "right-2",
                ].join(" ")}
              >
                Stack
              </span>
            ) : null}
            <div
              className="pointer-events-none absolute inset-0 flex items-end p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.84) 0%, rgba(0,0,0,0) 54%)" }}
            >
              <div className="flex w-full flex-col gap-1">
                <span className="line-clamp-1 text-[11px] font-medium leading-tight text-white">
                  {reference.title}
                </span>
                {reference.source ? (
                  <span className="truncate text-[9.5px] text-white/68">{reference.source}</span>
                ) : null}
                {(reference.metadata ?? []).length > 0 ? (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {(reference.metadata ?? []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/15 bg-black/50 px-1.5 py-px text-[8.5px] text-white/82 backdrop-blur"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-[var(--text-faint)] bg-[linear-gradient(180deg,var(--surface) 0%,var(--bg) 100%)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span className="px-3 text-center text-[10.5px] leading-snug">{reference.title}</span>
          </div>
        )}
        </div>
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label="Remove from project"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-2 z-10 grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-white/15 bg-black/70 text-white/78 opacity-0 backdrop-blur transition-[opacity,background-color,color,border-color] duration-150 hover:border-white/30 hover:bg-black/90 hover:text-white group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5M14 11v5" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
