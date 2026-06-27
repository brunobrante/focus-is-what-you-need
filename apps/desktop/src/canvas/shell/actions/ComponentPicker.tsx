import { useEffect, useState } from "react";
import { IconChevronLeft, IconClose, IconSearch } from "@/components/icons";
import { useEditorBridgeReader } from "@/canvas/engine/bridge";
import { listLinkableComponents } from "@/lib/storage/repos/components.repo";
import { getVariantFrameSize } from "@/lib/storage/repos/scenes.repo";
import { getWorkspaceForProject } from "@/lib/storage/repos/workspace.repo";
import { insertElement } from "@/canvas/engine/mutations/elementHierarchy";
import { buildLinkedInstanceNode } from "@/canvas/engine/mutations/buildLinkedInstanceNode";
import { buildMasterResolver, withResolvedInstances } from "@/canvas/engine/htmlSceneAdapter";
import { scopeOf, sourceScopeIcon, SOURCE_SCOPE_LABEL } from "@/components/component/componentSource";
import { peekTable, TABLES } from "@/lib/storage/store";
import { parentVariantIdOf, screenIdOfComponent } from "@/application/graph/componentOwnership";
import type { ComponentRow, SceneRow } from "@/lib/storage/schema";

export type ComponentPickerContext = {
  projectId: string | null;
  openComponentId: string | null;
  graphJSON: string | null;
  canvasName: string;
  excludeScreenId: string | null;
  // The variant whose scene is being edited. A component native to this scene (a nested
  // component owned by this variant) must not be offered/inserted as a linked instance —
  // it would render purple/locked in its own origin.
  excludeParentVariantId: string | null;
};

// A master is "native" to the scene being edited when its origin owner IS that scene —
// inserting a link to it there would create a purple/locked instance in its own origin.
function isNativeToCurrentScene(
  row: Pick<ComponentRow, "id" | "screenId" | "parentVariantId">,
  ctx: ComponentPickerContext,
): boolean {
  const screenId = screenIdOfComponent(row.id) ?? row.screenId;
  const parentVariantId = parentVariantIdOf(row.id) ?? row.parentVariantId;
  return (
    row.id === ctx.openComponentId ||
    (ctx.excludeScreenId != null && screenId === ctx.excludeScreenId) ||
    (ctx.excludeParentVariantId != null && parentVariantId === ctx.excludeParentVariantId)
  );
}

export function ComponentPicker({
  componentPicker,
  onBack,
  onClose,
}: {
  componentPicker: ComponentPickerContext | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const getEditor = useEditorBridgeReader();
  const [items, setItems] = useState<ComponentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const projectId = componentPicker?.projectId ?? null;
      const workspace = projectId ? await getWorkspaceForProject(projectId) : null;
      const rows = await listLinkableComponents({ projectId, workspaceId: workspace?.id ?? null });
      if (cancelled) return;
      setItems(componentPicker ? rows.filter((row) => !isNativeToCurrentScene(row, componentPicker)) : rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [
    componentPicker?.projectId,
    componentPicker?.openComponentId,
    componentPicker?.excludeScreenId,
    componentPicker?.excludeParentVariantId,
  ]);

  const insert = async (master: ComponentRow) => {
    const editor = getEditor();
    if (!editor) return;
    // Defensive last line: never drop a self-instance even if one slipped past the list
    // filter — a master native to the current scene would render purple in its own origin.
    if (componentPicker && isNativeToCurrentScene(master, componentPicker)) return;
    const size = await getVariantFrameSize(master.activeVariantId);
    const doc = editor.state.document;
    const node = buildLinkedInstanceNode({
      componentId: master.id,
      variantId: master.activeVariantId,
      name: master.name,
      size,
      canvas: doc.canvas,
    });
    const resolveMaster = buildMasterResolver(peekTable<SceneRow>(TABLES.scenes));
    const resolved = withResolvedInstances(
      insertElement(doc, node),
      componentPicker?.graphJSON ?? null,
      componentPicker?.canvasName ?? "Canvas",
      resolveMaster,
    );
    editor.dispatch({ type: "commitDocument", document: resolved, selectedIds: [node.id] });
    onClose();
  };

  const q = search.trim().toLowerCase();
  const filtered = items.filter((c) => !q || c.name.toLowerCase().includes(q));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex h-7 shrink-0 items-center justify-between px-1">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A] transition-colors duration-100 hover:text-[#8E8E8E]"
        >
          <IconChevronLeft />
          Add components
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={onBack}
          className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
        >
          <IconClose size={11} strokeWidth={2} />
        </button>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-[#2E2E2E] bg-[#252525] px-2.5">
        <IconSearch size={11} strokeWidth={1.8} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search components…"
          className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
        {loading ? (
          <div className="px-2 py-2 text-[11px] text-[#555]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-[#555]">
            {items.length === 0
              ? "No linkable components yet. Create a project or workspace component to link it here."
              : "No components found."}
          </div>
        ) : (
          <div className="space-y-px pb-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void insert(c)}
                className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-[90ms] hover:bg-[#2A2A2A]"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center text-[#8E8E8E]">
                  {sourceScopeIcon(scopeOf(c), { size: 12, strokeWidth: 1.8 })}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#CFCFCF]">{c.name}</span>
                <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A]">
                  {SOURCE_SCOPE_LABEL[scopeOf(c)]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
