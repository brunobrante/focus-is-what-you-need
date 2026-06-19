import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CANVAS_FEATURES,
  DEFAULT_PREVIEW_SETTINGS,
  MAX_CURRENT_WINDOWS,
  addCanvasWindowToSplit,
  addCurrentToSplit,
  enabledCanvasWindowTypes,
  isCurrentKey,
  normalizeCanvasSplitWindows,
  windowTypeOfKey,
  type CanvasFeatureFlags,
  type CanvasFeatureWindowType,
  type CanvasSplitWindows,
  type CanvasWindowKey,
  type PreviewSettings,
  type SplitMode,
} from "../canvasUtils";
import type { SubjectOwner } from "./useSubjectCanvasWindow";

type SceneOwner = { ownerType: "variant"; ownerId: string } | null;

export function useCanvasWindows({
  versionVariantParam,
  sceneOwner,
}: {
  versionVariantParam: string;
  sceneOwner: SceneOwner;
}) {
  const [activeTab, setActiveTab] = useState<CanvasWindowKey>(
    versionVariantParam ? "versions" : "current",
  );
  const [treeTab, setTreeTab] = useState<CanvasWindowKey>(
    versionVariantParam ? "versions" : "current",
  );
  const [split, setSplit] = useState<SplitMode>("none");
  const [splitWindows, setSplitWindows] = useState<CanvasSplitWindows>(["current", "drafts"]);
  const [extraCurrents, setExtraCurrents] = useState<
    Array<{ key: CanvasWindowKey; subject: SubjectOwner }>
  >([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<PreviewSettings>(DEFAULT_PREVIEW_SETTINGS);
  const [canvasFeatures, setCanvasFeatures] = useState<CanvasFeatureFlags>(() => ({
    ...DEFAULT_CANVAS_FEATURES,
    references: true,
    versions: true,
  }));

  const enabledCanvasTabs = useMemo(
    () => enabledCanvasWindowTypes(canvasFeatures, previewOpen),
    [canvasFeatures, previewOpen],
  );
  const normalizedSplitWindows = useMemo(
    () => normalizeCanvasSplitWindows(splitWindows, enabledCanvasTabs),
    [enabledCanvasTabs, splitWindows],
  );
  const splitActive = split !== "none";

  const isTabKeyEnabled = useCallback(
    (key: CanvasWindowKey) => isCurrentKey(key) || enabledCanvasTabs.includes(windowTypeOfKey(key)),
    [enabledCanvasTabs],
  );

  useEffect(() => {
    if (!versionVariantParam) return;
    setActiveTab("versions");
    setTreeTab("versions");
  }, [versionVariantParam]);

  useEffect(() => {
    if (!isTabKeyEnabled(activeTab)) setActiveTab("current");
    if (!isTabKeyEnabled(treeTab)) setTreeTab("current");
    setSplitWindows((current) => normalizeCanvasSplitWindows(current, enabledCanvasTabs));
    if (split !== "none" && (enabledCanvasTabs.length < 2 || normalizedSplitWindows.length < 2)) {
      setSplit("none");
    } else if (split === "grid" && normalizedSplitWindows.length < 3) {
      setSplit("vertical");
    }
  }, [activeTab, enabledCanvasTabs, isTabKeyEnabled, normalizedSplitWindows.length, split, treeTab]);

  const changeCanvasTab = useCallback(
    (tab: CanvasWindowKey) => {
      const nextTab = isTabKeyEnabled(tab) ? tab : "current";
      setActiveTab(nextTab);
      setTreeTab(nextTab);
      if (split !== "none" && !isCurrentKey(nextTab) && enabledCanvasTabs.length >= 2) {
        setSplitWindows((current) => addCanvasWindowToSplit(current, enabledCanvasTabs, nextTab));
      }
    },
    [enabledCanvasTabs, isTabKeyEnabled, split],
  );

  const focusVersionsTab = useCallback(() => changeCanvasTab("versions"), [changeCanvasTab]);

  const handleAddCurrent = useCallback(() => {
    if (!sceneOwner || sceneOwner.ownerType !== "variant") return;
    const { windows, key } = addCurrentToSplit(splitWindows, enabledCanvasTabs);
    if (!key) return;
    const mirrored: SubjectOwner = { ownerType: "variant", ownerId: sceneOwner.ownerId };
    setExtraCurrents((list) =>
      list.some((entry) => entry.key === key) ? list : [...list, { key, subject: mirrored }],
    );
    setSplitWindows(windows);
    setSplit((mode) => (mode === "none" ? "vertical" : mode));
    setActiveTab(key);
    setTreeTab(key);
  }, [enabledCanvasTabs, sceneOwner, splitWindows]);

  const removeExtraCurrent = useCallback(
    (key: CanvasWindowKey) => {
      setExtraCurrents((list) => list.filter((entry) => entry.key !== key));
      setSplitWindows((current) => current.filter((windowKey) => windowKey !== key));
      if (splitWindows.filter((windowKey) => windowKey !== key && windowKey !== "preview").length < 2) {
        setSplit("none");
      }
      setActiveTab((tab) => (tab === key ? "current" : tab));
      setTreeTab((tab) => (tab === key ? "current" : tab));
    },
    [splitWindows],
  );

  const retargetExtraCurrent = useCallback((key: CanvasWindowKey, subject: SubjectOwner) => {
    setExtraCurrents((list) =>
      list.map((entry) => (entry.key === key ? { ...entry, subject } : entry)),
    );
  }, []);

  const changeSplitMode = useCallback(
    (mode: SplitMode) => {
      if (mode !== "none" && enabledCanvasTabs.length < 2) {
        setSplit("none");
        return;
      }
      const nextMode =
        mode === "grid" && normalizedSplitWindows.length < 3 ? "vertical" : mode;
      setSplit(nextMode);
      if (mode !== "none") {
        setSplitWindows((current) => normalizeCanvasSplitWindows(current, enabledCanvasTabs));
      }
    },
    [enabledCanvasTabs, normalizedSplitWindows.length],
  );

  const changeSplitWindows = useCallback(
    (windows: readonly CanvasWindowKey[]) => {
      setSplitWindows(normalizeCanvasSplitWindows(windows, enabledCanvasTabs));
    },
    [enabledCanvasTabs],
  );

  const updateCanvasFeature = useCallback(
    (feature: CanvasFeatureWindowType, enabled: boolean) => {
      setCanvasFeatures((current) => {
        if (current[feature] === enabled) return current;
        return { ...current, [feature]: enabled };
      });
    },
    [],
  );

  const openPreview = useCallback(() => {
    setPreviewOpen(true);
    if (split === "none") {
      setSplitWindows(["current", "preview"]);
      setSplit("vertical");
      return;
    }
    const enabledWithPreview = enabledCanvasWindowTypes(canvasFeatures, true);
    setSplitWindows((current) => addCanvasWindowToSplit(current, enabledWithPreview, "preview"));
  }, [canvasFeatures, split]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setSplitWindows((current) => current.filter((w) => w !== "preview"));
    if (splitWindows.filter((w) => w !== "preview").length < 2) {
      setSplit("none");
    }
  }, [splitWindows]);

  const togglePreview = useCallback(() => {
    if (previewOpen) closePreview();
    else openPreview();
  }, [closePreview, openPreview, previewOpen]);

  const canAddCurrent =
    Boolean(sceneOwner && sceneOwner.ownerType === "variant") &&
    extraCurrents.length + 1 < MAX_CURRENT_WINDOWS &&
    normalizedSplitWindows.length < MAX_CURRENT_WINDOWS;

  return {
    split,
    splitWindows: normalizedSplitWindows,
    activeTab,
    treeTab,
    extraCurrents,
    previewOpen,
    previewSettings,
    setPreviewSettings,
    canvasFeatures,
    enabledCanvasTabs,
    splitActive,
    canAddCurrent,
    changeCanvasTab,
    focusVersionsTab,
    handleAddCurrent,
    removeExtraCurrent,
    retargetExtraCurrent,
    changeSplitMode,
    changeSplitWindows,
    updateCanvasFeature,
    openPreview,
    closePreview,
    togglePreview,
  };
}
