import { useState } from "react";
import type { ProjectTreeNode } from "./treeTypes";

export function PickerNode({
  node,
  depth,
  activeId,
  onSelect,
}: {
  node: ProjectTreeNode;
  depth: number;
  activeId: string;
  onSelect: (node: ProjectTreeNode) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = (node.children ?? []).length > 0;
  const isActive = node.name === activeId;

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
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 100ms ease" }}
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          )}
        </span>

        <span className="grid shrink-0 place-items-center text-[#666]">
          {node.kind === "screen" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
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
