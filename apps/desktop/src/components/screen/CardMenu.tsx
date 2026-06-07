import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconDuplicate, IconEllipsis, IconFastEdit, IconGlobe, IconGrid, IconMoveTo, IconOpenCanvas, IconTrash, IconZoomIn } from "@/components/icons";

type CardMenuButton = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  menuItems?: MoreMenuItem[];
};

export function CardMenu({ buttons }: { buttons: CardMenuButton[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openKey) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpenKey(null);
        setMenuPosition(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenKey(null);
        setMenuPosition(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openKey]);

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Actions"
      className={[
        "pointer-events-none absolute bottom-2 left-1/2 z-[2] flex -translate-x-1/2 translate-y-1.5 items-center gap-0 rounded-md border border-[var(--border-strong)] bg-[rgba(20,20,20,0.92)] p-1 opacity-0 backdrop-blur-md transition-[opacity,transform] duration-[120ms] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100",
        openKey ? "!pointer-events-auto !translate-y-0 !opacity-100" : "",
      ].join(" ")}
    >
      {buttons.map((btn, i) => (
        <span key={btn.key} className="contents">
          {i > 0 ? <span aria-hidden className="mx-px h-3.5 w-px bg-[var(--border)]" /> : null}
          <span className="relative">
            <button
              type="button"
              aria-label={btn.label}
              aria-haspopup={btn.menuItems ? "menu" : undefined}
              aria-expanded={btn.menuItems ? openKey === btn.key : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.menuItems) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const width = 176;
                  setMenuPosition({
                    top: rect.bottom + 8,
                    left: Math.min(
                      window.innerWidth - width - 8,
                      Math.max(8, rect.right - width),
                    ),
                  });
                  setOpenKey((current) => (current === btn.key ? null : btn.key));
                  return;
                }
                btn.onClick?.(e);
              }}
              className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[5px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              {btn.icon}
            </button>
            {btn.menuItems && openKey === btn.key && menuPosition ? createPortal(
              <div
                ref={menuRef}
                role="menu"
                className="fixed z-[80] min-w-44 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                {btn.menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenKey(null);
                      setMenuPosition(null);
                      item.onClick();
                    }}
                    className={[
                      "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] transition-colors",
                      item.destructive
                        ? "text-[#ff7373] hover:bg-[rgba(255,80,80,0.12)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    {item.icon ? <span className="grid h-4 w-4 place-items-center">{item.icon}</span> : null}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>,
              document.body,
            ) : null}
          </span>
        </span>
      ))}
    </div>
  );
}

type MoreMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onClick: () => void;
};

export function CardMoreMenu({
  items,
  label = "More options",
}: {
  items: MoreMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
        setMenuPosition(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setMenuPosition(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={[
        "absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-focus-within:opacity-100",
        open ? "!pointer-events-auto !opacity-100" : "",
      ].join(" ")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const width = 176;
          setMenuPosition({
            top: rect.bottom + 8,
            left: Math.min(
              window.innerWidth - width - 8,
              Math.max(8, rect.right - width),
            ),
          });
          setOpen((v) => !v);
        }}
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[rgba(20,20,20,0.92)] text-[var(--text-muted)] shadow-[var(--shadow-pop)] backdrop-blur-md transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      >
        {CardMenuIcons.More}
      </button>
      {open && menuPosition ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[80] min-w-44 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setMenuPosition(null);
                item.onClick();
              }}
              className={[
                "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] transition-colors",
                item.destructive
                  ? "text-[#ff7373] hover:bg-[rgba(255,80,80,0.12)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {item.icon ? <span className="grid h-4 w-4 place-items-center">{item.icon}</span> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export const CardMenuIcons = {
  Open: <IconGrid size={13} strokeWidth={1.6} />,
  Canvas: <IconOpenCanvas size={13} strokeWidth={1.6} />,
  More: <IconEllipsis size={13} />,
  Check: <IconCheck size={13} strokeWidth={1.8} />,
  Duplicate: <IconDuplicate size={13} strokeWidth={1.6} />,
  Zoom: <IconZoomIn size={13} strokeWidth={1.8} />,
  Trash: <IconTrash size={13} strokeWidth={1.7} />,
  FastEdit: <IconFastEdit size={13} strokeWidth={1.7} />,
  MoveTo: <IconMoveTo size={13} strokeWidth={1.7} />,
  MakeGlobal: <IconGlobe size={13} strokeWidth={1.7} />,
};
