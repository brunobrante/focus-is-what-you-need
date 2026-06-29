import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { IconImage } from "@/components/icons";
import type { ComponentRow, ScreenRow } from "@/lib/storage/schema";
import { useReferences } from "@/lib/storage/hooks";
import {
  createOrAttachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";
import { ReferenceCard } from "@/components/references/ReferenceCard";
import { CanvasReferenceInspector } from "@/canvas/shell/CanvasReferenceInspector";
import { useReferencesBridge } from "@/canvas/shell/references/ReferencesBridge";
import type { ShellControlVisibility } from "@/canvas/shell/inspector/ShellTab";
import {
  AddReferenceModal,
  type AddReferenceModalHandle,
} from "@/components/modals/AddReferenceModal";
import { useWindowContextMenu, WindowContextMenu } from "@/canvas/stage/WindowContextMenu";

// The current canvas subject: the screen or component being edited. The
// references window shows references attached to exactly this subject, and Add
// attaches new ones to it.
export type CanvasReferencesContext = {
  projectId: string;
  ownerType: "screen" | "component";
  ownerId: string;
  defaultScreenId?: string;
  defaultComponentId?: string;
  screens: ScreenRow[];
  components: ComponentRow[];
};

export function CanvasReferencesWindow({
  active,
  showActiveBorder,
  context,
  onClick,
  shellZoomVisibility = "show",
  expanded = false,
}: {
  active: boolean;
  showActiveBorder: boolean;
  context: CanvasReferencesContext;
  onClick?: () => void;
  shellZoomVisibility?: ShellControlVisibility;
  expanded?: boolean;
}) {
  const { data: references } = useReferences(context.ownerType, context.ownerId);
  const addRef = useRef<AddReferenceModalHandle>(null);
  // Clicking a card enlarges that reference inline (within the canvas), not in a
  // modal. Resolve by id so it survives list changes; falls back to the gallery
  // when the selected reference is removed.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? references.find((r) => r.id === selectedId) ?? null : null;

  // Publish the open reference to the shared bridge so the stage (inspector) and the
  // Layers stack-tree read one loaded stack + one selection. Only the focused window
  // publishes (matters when a split shows two references panes); cleared on unmount.
  const { setReference } = useReferencesBridge();
  useEffect(() => {
    if (active) setReference(selected);
  }, [active, selected, setReference]);
  useEffect(() => () => setReference(null), [setReference]);

  const removeOne = (id: string) =>
    void removeReferenceFromOwner(id, context.ownerType, context.ownerId);

  const { menu, onContextMenu, closeMenu } = useWindowContextMenu();

  return (
    <div
      onContextMenu={onContextMenu}
      className="relative flex flex-1 flex-col overflow-hidden rounded-xl border text-left transition-all duration-150"
      style={{
        borderColor: active && showActiveBorder ? "rgba(13,153,255,0.55)" : "var(--border)",
        backgroundColor: "#171717",
        boxShadow:
          active && showActiveBorder
            ? "0 0 0 1px rgba(13,153,255,0.2) inset, 0 8px 32px rgba(0,0,0,0.4)"
            : "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.4)",
      }}
      // Focus on pointer-down capture so a click anywhere — including over cards
      // or the inspector, whose handlers stop click propagation — still focuses
      // this window.
      onPointerDownCapture={() => onClick?.()}
    >
      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5">
        {selected ? (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#303030] bg-[#1B1B1B]/95 pl-2 pr-2.5 text-[11.5px] font-medium text-[#D8D8D8] shadow-[0_4px_16px_rgba(0,0,0,0.35)] transition-colors duration-100 hover:border-[#3A3A3A] hover:bg-[#222]"
          >
            <ChevronLeft size={14} strokeWidth={2} />
            Back
          </button>
        ) : (
          <>
            <span className="inline-flex h-8 items-center rounded-lg border border-[#303030] bg-[#1B1B1B]/95 px-2.5 text-[11.5px] font-medium text-[#D8D8D8] shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
              References
            </span>
            <button
              type="button"
              aria-label="Add reference"
              onClick={() => addRef.current?.open()}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[#303030] bg-[#1B1B1B]/95 text-[#A6A6A6] shadow-[0_4px_16px_rgba(0,0,0,0.35)] transition-colors duration-100 hover:border-[#3A3A3A] hover:bg-[#222] hover:text-[#E2E2E2]"
            >
              <Plus size={14} strokeWidth={2} />
            </button>
          </>
        )}
      </div>

      {/* Body */}
      {selected ? (
        /* Inspector — image (zoom) or stack (tree + selection), inside the canvas. */
        <div className="absolute inset-0">
          <CanvasReferenceInspector shellZoomVisibility={shellZoomVisibility} expanded={expanded} />
        </div>
      ) : references.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] text-[#888]">
              <IconImage size={17} strokeWidth={1.6} />
            </span>
            <span className="text-[13px] font-semibold text-[#E6E6E6]">No references yet</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                addRef.current?.open();
              }}
              className="mt-1 rounded-lg border border-[#303030] bg-[#1B1B1B] px-3 py-1.5 text-[11.5px] font-medium text-[#D8D8D8] transition-colors hover:border-[#3A3A3A] hover:bg-[#222]"
            >
              Add a reference
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-14">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
          >
            {references.map((reference) => (
              <ReferenceCard
                key={reference.id}
                kind="row"
                reference={reference}
                onClick={() => setSelectedId(reference.id)}
                onRemove={() => removeOne(reference.id)}
              />
            ))}
          </div>
        </div>
      )}

      <AddReferenceModal
        ref={addRef}
        projectId={context.projectId}
        screens={context.screens}
        components={context.components}
        existingReferences={references}
        defaultScreenId={context.defaultScreenId}
        defaultComponentId={context.defaultComponentId}
        onAdd={(input) => createOrAttachReference(input)}
      />

      {menu ? <WindowContextMenu menu={menu} onClose={closeMenu} /> : null}
    </div>
  );
}
