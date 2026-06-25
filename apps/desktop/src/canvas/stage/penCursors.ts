// Context-swapped pen cursors (paper.design / Figma parity). All four art assets
// share the same nib tip, so they use one hotspot (≈ 4,4 in the 0 0 33 32 viewBox)
// — the tip never jumps between states. Assets live in `public/`, served at root.

export const PEN_CURSOR = "url(/cursor-pen.svg) 4 4, crosshair";
export const PEN_INSERT_CURSOR = "url(/cursor-pen-insert.svg) 4 4, crosshair";
export const PEN_REMOVE_CURSOR = "url(/cursor-pen-remove.svg) 4 4, crosshair";
export const PEN_SNAP_CURSOR = "url(/cursor-pen-snap.svg) 4 4, crosshair";
