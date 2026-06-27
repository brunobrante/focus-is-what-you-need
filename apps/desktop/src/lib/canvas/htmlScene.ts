export type {
  HtmlCanvasNodeKind,
  HtmlCanvasTag,
  HtmlCanvasBounds,
  HtmlCanvasStyle,
  HtmlCanvasNode,
  HtmlCanvasInstanceRef,
  HtmlCanvasDocument,
  SubjectRootOptions,
  HtmlCanvasLayerMove,
} from "@/domain/canvas/htmlScene/types";
export { HTML_CANVAS_FORMAT, HTML_CANVAS_VERSION } from "@/domain/canvas/htmlScene/types";

export {
  normalizeHtmlCanvasDocument,
  getHtmlCanvasNode,
  getHtmlCanvasChildren,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  updateHtmlCanvasNode,
  updateHtmlCanvasNodeBounds,
  updateHtmlCanvasNodeStyle,
  deleteHtmlCanvasNodeTree,
  duplicateHtmlCanvasNodeTree,
  moveHtmlCanvasNodeLayer,
  reorderHtmlCanvasNode,
  groupHtmlCanvasNodes,
  ungroupHtmlCanvasNode,
  insertHtmlCanvasNode,
  insertHtmlCanvasImageNode,
  ensureHtmlCanvasSubjectRoot,
  ensureHtmlCanvasSubjectRootJSON,
  createDefaultHtmlCanvasDocument,
  createBlankHtmlCanvasDocument,
} from "@/domain/canvas/htmlScene/document";

export { htmlCanvasDocumentFromMockTree } from "@/domain/canvas/htmlScene/mockTree";
export { svgForHtmlCanvasDocument } from "@/domain/canvas/htmlScene/svgRenderer";
export { resolveInstances, stripResolvedInstanceChildren, buildMasterResolver, subjectNodeForDocument } from "@/domain/canvas/htmlScene/resolveInstances";
export type { MasterResolver } from "@/domain/canvas/htmlScene/resolveInstances";
