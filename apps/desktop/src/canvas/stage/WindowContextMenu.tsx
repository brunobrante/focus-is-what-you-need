import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { useCanvasUiVisibility } from "@/canvas/CanvasUiVisibilityContext";
import { useCanvasWindow } from "@/canvas/CanvasWindowContext";

export type WindowMenuState = { x: number; y: number } | null;

/**
 * Right-click menu for canvas windows that have no editor (the References window,
 * and the empty Versions state). It offers only the window/UI actions — Hide this
 * window, Open/Close panels, Hide UI — the same trailing group the full editor
 * context menu shows. Works even when the window has no content.
 */
export function useWindowContextMenu() {
  const [menu, setMenu] = useState<WindowMenuState>(null);
  const onContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };
  return { menu, onContextMenu, closeMenu: () => setMenu(null) };
}

export function WindowContextMenu({
  menu,
  onClose,
}: {
  menu: NonNullable<WindowMenuState>;
  onClose: () => void;
}) {
  const { uiHidden, toggleUiHidden, panelsOpen, togglePanels } = useCanvasUiVisibility();
  const windowInfo = useCanvasWindow();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canHideWindow = !!windowInfo && windowInfo.splitActive;

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

  const items: { label: string; action: () => void }[] = [
    ...(canHideWindow
      ? [{ label: "Hide this window", action: () => { windowInfo!.onHideWindow(windowInfo!.windowKey); onClose(); } }]
      : []),
    ...(uiHidden
      ? []
      : [{ label: panelsOpen ? "Close panels" : "Open panels", action: () => { togglePanels(); onClose(); } }]),
    { label: uiHidden ? "Show UI" : "Hide UI", action: () => { toggleUiHidden(); onClose(); } },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className="context-menu-item"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); item.action(); }}
        >
          <span className="context-menu-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
