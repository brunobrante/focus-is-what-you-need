import { IconImage, IconTrash } from "@/components/icons";

/**
 * Shared presentational reference card. Renders from a plain `thumbnailUrl`
 * string so it works for whole images and baked stack-node crops alike. Used by
 * the screen/component References tab, the canvas references window, and the
 * detail-modal stacks gallery.
 *
 * Every card is a fixed 4:3 box and the image is `object-contain`, so all cards
 * are the same size and the whole image fits within the card without cropping.
 */
export function ReferenceThumbCard({
  thumbnailUrl,
  title,
  subtitle,
  badge,
  selected = false,
  onClick,
  onRemove,
}: {
  thumbnailUrl?: string | null;
  title: string;
  subtitle?: string;
  badge?: string;
  selected?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative w-full text-left align-top">
      <button
        type="button"
        onClick={onClick}
        className="block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
      >
        <div
          className={[
            "relative overflow-hidden rounded-[10px] border bg-[var(--surface)] transition-[border-color,transform,box-shadow] duration-150",
            selected
              ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
              : "border-[var(--border)] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_20px_rgba(0,0,0,0.12)] group-hover:-translate-y-0.5 group-hover:border-[var(--border-strong)] group-hover:shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_26px_rgba(0,0,0,0.18)]",
          ].join(" ")}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              draggable={false}
              className="block aspect-[4/3] w-full object-contain"
            />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-[linear-gradient(180deg,var(--surface)_0%,var(--bg)_100%)] text-[var(--text-faint)]">
              <IconImage size={18} strokeWidth={1.4} />
              <span className="px-3 text-center text-[10.5px] leading-snug">{title}</span>
            </div>
          )}

          {badge ? (
            <span
              className={[
                "pointer-events-none absolute top-2 rounded-[5px] border border-white/15 bg-black/65 px-1.5 py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.35px] text-white backdrop-blur",
                onRemove ? "left-2" : "right-2",
              ].join(" ")}
            >
              {badge}
            </span>
          ) : null}

          {thumbnailUrl ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-end p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.84) 0%, rgba(0,0,0,0) 54%)" }}
            >
              <div className="flex w-full flex-col gap-0.5">
                <span className="line-clamp-1 text-[11px] font-medium leading-tight text-white">
                  {title}
                </span>
                {subtitle ? (
                  <span className="truncate text-[9.5px] text-white/68">{subtitle}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </button>

      {onRemove ? (
        <button
          type="button"
          aria-label="Remove reference"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-2 z-10 grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-white/15 bg-black/70 text-white/78 opacity-0 backdrop-blur transition-[opacity,background-color,color,border-color] duration-150 hover:border-white/30 hover:bg-black/90 hover:text-white group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <IconTrash size={12} strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}
