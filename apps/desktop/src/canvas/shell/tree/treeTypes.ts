export type NodeType = "frame" | "component" | "rect" | "text" | "image" | "icon" | "ellipse" | "line" | "arrow" | "polygon" | "star" | "pen" | "path" | "svg";

export type Node = {
  id: string;
  name: string;
  type: NodeType;
  visible?: boolean;
  locked?: boolean;
  children?: Node[];
  // True when this node is a linked component instance (rendered purple, read-only).
  linked?: boolean;
  // The master variant this instance points at — used by "go to component".
  instanceVariantId?: string;
};

// Where a dragged layer row will land relative to the row it is hovering:
// "before"/"after" reorder as siblings, "inside" nests it as a child.
export type DropMode = "before" | "after" | "inside";

export type DeviceType = "mobile" | "tablet" | "desktop";

export type ProjectTreeNode = {
  id: string;
  name: string;
  kind: "screen" | "component";
  children?: ProjectTreeNode[];
};
