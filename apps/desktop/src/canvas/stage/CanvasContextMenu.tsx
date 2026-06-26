import { useEffect, useRef } from "react";
import {
  bringToFront,
  deleteElements,
  duplicateElements,
  reorderElement,
  sendToBack,
  setElementLocked,
  setElementVisible
} from "@/canvas/engine/actions";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { useEditor } from "@/canvas/engine/store";
import type { CanvasDocument } from "@/canvas/engine/types";

export type ContextMenuState = {
  x: number;
  y: number;
  targetId: string | null;
} | null;

type MenuItem =
  | { type: "action"; label: string; shortcut?: string; disabled?: boolean; action: () => void }
  | { type: "separator" };

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const modLabel = isMac ? "⌘" : "Ctrl+";

export function CanvasContextMenu({ menu, onClose }: { menu: NonNullable<ContextMenuState>; onClose: () => void }) {
  const { state, dispatch, clipboard } = useEditor();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useDismissable(true, onClose, [menuRef], { capture: true });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let adjustedX = menu.x;
    let adjustedY = menu.y;
    if (rect.right > vw - 8) adjustedX = vw - rect.width - 8;
    if (rect.bottom > vh - 8) adjustedY = vh - rect.height - 8;
    if (adjustedX !== menu.x || adjustedY !== menu.y) {
      el.style.left = `${adjustedX}px`;
      el.style.top = `${adjustedY}px`;
    }
  }, [menu.x, menu.y]);

  const selectedIds = state.selectedIds;
  const hasSelection = selectedIds.length > 0;
  const singleId = selectedIds.length === 1 ? selectedIds[0] : null;
  const singleNode = singleId ? state.document.elements[singleId] : null;

  const commit = (doc: CanvasDocument, ids?: string[]) => {
    dispatch({ type: "commitDocument", document: doc, selectedIds: ids ?? state.selectedIds });
    onClose();
  };

  const items: MenuItem[] = [
    { type: "action", label: "Copy", shortcut: `${modLabel}C`, disabled: !hasSelection, action: () => { clipboard.copy(state.document, selectedIds); onClose(); } },
    { type: "action", label: "Paste", shortcut: `${modLabel}V`, disabled: !clipboard.has(), action: () => { const r = clipboard.paste(state.document); if (r) commit(r.document, r.selectedIds); else onClose(); } },
    { type: "action", label: "Duplicate", shortcut: `${modLabel}D`, disabled: !hasSelection, action: () => { const r = duplicateElements(state.document, selectedIds); commit(r.document, r.selectedIds); } },
    { type: "separator" },
    { type: "action", label: "Bring to Front", shortcut: "]", disabled: !singleNode, action: () => { if (singleId) commit(bringToFront(state.document, singleId)); } },
    { type: "action", label: "Bring Forward", disabled: !singleNode, action: () => { if (singleId) commit(reorderElement(state.document, singleId, "forward")); } },
    { type: "action", label: "Send Backward", disabled: !singleNode, action: () => { if (singleId) commit(reorderElement(state.document, singleId, "backward")); } },
    { type: "action", label: "Send to Back", shortcut: "[", disabled: !singleNode, action: () => { if (singleId) commit(sendToBack(state.document, singleId)); } },
    { type: "separator" },
    ...(singleNode ? [
      { type: "action" as const, label: singleNode.locked ? "Unlock" : "Lock", action: () => commit(setElementLocked(state.document, singleId!, !singleNode.locked)) },
      { type: "action" as const, label: singleNode.visible === false ? "Show" : "Hide", action: () => commit(setElementVisible(state.document, singleId!, singleNode.visible === false)) },
      { type: "separator" as const },
    ] : []),
    { type: "action", label: "Delete", shortcut: "Del", disabled: !hasSelection, action: () => commit(deleteElements(state.document, selectedIds), []) },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === "separator" ? (
          <div key={`sep-${i}`} className="context-menu-separator" />
        ) : (
          <button
            key={item.label}
            className="context-menu-item"
            disabled={item.disabled}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); item.action(); }}
          >
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}
