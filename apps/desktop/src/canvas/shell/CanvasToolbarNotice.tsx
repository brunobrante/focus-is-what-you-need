import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useEditorBridge } from "@/canvas/engine/bridge";
import type { CanvasNotice } from "@/canvas/engine/noticeStore";
import { IconCheck } from "@/components/icons";

const VISIBLE_MS = 1800;

/**
 * A small transient confirmation pill anchored above the canvas toolbar (e.g.
 * "Wrapper added"). Wrapper elements paint nothing on the canvas, so creating
 * one gives no visible feedback — this surfaces that the action took effect.
 *
 * The notice lives on the editor's notice store; the toolbar renders outside
 * EditorProvider, so the store is reached through the editor bridge.
 */
export function CanvasToolbarNotice() {
  const noticeStore = useEditorBridge((value) => value?.noticeStore ?? null);

  const subscribe = useCallback(
    (listener: () => void) => (noticeStore ? noticeStore.subscribe(listener) : () => {}),
    [noticeStore],
  );
  const getSnapshot = useCallback(
    () => (noticeStore ? noticeStore.get() : null),
    [noticeStore],
  );
  const notice = useSyncExternalStore<CanvasNotice | null>(subscribe, getSnapshot, () => null);

  const [visible, setVisible] = useState(false);
  // A new token means a fresh `show()` call — replay the fade-in / auto-hide even
  // when the message text is unchanged.
  const token = notice?.token ?? null;
  useEffect(() => {
    if (token === null) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(id);
  }, [token]);

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#2C2C2C] bg-[#1E1E1E] px-2.5 py-1.5 text-[12px] font-medium text-[#E8E8E8] transition-all duration-200 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)" }}
    >
      <span className="grid h-4 w-4 place-items-center rounded-full bg-[#0D99FF] text-white">
        <IconCheck />
      </span>
      {notice.message}
    </div>
  );
}
