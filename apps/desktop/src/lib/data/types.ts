export type ProjectType = "desktop" | "tablet" | "mobile";

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export const PROJECT_TYPE_DIMS: Record<ProjectType, string> = {
  desktop: "1440 × 900",
  tablet: "820 × 1180",
  mobile: "390 × 844",
};

export type ScreenVariant =
  | "empty"
  | "hero"
  | "list"
  | "detail"
  | "form"
  | "profile"
  | "blank";
export type ComponentVariant =
  | "cheader"
  | "chero"
  | "cbtn"
  | "cinput"
  | "ccards"
  | "csidebar"
  | "cmodal"
  | "cfooter";

export type ComponentKind = "Layout" | "Atom" | "Section" | "Pattern" | "Overlay" | "Custom";
export type ComponentScope = "global" | "screen";

export type Project = {
  id: string;
  name: string;
  type: ProjectType;
  screens: number;
  updated: string;
};

export type Screen = {
  id: string;
  title: string;
  variant: ScreenVariant;
};

export type ProjectComponent = {
  id: string;
  title: string;
  kind: ComponentKind;
  variant: ComponentVariant;
  scope: ComponentScope;
  screens: string[];
};

export type Reference = {
  id: string;
  title: string;
  source: string;
  origin: "gallery" | "upload" | "url";
  thumb: string;
};
