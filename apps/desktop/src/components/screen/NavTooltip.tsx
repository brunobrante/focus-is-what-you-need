import { useThumbnail } from "@/lib/storage/hooks";

export function NavTooltip({
  side,
  name,
  screenId,
}: {
  side: "prev" | "next";
  name: string;
  screenId?: string;
}) {
  const { data: thumbnail } = useThumbnail("screen", screenId ?? null);

  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none absolute top-1/2 z-[5] -translate-y-1/2 translate-y-2 scale-[0.94]",
        "opacity-0 transition-[opacity,transform] duration-[150ms]",
        "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:[transition-delay:220ms]",
        "flex w-[200px] items-center gap-2.5 rounded-[10px] border border-[var(--border-strong)]",
        "bg-[var(--surface-2)] p-2 shadow-[0_8px_28px_rgba(0,0,0,0.6)]",
        side === "prev" ? "left-[50px]" : "right-[50px]",
      ].join(" ")}
    >
      <div
        className="shrink-0 overflow-hidden rounded-[5px] border border-[var(--border-strong)] bg-[var(--bg)]"
        style={{ width: 36, height: 52 }}
      >
        {thumbnail?.dataUrl ? (
          <img
            src={thumbnail.dataUrl}
            alt=""
            className="block h-full w-full object-cover object-top"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-[var(--surface)]" />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text)]">
        {name}
      </span>
    </div>
  );
}
