// Defined in the domain layer (see the file for why); re-exported here so the many
// existing `@/lib/data/types` importers keep working unchanged.
export type { ProjectType } from "@/domain/canvas/projectType";
import type { ProjectType } from "@/domain/canvas/projectType";

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
// Scope of a mock-seed ProjectComponent. Distinct from the live
// `ComponentScope` in lib/storage/defaults ("workspace"|"project"|"screen"|
// "nested"): both once shared the name "ComponentScope" and both carry a
// "screen" member, so a wrong import compiled silently (D6). Renamed to keep
// the two from colliding.
export type MockComponentScope = "global" | "screen";

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
  scope: MockComponentScope;
  screens: string[];
};

export type Reference = {
  id: string;
  title: string;
  source: string;
  origin: "gallery" | "upload" | "url";
  thumb: string;
};
