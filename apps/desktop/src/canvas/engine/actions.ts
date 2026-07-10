export { createId, cloneDocument, shallowCloneDocument, mutateElementShallow, mutateElementWithStyles } from "./mutations/coreUtils";
export { DEFAULT_SHELL_BACKGROUND, DEFAULT_SHELL_GRID, createBlankDocument, createDraftDocument, createDefaultDocument, updateShellBackground, updateShellGrid, updateCanvasProperties } from "./mutations/documentDefaults";
export { createElementForTool, elementTypeLabel } from "./mutations/elementCreate";
export { insertElement, constrainElement, constrainAll, reparentElements, moveElementToParent, deleteElements, duplicateElements, wrapElements, unwrapElement } from "./mutations/elementHierarchy";
export { fitTextElementToContent, setTextElementSizing, updateElementGeometry, updateElementRotation, updateElementStyles } from "./mutations/elementGeometry";
export { updateElementText, updateElementTextShallow, applyTextRunStyles, updateElementImageSource, renameElement, setElementLocked, setElementVisible, detachInstance } from "./mutations/elementContent";
export { reorderElement, reorderElements, moveElementBefore, bringToFront, bringElementsToFront, sendToBack, sendElementsToBack } from "./mutations/elementOrder";
export { alignElements, distributeElements, nudgeElements, type AlignEdge, type DistributeAxis } from "./mutations/elementAlign";
export {
  makePathNode,
  appendAnchor,
  updateAnchor,
  updateHandle,
  bendSegment,
  setAnchorWidth,
  translateAnchors,
  insertAnchorOnSegment,
  cutSubpathAt,
  deleteAnchor,
  closeSubpath,
  setHandleType,
  setFillRule,
  recomputePathBounds,
  scaledPath,
} from "./mutations/vectorPath";
export { insertSvgDocument, insertSvgPathsAsRoot, flattenElementToPath, applyBooleanToSelection, shapeBuildSubpaths } from "./mutations/vectorOps";
