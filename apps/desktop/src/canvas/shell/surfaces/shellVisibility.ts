import type { CSSProperties } from "react";
import type { ShellControlVisibility } from "../inspector/ShellTab";

export function shellVisibilityStyle(v: ShellControlVisibility, localHovered: boolean): CSSProperties {
  if (v === "hidden") return { opacity: 0, pointerEvents: "none" };
  if (v === "hover") return { opacity: localHovered ? 1 : 0, transition: "opacity 150ms" };
  return {};
}
