import type { MouseEvent, ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";

/**
 * The portal dropdown shared by every card action menu (D7): the screen-card
 * toolbar (`CardMenu` / `CardMoreMenu`) and the gallery-card toolbar. The
 * toolbars themselves keep their own distinct chrome; only this menu list — the
 * byte-identical part — is shared.
 */

export type CardMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** Purple "linked" accent — used by the linkable toggle. */
  accent?: boolean;
  onClick: () => void;
};

/** Fixed menu width, used to keep the dropdown clamped on-screen. */
export const CARD_MENU_WIDTH = 176;

/** Places the dropdown below a trigger's rect, clamped to the viewport. */
export function cardMenuPosition(rect: DOMRect): { top: number; left: number } {
  return {
    top: rect.bottom + 8,
    left: Math.min(
      window.innerWidth - CARD_MENU_WIDTH - 8,
      Math.max(8, rect.right - CARD_MENU_WIDTH),
    ),
  };
}

export function CardMenuDropdown({
  menuRef,
  position,
  items,
  onSelect,
}: {
  menuRef: Ref<HTMLDivElement>;
  position: { top: number; left: number };
  items: CardMenuItem[];
  /** Called with the item and the click event so the caller controls dismissal
   *  (some toolbars stop propagation, some do not). */
  onSelect: (item: CardMenuItem, e: MouseEvent) => void;
}) {
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[80] min-w-44 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
      style={{ top: position.top, left: position.left }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onClick={(e) => onSelect(item, e)}
          className={[
            "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] transition-colors",
            item.destructive
              ? "text-[#ff7373] hover:bg-[rgba(255,80,80,0.12)]"
              : item.accent
                ? "hover:bg-[var(--surface-hover)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
          ].join(" ")}
          style={item.accent ? { color: LINKED_INSTANCE_COLOR } : undefined}
        >
          {item.icon ? <span className="grid h-4 w-4 place-items-center">{item.icon}</span> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
