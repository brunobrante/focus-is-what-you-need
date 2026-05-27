import type { ReferenceRow } from "@/lib/storage/schema";
import { AddCard } from "./AddCard";

export function SideReferencesTab({
  references,
  query,
  onAdd,
  onOpen,
}: {
  references: ReferenceRow[];
  query: string;
  onAdd: () => void;
  onOpen: (index: number) => void;
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
            {query.trim() ? "Nenhuma referência encontrada" : "Nenhuma referência ainda"}
          </p>
          <p className="m-0 mt-1 text-[12px] text-[var(--text-faint)]">
            Adicione imagens ou vídeos de referência
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
          Adicionar referência
        </button>
      </div>
    );
  }

  return (
    <div className="col-span-full flex flex-col gap-3">
      <style>{`
        .ref-pin-grid {
          column-width: 170px;
          column-gap: 10px;
        }
        @media (min-width: 1280px) {
          .ref-pin-grid {
            column-width: 190px;
          }
        }
      `}</style>
      <div className="ref-pin-grid">
        {references.map((r, i) => (
          <RefSidePin key={r.id} reference={r} onClick={() => onOpen(i)} />
        ))}
        <AddCard label="Nova referência" onClick={onAdd} compact />
      </div>
    </div>
  );
}

function RefSidePin({
  reference,
  onClick,
}: {
  reference: ReferenceRow;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mb-2 block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
      style={{ breakInside: "avoid" }}
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
              <span className="pointer-events-none absolute right-2 top-2 rounded-[5px] border border-white/15 bg-black/65 px-1.5 py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.35px] text-white backdrop-blur">
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
  );
}
