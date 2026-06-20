import { IconWindow } from "@/components/icons";

/**
 * Shared "empty screen / empty component" placeholder shown by the snapshot and
 * scene-canvas viewers when there's nothing to render. Previously duplicated
 * byte-for-byte in `Snapshot` and `SceneCanvasViewer`.
 */
export function EmptyPreviewPlaceholder({ kind }: { kind: "screen" | "component" }) {
  return (
    <div className="grid h-full w-full place-items-center text-center">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-strong)] text-[var(--text-faint)]">
          <IconWindow size={16} strokeWidth={1.6} />
        </span>
        <span className="text-[13px] font-medium text-[var(--text-muted)]">
          {kind === "screen" ? "Empty screen" : "Empty component"}
        </span>
      </div>
    </div>
  );
}
