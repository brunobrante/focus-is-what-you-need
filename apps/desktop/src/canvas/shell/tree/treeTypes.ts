export type NodeType = "frame" | "component" | "rect" | "text" | "image" | "icon" | "ellipse" | "line" | "arrow" | "polygon" | "star" | "pen";

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

export type DeviceType = "mobile" | "tablet" | "desktop";

export type ProjectTreeNode = {
  id: string;
  name: string;
  kind: "screen" | "component";
  children?: ProjectTreeNode[];
};
