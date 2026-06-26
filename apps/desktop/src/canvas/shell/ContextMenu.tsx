import { useRef } from "react";
import { useDismissable } from "@/lib/hooks/useDismissable";

export type ContextMenuItem =
  | { kind: "separator" }
  | {
      kind: "item";
      label: string;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    };

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useDismissable(true, onClose, [ref]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[20] min-w-[200px] rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-1 text-[12px] text-[#F2F2F2]"
      style={{
        left: x,
        top: y,
        boxShadow: "0 14px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      {items.map((item, index) => {
        if (item.kind === "separator") {
          return <div key={`sep-${index}`} aria-hidden className="my-1 h-px bg-[#2C2C2C]" />;
        }
        return (
          <button
            key={`item-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12px] disabled:cursor-not-allowed"
            style={{
              color: item.disabled
                ? "#5F5F5F"
                : item.danger
                  ? "#FF7676"
                  : "#F2F2F2",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.style.background = "#2A2A2A";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span>{item.label}</span>
            {item.shortcut ? (
              <span className="text-[11px] text-[#7A7A7A]" style={{ fontFeatureSettings: '"tnum"' }}>
                {item.shortcut}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
