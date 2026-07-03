import { useRef, useState, type ReactNode } from "react";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { IconCheck, IconDuplicate, IconEllipsis, IconFastEdit, IconGlobe, IconGrid, IconMoveTo, IconOpenCanvas, IconTrash, IconZoomIn } from "@/components/icons";
import {
  CardMenuDropdown,
  cardMenuPosition,
  type CardMenuItem as MoreMenuItem,
} from "@/components/ui/CardMenuDropdown";

export type CardMenuButton = {
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

  useDismissable(
    openKey !== null,
    () => {
      setOpenKey(null);
      setMenuPosition(null);
    },
    [rootRef, menuRef],
  );

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
                  setMenuPosition(cardMenuPosition(e.currentTarget.getBoundingClientRect()));
                  setOpenKey((current) => (current === btn.key ? null : btn.key));
                  return;
                }
                btn.onClick?.(e);
              }}
              className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[5px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              {btn.icon}
            </button>
            {btn.menuItems && openKey === btn.key && menuPosition ? (
              <CardMenuDropdown
                menuRef={menuRef}
                position={menuPosition}
                items={btn.menuItems}
                onSelect={(item, e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenKey(null);
                  setMenuPosition(null);
                  item.onClick();
                }}
              />
            ) : null}
          </span>
        </span>
      ))}
    </div>
  );
}

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

  useDismissable(
    open,
    () => {
      setOpen(false);
      setMenuPosition(null);
    },
    [rootRef, menuRef],
  );

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
          setMenuPosition(cardMenuPosition(e.currentTarget.getBoundingClientRect()));
          setOpen((v) => !v);
        }}
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[rgba(20,20,20,0.92)] text-[var(--text-muted)] shadow-[var(--shadow-pop)] backdrop-blur-md transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      >
        {CardMenuIcons.More}
      </button>
      {open && menuPosition ? (
        <CardMenuDropdown
          menuRef={menuRef}
          position={menuPosition}
          items={items}
          onSelect={(item) => {
            setOpen(false);
            setMenuPosition(null);
            item.onClick();
          }}
        />
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
