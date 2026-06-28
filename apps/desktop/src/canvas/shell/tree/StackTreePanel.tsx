import { ChevronRight } from "lucide-react";
import type { StackTreeNode } from "@/routes/references/types";
import { countStackTreeNodes } from "@/routes/references/lib/stackHelpers";
import { useReferencesBridge } from "@/canvas/shell/references/ReferencesBridge";

// The Layers panel body when the References window is focused. It renders the open
// reference's stack tree (its recortes/cuts); selecting a node drives the same
// selection the references stage reads, so a click here highlights+scopes that cut
// in the canvas. When no reference is open (gallery) it shows a hint.
export function StackTreePanel() {
  const { reference, loading, stackMode, tree, selectedNodeId, setSelectedNodeId } =
    useReferencesBridge();

  if (!reference) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-[11.5px] leading-relaxed text-[#6B6B6B]">
          Select a reference to see its layers.
        </p>
      </div>
    );
  }

  const count = countStackTreeNodes(tree);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#242424] px-3.5 py-2">
        <p className="m-0 text-[11px] font-medium text-[#9A9A9A]">
          {loading ? "Loading…" : stackMode && count > 0 ? `${count} components` : "No layers"}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && tree.length === 0 ? (
          <p className="px-2 py-3 text-[11.5px] text-[#777]">Loading stack…</p>
        ) : tree.length > 0 ? (
          tree.map((node) => (
            <StackTreeRows
              key={node.component.id}
              node={node}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
            />
          ))
        ) : (
          <div className="mx-1 rounded-[8px] border border-dashed border-[#2C2C2C] px-3 py-4 text-[11.5px] text-[#777]">
            This reference has no layers.
          </div>
        )}
      </div>
    </div>
  );
}

function StackTreeRows({
  node,
  selectedId,
  onSelect,
}: {
  node: StackTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const id = node.component.id;
  const active = selectedId === id;
  const hasChildren = node.children.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={[
          "mb-1 flex min-h-8 w-full items-center gap-2 rounded-[7px] border py-1.5 pr-2 text-left transition-colors",
          active
            ? "border-[#3A3A3A] bg-[#222] text-[#F0F0F0]"
            : "border-transparent bg-transparent text-[#A6A6A6] hover:bg-[#1B1B1B] hover:text-[#E2E2E2]",
        ].join(" ")}
        style={{ paddingLeft: `${8 + node.depth * 14}px` }}
      >
        {hasChildren ? (
          <ChevronRight size={12} className="shrink-0 opacity-60" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-55" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-medium">{node.component.name}</span>
          <span className="block text-[10px] tabular-nums text-[#6E6E6E]">
            {Math.round(node.component.box.w)} × {Math.round(node.component.box.h)}
          </span>
        </span>
      </button>
      {node.children.map((child) => (
        <StackTreeRows
          key={child.component.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
