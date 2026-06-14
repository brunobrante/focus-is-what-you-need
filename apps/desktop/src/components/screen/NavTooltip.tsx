import { useScreen, useThumbnail } from "@/lib/storage/hooks";

export function NavTooltip({
  side,
  name,
  details,
  screenId,
}: {
  side: "prev" | "next";
  name: string;
  details?: string[];
  screenId?: string;
}) {
  const { data: screen } = useScreen(screenId ?? null);
  const { data: thumbnail } = useThumbnail("variant", screen?.activeVariantId ?? null);

  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none absolute top-1/2 z-[5] -translate-y-1/2 translate-y-2 scale-[0.94]",
        "opacity-0 transition-[opacity,transform] duration-[180ms]",
        "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:[transition-delay:420ms]",
        "flex w-[236px] items-start gap-2.5 rounded-[10px] border border-[var(--border-strong)]",
        "bg-[var(--surface-2)] p-2 shadow-[0_8px_28px_rgba(0,0,0,0.6)]",
        side === "prev" ? "left-[50px]" : "right-[50px]",
      ].join(" ")}
    >
      <div
        className="shrink-0 overflow-hidden rounded-[5px] border border-[var(--border-strong)] bg-[var(--bg)]"
        style={{ width: 40, height: 58 }}
      >
        {thumbnail?.dataUrl ? (
          <img
            src={thumbnail.dataUrl}
            alt=""
            className="block h-full w-full object-cover object-top"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-faint)]/80" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--text)]">{name}</div>
        <div className="mt-1 space-y-[2px] text-[11px] leading-[1.35] text-[var(--text-faint)]">
          {(details ?? ["Click to inspect this screen preview."]).map((line) => (
            <div key={line} className="truncate">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
