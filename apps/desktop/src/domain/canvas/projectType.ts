// The device/target a project renders for. A pure value type; it lives in the
// domain layer so the pure canvas-document helpers (htmlScene) can size frames
// without importing from `lib/` (DOM-1). `@/lib/data/types` re-exports it, so its
// many existing importers are unaffected.
export type ProjectType = "desktop" | "tablet" | "mobile";
