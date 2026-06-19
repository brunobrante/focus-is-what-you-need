import type { CanvasProperties, ElementNode } from "../types";
import { createId } from "./coreUtils";
import { roundPixel } from "../geometry";

/**
 * Build a bare linked-instance node to drop onto the current frame. The node
 * carries only the `instanceOf` link and its placement — the master's content is
 * inlined read-only at display time by the scene resolver, and the save adapter
 * strips those resolved children, so the persisted form stays bare.
 *
 * The instance is centered in the frame and sized to the master's intrinsic
 * bounds (with a sensible fallback). The root is left **unlocked** so it can be
 * moved/resized as a whole on the canvas, exactly like a version-created instance;
 * its inlined master content is read-only (resolved at display time) and the
 * inspector treats the instance as read-only. The master is edited via
 * "go to component".
 */
export function buildLinkedInstanceNode(input: {
  componentId: string;
  variantId: string;
  name: string;
  size: { width: number; height: number } | null;
  canvas: CanvasProperties;
}): ElementNode {
  const width = input.size?.width && input.size.width > 0 ? input.size.width : 120;
  const height = input.size?.height && input.size.height > 0 ? input.size.height : 40;
  return {
    id: createId("instance"),
    type: "rect",
    parentId: null,
    children: [],
    name: input.name,
    x: roundPixel(Math.max(0, (input.canvas.width - width) / 2)),
    y: roundPixel(Math.max(0, (input.canvas.height - height) / 2)),
    width,
    height,
    rotation: 0,
    styles: {},
    locked: false,
    visible: true,
    instanceOf: { componentId: input.componentId, variantId: input.variantId },
  };
}
