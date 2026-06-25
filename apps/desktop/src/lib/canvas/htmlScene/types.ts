import type { Box } from "@/domain/canvas/geometry";
import type { BlendMode, Effect } from "@/domain/canvas/types";
import type { Fill } from "@/domain/canvas/fill";

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

// Canonical box vocabulary (see domain/canvas/geometry Box).
export type HtmlCanvasBounds = Box;

export type HtmlCanvasStyle = {
  background: string;
  color: string;
  // System Design token bindings ($$ref, e.g. "colors:c-primary"). Persisted
  // alongside the resolved literal above, which stays the fallback. Optional so
  // unbound styles keep their exact current shape.
  backgroundRef?: string;
  colorRef?: string;
  borderColorRef?: string;
  opacity: number;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted" | "double" | "none";
  borderRadius: number;
  // Inspector → Appearance panel. Optional + additive; absent on legacy scenes.
  // blendMode → mix-blend-mode; isolation → isolation: isolate ("Normal" group
  // blending); cornerRadii → per-corner radii [tl, tr, br, bl].
  blendMode?: BlendMode;
  isolation?: "isolate";
  cornerRadii?: [number, number, number, number];
  /** Inspector → Border/Stroke panel. Optional + additive; absent on legacy scenes. */
  borderAlign?: "inside" | "outside";
  // Text stroke + underline (text nodes only). Optional + additive.
  textStrokeWidth?: number;
  textStrokeColor?: string;
  textStrokeColorRef?: string;
  textStrokePaintOrder?: "over" | "under";
  underline?: boolean;
  underlineStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
  underlineColor?: string;
  underlineColorRef?: string;
  underlineThickness?: number;
  underlineOffset?: number;
  shadow: string;
  /** Inspector → Effects panel. Optional + additive; absent on legacy scenes. */
  effects?: Effect[];
  /** Inspector → Fill panel — the typed, stackable fill list. Optional + additive;
   *  absent means the simple `background` above is the fill. See domain/canvas/fill.ts. */
  fills?: Fill[];
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
  textAlign: "left" | "center" | "right" | "justify";
  // Typography panel (text nodes only). Optional + additive; absent on legacy scenes.
  fontStyle?: "normal" | "italic";
  lineHeight?: number; // unitless; absent = Auto (`line-height: normal`)
  letterSpacing?: number; // percent → em at compile time
  verticalAlign?: "top" | "middle" | "bottom";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  lineThrough?: boolean;
  textBoxTrim?: boolean;
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
