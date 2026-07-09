import type { CanvasToolId } from "@/domain/canvas/types";
import type {
  CanvasKeyCommandId,
  CanvasModifierCommandId,
} from "./types";

export type CanvasKeyCommandDefinition = {
  id: CanvasKeyCommandId;
  label: string;
  group: string;
  type: "key";
  toolbarToolId?: CanvasToolId;
};

export type CanvasModifierCommandDefinition = {
  id: CanvasModifierCommandId;
  label: string;
  group: string;
  type: "modifier";
};

export type CanvasCommandDefinition =
  | CanvasKeyCommandDefinition
  | CanvasModifierCommandDefinition;

export const CANVAS_TOOL_COMMANDS: Record<CanvasToolId, CanvasKeyCommandId> = {
  cursor: "canvas.tool.cursor",
  hand: "canvas.tool.hand",
  scale: "canvas.tool.scale",
  wrapper: "canvas.tool.wrapper",
  rectangle: "canvas.tool.rectangle",
  ellipse: "canvas.tool.ellipse",
  line: "canvas.tool.line",
  arrow: "canvas.tool.arrow",
  polygon: "canvas.tool.polygon",
  star: "canvas.tool.star",
  pen: "canvas.tool.pen",
  pencil: "canvas.tool.pencil",
  text: "canvas.tool.text",
  image: "canvas.tool.image",
  svg: "canvas.tool.svg",
  actions: "canvas.tool.actions",
};

export const TOOL_BY_CANVAS_COMMAND: Partial<Record<CanvasKeyCommandId, CanvasToolId>> =
  Object.fromEntries(
    Object.entries(CANVAS_TOOL_COMMANDS).map(([tool, command]) => [command, tool]),
  ) as Partial<Record<CanvasKeyCommandId, CanvasToolId>>;

export const CANVAS_COMMAND_GROUPS: Array<{
  label: string;
  commands: CanvasCommandDefinition[];
}> = [
  {
    label: "Canvas",
    commands: [
      { id: "canvas.history.undo", label: "Undo", group: "Canvas", type: "key" },
      { id: "canvas.history.redo", label: "Redo", group: "Canvas", type: "key" },
      { id: "canvas.clipboard.copy", label: "Copy", group: "Canvas", type: "key" },
      { id: "canvas.clipboard.paste", label: "Paste", group: "Canvas", type: "key" },
      { id: "canvas.clipboard.cut", label: "Cut", group: "Canvas", type: "key" },
      { id: "canvas.selection.duplicate", label: "Duplicate", group: "Canvas", type: "key" },
      { id: "canvas.selection.selectAll", label: "Select all", group: "Canvas", type: "key" },
      { id: "canvas.selection.delete", label: "Delete selection", group: "Canvas", type: "key" },
      { id: "canvas.selection.cancel", label: "Cancel or select tool", group: "Canvas", type: "key" },
      { id: "canvas.selection.ungroup", label: "Ungroup", group: "Canvas", type: "key" },
      { id: "canvas.nudge.up", label: "Nudge up (Shift = ×10)", group: "Canvas", type: "key" },
      { id: "canvas.nudge.down", label: "Nudge down (Shift = ×10)", group: "Canvas", type: "key" },
      { id: "canvas.nudge.left", label: "Nudge left (Shift = ×10)", group: "Canvas", type: "key" },
      { id: "canvas.nudge.right", label: "Nudge right (Shift = ×10)", group: "Canvas", type: "key" },
      { id: "canvas.component.openSelection", label: "Open selected component", group: "Canvas", type: "key" },
      { id: "canvas.component.backToParent", label: "Back to parent component", group: "Canvas", type: "key" },
      { id: "canvas.overlay.toggleScreen", label: "Toggle screen overlay", group: "Canvas", type: "key" },
    ],
  },
  {
    label: "Zoom",
    commands: [
      { id: "canvas.viewport.zoomIn", label: "Zoom in", group: "Zoom", type: "key" },
      { id: "canvas.viewport.zoomOut", label: "Zoom out", group: "Zoom", type: "key" },
      { id: "canvas.viewport.zoomReset", label: "Zoom 100%", group: "Zoom", type: "key" },
      { id: "canvas.viewport.zoomToSelection", label: "Zoom to selection", group: "Zoom", type: "key" },
      { id: "canvas.viewport.pan", label: "Temporary pan", group: "Zoom", type: "key" },
    ],
  },
  {
    label: "Tools",
    commands: [
      { id: "canvas.tool.cursor", label: "Select tool", group: "Tools", type: "key", toolbarToolId: "cursor" },
      { id: "canvas.tool.hand", label: "Hand tool", group: "Tools", type: "key", toolbarToolId: "hand" },
      { id: "canvas.tool.scale", label: "Scale tool", group: "Tools", type: "key", toolbarToolId: "scale" },
      { id: "canvas.tool.wrapper", label: "Wrapper tool", group: "Tools", type: "key", toolbarToolId: "wrapper" },
      { id: "canvas.tool.rectangle", label: "Rectangle tool", group: "Tools", type: "key", toolbarToolId: "rectangle" },
      { id: "canvas.tool.ellipse", label: "Ellipse tool", group: "Tools", type: "key", toolbarToolId: "ellipse" },
      { id: "canvas.tool.line", label: "Line tool", group: "Tools", type: "key", toolbarToolId: "line" },
      { id: "canvas.tool.arrow", label: "Arrow tool", group: "Tools", type: "key", toolbarToolId: "arrow" },
      { id: "canvas.tool.polygon", label: "Polygon tool", group: "Tools", type: "key", toolbarToolId: "polygon" },
      { id: "canvas.tool.star", label: "Star tool", group: "Tools", type: "key", toolbarToolId: "star" },
      { id: "canvas.tool.pen", label: "Pen tool", group: "Tools", type: "key", toolbarToolId: "pen" },
      { id: "canvas.tool.pencil", label: "Pencil tool", group: "Tools", type: "key", toolbarToolId: "pencil" },
      { id: "canvas.tool.text", label: "Text tool", group: "Tools", type: "key", toolbarToolId: "text" },
      { id: "canvas.tool.image", label: "Image tool", group: "Tools", type: "key", toolbarToolId: "image" },
      { id: "canvas.tool.svg", label: "SVG icon tool", group: "Tools", type: "key", toolbarToolId: "svg" },
      { id: "canvas.tool.actions", label: "Actions menu", group: "Tools", type: "key", toolbarToolId: "actions" },
    ],
  },
  {
    label: "Modifiers",
    commands: [
      { id: "canvas.drag.reparent", label: "Insert into parent while dragging", group: "Modifiers", type: "modifier" },
      { id: "canvas.selection.contextToolbar", label: "Show context toolbar", group: "Modifiers", type: "modifier" },
      { id: "canvas.overlay.parentDistances", label: "Show parent distances", group: "Modifiers", type: "modifier" },
      { id: "canvas.resize.fromCenter", label: "Resize from center", group: "Modifiers", type: "modifier" },
      { id: "canvas.transform.constrainAspect", label: "Constrain aspect while drawing or resizing", group: "Modifiers", type: "modifier" },
      { id: "canvas.rotate.snap", label: "Snap rotation", group: "Modifiers", type: "modifier" },
      { id: "canvas.selection.addToClick", label: "Add to selection on click", group: "Modifiers", type: "modifier" },
      { id: "canvas.vector.removeAnchor", label: "Remove anchor point", group: "Modifiers", type: "modifier" },
      { id: "canvas.radius.perCorner", label: "Round a single corner", group: "Modifiers", type: "modifier" },
      { id: "canvas.drag.duplicate", label: "Duplicate while dragging", group: "Modifiers", type: "modifier" },
    ],
  },
];
