import { IconImage } from "@/components/icons";
import { findStackNode } from "@/routes/references/lib/stackHelpers";
import { useReferencesBridge } from "@/canvas/shell/references/ReferencesBridge";
import { EmptyState } from "./InsComponents";

// The Element tab body when the References window is focused: the selected stack
// node's preview + name + type + size. Reads the shared ReferencesBridge, so it
// stays in sync with the Layers stack tree and the references canvas selection.
// First pass — kept deliberately small; richer reference editing comes later.
export function ReferencesElementTab() {
  const { reference, stackMode, tree, urls, selectedNodeId } = useReferencesBridge();

  if (!reference) {
    return <EmptyState title="No reference open" body="Open a reference to inspect its layers." />;
  }

  const node = stackMode && selectedNodeId ? findStackNode(tree, selectedNodeId) : null;
  if (!node) {
    return <EmptyState title="No layer selected" body="Select a layer in the tree or canvas." />;
  }

  const url = urls[node.component.id];

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="grid min-h-[140px] place-items-center overflow-hidden rounded-[8px] border border-[#2A2A2A] bg-[#0E0E0E] p-2">
        {url ? (
          <img
            src={url}
            alt={node.component.name}
            className="max-h-[200px] max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <IconImage size={22} strokeWidth={1.4} className="text-[#666]" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 truncate text-[12.5px] font-semibold leading-snug text-[#EDEDED]">
          {node.component.name}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="rounded border border-[#2C2C2C] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.3px] text-[#8A8A8A]">
            {node.component.type}
          </span>
          <span className="text-[10.5px] tabular-nums text-[#7E7E7E]">
            {Math.round(node.component.box.w)} × {Math.round(node.component.box.h)}
          </span>
        </div>
      </div>
    </div>
  );
}
