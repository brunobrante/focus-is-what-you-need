export type NodeType = "frame" | "component" | "rect" | "text" | "image" | "ellipse" | "line" | "arrow" | "polygon" | "star" | "pen";

export type Node = {
  id: string;
  name: string;
  type: NodeType;
  visible?: boolean;
  locked?: boolean;
  children?: Node[];
};

export type DeviceType = "mobile" | "tablet" | "desktop";

export type ProjectTreeNode = {
  id: string;
  name: string;
  kind: "screen" | "component";
  children?: ProjectTreeNode[];
};
