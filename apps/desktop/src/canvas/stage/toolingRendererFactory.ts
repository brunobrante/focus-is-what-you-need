import { createSkiaToolingAdapter } from "./skiaToolingAdapter";
import type { ToolingRendererAdapter, ToolingRendererKind } from "./toolingRenderAdapter";

export function createToolingRendererAdapter(
  _kind: ToolingRendererKind = "skia",
): ToolingRendererAdapter {
  return createSkiaToolingAdapter();
}
