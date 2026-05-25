import { createPixiToolingAdapter } from "./pixiToolingAdapter";
import { createSkiaToolingAdapter } from "./skiaToolingAdapter";
import type { ToolingRendererAdapter, ToolingRendererKind } from "./toolingRenderAdapter";

export function createToolingRendererAdapter(
  kind: ToolingRendererKind = "pixi",
): ToolingRendererAdapter {
  switch (kind) {
    case "pixi":
      return createPixiToolingAdapter();
    case "skia":
      return createSkiaToolingAdapter();
  }
}
