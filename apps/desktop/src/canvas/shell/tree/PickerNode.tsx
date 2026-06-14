import { useState } from "react";
import type { ProjectTreeNode } from "./treeTypes";
import { IconChevronRight, IconGrid, IconScreen } from "@/components/icons";

export function PickerNode({
  node,
  depth,
  activeId,
  onSelect,
}: {
  node: ProjectTreeNode;
  depth: number;
  // The id of the currently-selected node. Matched by id, not name, so two screens
  // sharing a name don't both highlight as active.
  activeId: string | null;
  onSelect: (node: ProjectTreeNode) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = (node.children ?? []).length > 0;
  const isActive = node.id === activeId;

  return (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-2 border-0 bg-transparent text-left transition-colors duration-75 hover:bg-[#1E1E1E]"
        style={{
          paddingLeft: 10 + depth * 14,
          paddingRight: 10,
          paddingTop: 6,
          paddingBottom: 6,
          background: isActive ? "rgba(255,255,255,0.06)" : undefined,
        }}
        onClick={() => onSelect(node)}
      >
        <span
          className="grid h-4 w-4 shrink-0 place-items-center text-[#555]"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setOpen((v) => !v); }}
        >
          {hasChildren && (
            <IconChevronRight size={10} strokeWidth={2.2} className={open ? "rotate-90 transition-transform duration-100" : "rotate-0 transition-transform duration-100"} />
          )}
        </span>

        <span className="grid shrink-0 place-items-center text-[#666]">
          {node.kind === "screen" ? (
            <IconScreen size={13} strokeWidth={1.7} />
          ) : (
            <IconGrid size={13} strokeWidth={1.7} />
          )}
        </span>

        <span
          className="truncate text-[12.5px]"
          style={{ color: isActive ? "#F2F2F2" : "#AAAAAA", fontWeight: isActive ? 500 : 400 }}
        >
          {node.name}
        </span>
      </button>

      {open && hasChildren && (node.children ?? []).map((child) => (
        <PickerNode
          key={child.id}
          node={child}
          depth={depth + 1}
          activeId={activeId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
