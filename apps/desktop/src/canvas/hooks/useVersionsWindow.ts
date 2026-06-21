import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorBridgeReader } from "@/canvas/engine/bridge";
import { buildMasterResolver, canvasDocumentFromHtmlGraphJSON } from "@/canvas/engine/htmlSceneAdapter";
import { peekTable, TABLES } from "@/lib/storage/store";
import { useScene, useVariant } from "@/lib/storage/hooks";
import { createScreenVersion } from "@/lib/storage/repos/screens.repo";
import { duplicateVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import type { ComponentRow, SceneRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import type { VersionModeModalHandle } from "@/components/modals/VersionModeModal";
import type { ProjectTreeNode } from "@/canvas/shell/Tree";
import { findTreeNodeById } from "../canvasUtils";
import { useVersionScenePersistence } from "./useVersionScenePersistence";
import { materializeVersionNodeAsComponent } from "@/application/canvas/canvasMaterializer";

export function useVersionsWindow({
  allVariants,
  currentVariantId,
  versionVariantParam,
  component,
  screen,
  projectComponents,
  projectScreens,
  projectTree,
  projectId,
  projectName,
  flushPendingSave,
  versionModeRef,
  onFocusVersionsTab,
}: {
  allVariants: VariantRow[];
  currentVariantId: string | null;
  versionVariantParam: string;
  component: ComponentRow | null;
  screen: ScreenRow | null;
  projectComponents: ComponentRow[];
  projectScreens: ScreenRow[];
  projectTree: ProjectTreeNode[];
  projectId: string;
  projectName: string;
  flushPendingSave: () => Promise<void>;
  versionModeRef: { current: VersionModeModalHandle | null };
  onFocusVersionsTab: () => void;
}) {
  const getEditor = useEditorBridgeReader();

  const [versionsSubject, setVersionsSubject] = useState<{
    id: string;
    kind: "screen" | "component";
  } | null>(null);

  useEffect(() => {
    if (versionsSubject) return;
    if (component) setVersionsSubject({ id: component.id, kind: "component" });
    else if (screen) setVersionsSubject({ id: screen.id, kind: "screen" });
  }, [component, screen, versionsSubject]);

  const versionsSubjectVariants = useMemo(() => {
    if (!versionsSubject) return [];
    return allVariants
      .filter((v) => v.ownerKind === versionsSubject.kind && v.ownerId === versionsSubject.id)
      .slice()
      .sort((a, b) => a.order - b.order);
  }, [allVariants, versionsSubject]);

  const availableVersions = useMemo(
    () => versionsSubjectVariants.filter((v) => v.order > 0 && v.id !== currentVariantId),
    [versionsSubjectVariants, currentVariantId],
  );

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    versionVariantParam || null,
  );

  useEffect(() => {
    if (versionVariantParam) setSelectedVersionId(versionVariantParam);
  }, [versionVariantParam]);

  useEffect(() => {
    if (versionsSubjectVariants.length === 0) return;
    if (
      selectedVersionId &&
      versionsSubjectVariants.some((v) => v.id === selectedVersionId) &&
      selectedVersionId !== currentVariantId
    ) {
      return;
    }
    setSelectedVersionId(availableVersions[0]?.id ?? null);
  }, [versionsSubjectVariants, availableVersions, selectedVersionId, currentVariantId]);

  const versionsVariants = useMemo(
    () => availableVersions.map((v) => ({ id: v.id, label: variantVersionLabel(v) })),
    [availableVersions],
  );

  const [versionsBackStack, setVersionsBackStack] = useState<
    Array<{ id: string; kind: "screen" | "component"; versionId: string | null }>
  >([]);

  const pushVersionsHistory = useCallback(() => {
    if (!versionsSubject) return;
    setVersionsBackStack((stack) => [
      ...stack,
      { id: versionsSubject.id, kind: versionsSubject.kind, versionId: selectedVersionId },
    ]);
  }, [versionsSubject, selectedVersionId]);

  const selectVersionsSubject = useCallback(
    (node: { id: string; kind: "screen" | "component" }) => {
      setVersionsBackStack([]);
      setVersionsSubject({ id: node.id, kind: node.kind });
    },
    [],
  );

  const versionSceneOwner = selectedVersionId
    ? { ownerType: "variant" as const, ownerId: selectedVersionId }
    : null;

  const { data: versionScene, loading: versionSceneLoading } = useScene(
    versionSceneOwner?.ownerType ?? null,
    versionSceneOwner?.ownerId ?? null,
  );
  const { data: selectedVersionRow } = useVariant(selectedVersionId);

  const versionGraphJSON = versionScene?.graphJSON ?? null;
  const versionsReady = !versionSceneOwner || !versionSceneLoading;
  const versionsStorageKey = selectedVersionId
    ? `desktop-canvas-editor:versions:${selectedVersionId}:v1`
    : "desktop-canvas-editor:versions:none:v1";

  const versionsResolveMaster = useMemo(
    () => buildMasterResolver(peekTable<SceneRow>(TABLES.scenes)),
    [versionGraphJSON],
  );

  const versionsDocument = useMemo(() => {
    if (!selectedVersionId) return undefined;
    return (
      canvasDocumentFromHtmlGraphJSON(versionGraphJSON, {
        promoteSubjectRoot: true,
        resolveMaster: versionsResolveMaster,
      }) ?? undefined
    );
  }, [selectedVersionId, versionGraphJSON, versionsResolveMaster]);

  const versionsCanvasName =
    selectedVersionRow?.name || component?.name || screen?.title || projectName || "Version";

  const { onChange: handleVersionsDocumentChange, flush: flushVersionsSave } =
    useVersionScenePersistence({
      variantId: selectedVersionId,
      ready: versionsReady,
      baseGraphJSON: versionGraphJSON,
      canvasName: versionsCanvasName,
    });

  const versionsSubjectSize = versionsDocument?.canvas;

  const versionsSubjectDisplayName = useMemo<string | undefined>(() => {
    if (!versionsSubject) return undefined;
    if (versionsSubject.kind === "component") {
      return projectComponents.find((c) => c.id === versionsSubject.id)?.name;
    }
    return projectScreens.find((s) => s.id === versionsSubject.id)?.title;
  }, [versionsSubject, projectComponents, projectScreens]);

  const versionsParentNode = useMemo<ProjectTreeNode | null>(() => {
    if (!versionsSubject || versionsSubject.kind !== "component") return null;
    const comp = projectComponents.find((c) => c.id === versionsSubject.id);
    if (!comp) return null;
    if (!comp.parentVariantId && comp.screenId) {
      return projectTree.find((n) => n.id === comp.screenId) ?? null;
    }
    if (comp.parentVariantId) {
      const parentComponent = projectComponents.find(
        (c) => c.activeVariantId === comp.parentVariantId,
      );
      return parentComponent ? findTreeNodeById(projectTree, parentComponent.id) : null;
    }
    return null;
  }, [versionsSubject, projectComponents, projectTree]);

  const versionsBackNode = useMemo<ProjectTreeNode | null>(() => {
    const top = versionsBackStack[versionsBackStack.length - 1];
    if (!top) return versionsParentNode;
    if (top.kind === "screen") {
      const s = projectScreens.find((x) => x.id === top.id);
      return s
        ? { id: s.id, name: s.title, kind: "screen", children: [] }
        : versionsParentNode;
    }
    const c = projectComponents.find((x) => x.id === top.id);
    return c
      ? { id: c.id, name: c.name, kind: "component", children: [] }
      : versionsParentNode;
  }, [versionsBackStack, versionsParentNode, projectScreens, projectComponents]);

  const goBackVersions = useCallback(() => {
    setVersionsBackStack((stack) => {
      const prev = stack[stack.length - 1];
      if (!prev) {
        if (versionsParentNode) {
          setVersionsSubject({ id: versionsParentNode.id, kind: versionsParentNode.kind });
        }
        return stack;
      }
      setVersionsSubject({ id: prev.id, kind: prev.kind });
      setSelectedVersionId(prev.versionId);
      return stack.slice(0, -1);
    });
  }, [versionsParentNode]);

  const handleAddVersion = useCallback(() => {
    const subject = versionsSubject;
    if (!subject) return;
    versionModeRef.current?.open({
      onSelect: async (mode) => {
        if (subject.kind === "component") {
          const mainId = versionsSubjectVariants.find((v) => v.order <= 0)?.id;
          if (!mainId) return;
          await duplicateVariant({
            ownerKind: "component",
            ownerId: subject.id,
            sourceVariantId: mainId,
            name: `Variant ${versionsSubjectVariants.length + 1}`,
            mode,
          });
        } else {
          await createScreenVersion({ screenId: subject.id, mode });
        }
        onFocusVersionsTab();
      },
    });
  }, [versionsSubject, versionsSubjectVariants, versionModeRef, onFocusVersionsTab]);

  const canOpenVersionNode = useCallback(
    (nodeId: string): boolean => {
      const node = getEditor()?.state.document.elements[nodeId];
      return Boolean(node && node.children.length > 0 && !node.instanceOf);
    },
    [getEditor],
  );

  // Stable ref so openCanvasForVersionNode's closure doesn't re-create on every render
  const pushVersionsHistoryRef = useRef(pushVersionsHistory);
  pushVersionsHistoryRef.current = pushVersionsHistory;

  const openCanvasForVersionNode = useCallback(
    (nodeId: string) => {
      if (!selectedVersionId) return;
      const liveDocument = getEditor()?.state.document;
      if (!liveDocument) return;
      void (async () => {
        await flushPendingSave();
        flushVersionsSave();
        const created = await materializeVersionNodeAsComponent({
          versionVariantId: selectedVersionId,
          document: liveDocument,
          versionGraphJSON,
          canvasName: versionsCanvasName,
          nodeId,
          projectId: projectId || null,
        });
        if (created) {
          pushVersionsHistoryRef.current();
          setVersionsSubject({ id: created.id, kind: "component" });
          setSelectedVersionId(created.activeVariantId);
        }
      })();
    },
    [
      selectedVersionId,
      getEditor,
      versionGraphJSON,
      versionsCanvasName,
      flushPendingSave,
      flushVersionsSave,
      projectId,
    ],
  );

  return {
    versionsSubject,
    setVersionsSubject,
    selectedVersionId,
    setSelectedVersionId,
    versionsSubjectVariants,
    availableVersions,
    versionsVariants,
    versionsDocument,
    versionsReady,
    versionsStorageKey,
    versionsCanvasName,
    versionsSubjectSize,
    versionsSubjectDisplayName,
    versionsParentNode,
    versionsBackNode,
    selectVersionsSubject,
    goBackVersions,
    handleAddVersion,
    canOpenVersionNode,
    openCanvasForVersionNode,
    handleVersionsDocumentChange,
  };
}
