export { createId, cloneDocument, shallowCloneDocument, mutateElementShallow, mutateElementWithStyles } from "./mutations/coreUtils";
export { DEFAULT_SHELL_BACKGROUND, DEFAULT_SHELL_GRID, createBlankDocument, createDraftDocument, createDefaultDocument, updateShellBackground, updateShellGrid, updateCanvasProperties } from "./mutations/documentDefaults";
export { createElementForTool, elementTypeLabel } from "./mutations/elementCreate";
export { insertElement, constrainElement, constrainAll, reparentElements, moveElementToParent, deleteElements, duplicateElements, wrapElements } from "./mutations/elementHierarchy";
export { fitTextElementToContent, setTextElementSizing, updateElementGeometry, updateElementRotation, updateElementStyles } from "./mutations/elementGeometry";
export { updateElementText, updateElementTextShallow, updateElementImageSource, renameElement, setElementLocked, setElementVisible, detachInstance } from "./mutations/elementContent";
export { reorderElement, moveElementBefore, bringToFront, sendToBack } from "./mutations/elementOrder";
export {
  makePathNode,
  appendAnchor,
  updateAnchor,
  updateHandle,
  insertAnchorOnSegment,
  deleteAnchor,
  closeSubpath,
  setHandleType,
  setFillRule,
  recomputePathBounds,
  scaledPath,
} from "./mutations/vectorPath";
export { insertSvgDocument, insertSvgPathsAsRoot, flattenElementToPath, applyBooleanToSelection } from "./mutations/vectorOps";
