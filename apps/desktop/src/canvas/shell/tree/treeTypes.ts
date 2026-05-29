export type NodeType = "frame" | "component" | "text" | "image" | "ellipse" | "line" | "pen";

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
