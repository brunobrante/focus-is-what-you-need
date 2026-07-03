import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { IconChevronDown, IconPlus } from "@/components/icons";

/**
 * The "New ▾" split button + dropdown shell shared by the Screens and
 * Components tabs (D7). The trigger, portal positioning, and dismiss behavior
 * live here; each caller supplies its own menu items via `children`, which
 * receives a `close` callback to dismiss the menu after an action.
 */
export function NewItemPopover({
  children,
}: {
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  useDismissable(open, () => setOpen(false), [rootRef, menuRef]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--text)] px-3 text-[12.5px] font-medium text-[var(--bg)] transition-opacity hover:opacity-85"
      >
        <IconPlus size={13} strokeWidth={2.2} />
        New
        <IconChevronDown size={10} strokeWidth={2.4} className={["transition-transform duration-150", open ? "rotate-180" : ""].join(" ")} />
      </button>
      {open && pos ? createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-[80] w-[190px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
