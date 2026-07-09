import { useEffect, useRef } from "react";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { useEditor } from "@/canvas/engine/store";
import { useCanvasCommands } from "@/canvas/shell/useCanvasCommands";
import { useCanvasUiVisibility } from "@/canvas/CanvasUiVisibilityContext";
import { useCanvasWindow } from "@/canvas/CanvasWindowContext";

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
  const editor = useEditor();
  const { state, clipboard } = editor;
  // Same engine-command layer as the layers tree's menu, so both menus offer
  // the identical action set (copy/paste, ordering, align/distribute, ungroup).
  const commands = useCanvasCommands(editor, onClose);
  const { uiHidden, toggleUiHidden, panelsOpen, togglePanels } = useCanvasUiVisibility();
  const windowInfo = useCanvasWindow();
  const canHideWindow = !!windowInfo && windowInfo.splitActive;
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

  const items: MenuItem[] = [
    { type: "action", label: "Copy", shortcut: `${modLabel}C`, disabled: !hasSelection, action: commands.copy },
    { type: "action", label: "Paste", shortcut: `${modLabel}V`, disabled: !clipboard.has(), action: commands.paste },
    { type: "action", label: "Duplicate", shortcut: `${modLabel}D`, disabled: !hasSelection, action: commands.duplicate },
    { type: "separator" },
    { type: "action", label: "Bring to Front", shortcut: "]", disabled: !hasSelection, action: commands.bringToFront },
    { type: "action", label: "Bring Forward", disabled: !hasSelection, action: commands.bringForward },
    { type: "action", label: "Send Backward", disabled: !hasSelection, action: commands.sendBackward },
    { type: "action", label: "Send to Back", shortcut: "[", disabled: !hasSelection, action: commands.sendToBack },
    { type: "separator" },
    // Align / distribute (G1) — same gating as the layers tree's menu.
    ...(selectedIds.length >= 2 ? [
      { type: "action" as const, label: "Align left", action: () => commands.align("left") },
      { type: "action" as const, label: "Align horizontal centers", action: () => commands.align("hcenter") },
      { type: "action" as const, label: "Align right", action: () => commands.align("right") },
      { type: "action" as const, label: "Align top", action: () => commands.align("top") },
      { type: "action" as const, label: "Align vertical centers", action: () => commands.align("vcenter") },
      { type: "action" as const, label: "Align bottom", action: () => commands.align("bottom") },
      ...(selectedIds.length >= 3 ? [
        { type: "action" as const, label: "Distribute horizontally", action: () => commands.distribute("horizontal") },
        { type: "action" as const, label: "Distribute vertically", action: () => commands.distribute("vertical") },
      ] : []),
      { type: "separator" as const },
    ] : []),
    ...(singleNode && singleNode.children.length > 0 ? [
      { type: "action" as const, label: "Ungroup", shortcut: `${modLabel}⇧G`, action: commands.unwrap },
      { type: "separator" as const },
    ] : []),
    ...(singleNode ? [
      { type: "action" as const, label: singleNode.locked ? "Unlock" : "Lock", action: () => commands.setLocked(!singleNode.locked) },
      { type: "action" as const, label: singleNode.visible === false ? "Show" : "Hide", action: () => commands.setVisible(singleNode.visible === false) },
      { type: "separator" as const },
    ] : []),
    { type: "action", label: "Delete", shortcut: "Del", disabled: !hasSelection, action: commands.remove },
    { type: "separator" },
    ...(canHideWindow
      ? [{ type: "action" as const, label: "Hide this window", action: () => { windowInfo!.onHideWindow(windowInfo!.windowKey); onClose(); } }]
      : []),
    ...(uiHidden
      ? []
      : [{ type: "action" as const, label: panelsOpen ? "Close panels" : "Open panels", action: () => { togglePanels(); onClose(); } }]),
    { type: "action", label: uiHidden ? "Show UI" : "Hide UI", action: () => { toggleUiHidden(); onClose(); } },
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
