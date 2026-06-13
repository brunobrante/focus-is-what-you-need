export const HTML_CANVAS_FORMAT = "html-css-canvas";
export const HTML_CANVAS_VERSION = 1;

export type HtmlCanvasNodeKind =
  | "frame"
  | "group"
  | "text"
  | "shape"
  | "image"
  | "icon"
  | "component";

export type HtmlCanvasTag =
  | "div"
  | "section"
  | "header"
  | "footer"
  | "main"
  | "article"
  | "nav"
  | "button"
  | "a"
  | "img"
  | "icon"
  | "span"
  | "p"
  | "h1"
  | "h2";

export type HtmlCanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HtmlCanvasStyle = {
  background: string;
  color: string;
  opacity: number;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted" | "none";
  borderRadius: number;
  shadow: string;
  display: "block" | "flex" | "grid";
  flexDirection: "row" | "column";
  align: "start" | "center" | "end" | "stretch";
  justify: "start" | "center" | "end" | "between";
  gap: number;
  paddingX: number;
  paddingY: number;
  marginX: number;
  marginY: number;
  widthMode: "fixed" | "fill" | "hug";
  heightMode: "fixed" | "fill" | "hug";
  rotation: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  objectFit: "fill" | "contain" | "cover" | "none" | "scale-down";
  overflow: "visible" | "hidden";
};

/**
 * A link from an instance node to the master component it mirrors. When set, the
 * node stores no children of its own — the master's subtree is expanded read-only
 * at render time (see resolveInstances). `variantId` pins the master version shown.
 */
export type HtmlCanvasInstanceRef = {
  componentId: string;
  variantId: string;
};

export type HtmlCanvasNode = {
  id: string;
  parentId: string | null;
  name: string;
  kind: HtmlCanvasNodeKind;
  tag: HtmlCanvasTag;
  cssId: string;
  className: string;
  order: number;
  bounds: HtmlCanvasBounds;
  style: HtmlCanvasStyle;
  text: string | null;
  imageUrl: string | null;
  appearance: "rect" | "ellipse" | "line";
  visible: boolean;
  locked: boolean;
  // Non-null only on linked instance nodes. Plain content nodes leave this null.
  instanceOf: HtmlCanvasInstanceRef | null;
};

export type HtmlCanvasDocument = {
  format: typeof HTML_CANVAS_FORMAT;
  version: typeof HTML_CANVAS_VERSION;
  rootId: string;
  viewport: {
    width: number;
    height: number;
  };
  nodes: HtmlCanvasNode[];
  updatedAt: number;
};

export type SubjectRootOptions = {
  wrapperName?: string;
  subjectLocked?: boolean;
};

export type HtmlCanvasLayerMove = "front" | "back" | "forward" | "backward";
