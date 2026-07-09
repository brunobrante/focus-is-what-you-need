import CanvasKitInit, {
  type CanvasKit,
  type Font,
  type Paint,
  type Surface,
  type Typeface,
} from "canvaskit-wasm";
import geistLatinFontUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import canvasKitWasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";
import { SELECTION_COLOR, canvasRectToViewport } from "./canvasToolingRenderer";
import { PaintPool, createFillPaint } from "./skiaColor";
import {
  drawDropTarget,
  drawFilledRect,
  drawGhost,
  drawGuide,
  drawOutline,
  drawMeasureSegments,
  drawParentDistances,
  drawPathEdit,
  drawRadiusHandles,
  drawRadiusLabel,
  drawResizeHandles,
  drawSizeLabel,
} from "./skiaPrimitives";
import type {
  ToolingRenderFrame,
  ToolingRendererAdapter,
} from "./toolingRenderAdapter";

// Drag ghost for invisible elements: a soft blue drop shadow under a faint
// surface, framed with a dashed selection-blue outline.
const GHOST_SHADOW_COLOR = "rgba(13, 99, 168, 0.45)";
const GHOST_SHADOW_BLUR = 10;
const MARQUEE_FILL = "rgba(13, 153, 255, 0.08)";
const PARENT_DISTANCE_LABEL_FONT_SIZE = 11;

// Selection value tags (size + radius). These mirror, pixel-for-pixel, the DOM
// `.selection-size-tag` / `.radius-value-tag` rules in editor.css — geometry,
// 4px corner radius, white 700-weight 11px text, and the drop shadow.
const VALUE_LABEL_FONT_SIZE = 11;
// box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28). A CSS blur radius of 12px maps to a
// Gaussian standard deviation of 6 (blur / 2), which is Skia's blur sigma.
const VALUE_LABEL_SHADOW_COLOR = "rgba(0, 0, 0, 0.28)";
const VALUE_LABEL_SHADOW_SIGMA = 6;

let canvasKitPromise: Promise<CanvasKit> | null = null;

function framesEqual(a: ToolingRenderFrame, b: ToolingRenderFrame): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height &&
    a.outlines === b.outlines &&
    a.ghosts === b.ghosts &&
    a.resizeBox === b.resizeBox &&
    a.radiusHandlePositions === b.radiusHandlePositions &&
    a.guides === b.guides &&
    a.viewportTransform === b.viewportTransform &&
    a.marqueeRect === b.marqueeRect &&
    a.dropTarget === b.dropTarget &&
    a.parentDistances === b.parentDistances &&
    a.measureSegments === b.measureSegments &&
    a.sizeLabel === b.sizeLabel &&
    a.radiusLabel === b.radiusLabel &&
    a.pathEdit === b.pathEdit
  );
}

export class SkiaToolingAdapter implements ToolingRendererAdapter {
  private canvasKit: CanvasKit | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private host: HTMLElement | null = null;
  private surface: Surface | null = null;
  private paintPool: PaintPool | null = null;
  // Blurred shadow paint for drag ghosts. Built lazily (needs a MaskFilter, which
  // the PaintPool does not manage) and disposed on destroy.
  private ghostShadowPaint: Paint | null = null;
  // Blurred drop-shadow paint shared by the size/radius value tags. Built lazily
  // (needs a MaskFilter the PaintPool does not manage) and disposed on destroy.
  private valueLabelShadowPaint: Paint | null = null;
  // Bold 11px Geist font for the value tags, matching the DOM `font-weight: 700`.
  private valueLabelFont: Font | null = null;
  // 11px font for the parent-distance labels, cached like valueLabelFont so the
  // drag loop doesn't allocate + free a WASM Font every rendered frame.
  private parentDistanceFont: Font | null = null;
  private parentDistanceTypeface: Typeface | null = null;
  private ownsParentDistanceTypeface = false;
  private ready = false;
  private destroyed = false;
  private contextLost = false;
  private pendingFrame: ToolingRenderFrame | null = null;
  private lastRenderedFrame: ToolingRenderFrame | null = null;
  private size = { width: 0, height: 0, resolution: 1 };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.lastRenderedFrame = null;
    // Reset the cached backing size so ensureSurface rebuilds the surface and
    // canvas dimensions on restore even when the restored frame is the same size
    // — the lost context clobbered canvas.width/height.
    this.size = { width: 0, height: 0, resolution: 1 };
    this.disposeSurface();
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    if (this.pendingFrame) this.render(this.pendingFrame);
  };

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    this.destroyed = false;
    this.contextLost = false;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    // Positioned absolutely inside the tooling host (which is `absolute; inset: 0`
    // within the `position: relative` canvas-shell), so the canvas sits exactly at
    // the viewport-container origin and is laid out by the browser. A previous
    // `position: fixed` pinned it to the window and required re-measuring the host's
    // screen rect (getBoundingClientRect → rAF → React state) every frame; during a
    // continuous resize (e.g. dragging a split-pane divider) that measurement lagged
    // one frame behind the content, so the selection chrome trailed the element.
    // Staying in the layout makes it move in lockstep with the content for free.
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "1px";
    canvas.style.height = "1px";
    canvas.style.overflow = "hidden";
    canvas.style.contain = "content";
    canvas.style.pointerEvents = "none";
    canvas.style.display = "block";
    canvas.style.zIndex = "8";
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);

    host.appendChild(canvas);
    this.canvas = canvas;

    const canvasKit = await loadCanvasKit();
    if (this.destroyed) {
      // Race: destroyed mid-load. Route through the single cleanup path so the
      // context-loss listeners and the canvas are always removed/detached.
      this.destroy();
      return;
    }

    this.canvasKit = canvasKit;
    this.paintPool = new PaintPool(canvasKit);
    const loadedTypeface = await loadToolingTypeface(canvasKit);
    if (this.destroyed) {
      // The typeface isn't assigned to the field yet, so free it before destroy()
      // (which only knows about this.parentDistanceTypeface) tears down the rest.
      if (loadedTypeface.owned) loadedTypeface.typeface?.delete();
      this.destroy();
      return;
    }
    this.parentDistanceTypeface = loadedTypeface.typeface;
    this.ownsParentDistanceTypeface = loadedTypeface.owned;
    this.ready = true;
    if (this.pendingFrame) this.render(this.pendingFrame);
  }

  render(frame: ToolingRenderFrame): void {
    this.pendingFrame = frame;
    if (!this.ready || !this.canvasKit || !this.canvas || !this.paintPool || this.contextLost) return;
    if (this.lastRenderedFrame !== null && framesEqual(this.lastRenderedFrame, frame)) return;

    try {
      this.syncCanvasStyle(frame);
      const surface = this.ensureSurface(frame);
      if (!surface) return;

      const ck = this.canvasKit;
      const pool = this.paintPool;
      const canvas = surface.getCanvas();
      canvas.clear(ck.TRANSPARENT);
      canvas.save();
      canvas.scale(this.size.resolution, this.size.resolution);

      for (const ghost of frame.ghosts) {
        drawGhost(ck, canvas, pool, ghost, this.getGhostShadowPaint(ck));
      }

      for (const outline of frame.outlines) {
        drawOutline(ck, canvas, pool, outline);
      }

      if (frame.radiusHandlePositions) {
        drawRadiusHandles(ck, canvas, pool, frame.radiusHandlePositions);
      }

      if (frame.resizeBox) {
        drawResizeHandles(ck, canvas, pool, frame.resizeBox);
      }

      if (frame.pathEdit) {
        drawPathEdit(ck, canvas, pool, frame.pathEdit);
      }

      for (const guide of frame.guides) {
        drawGuide(ck, canvas, pool, guide, frame.viewportTransform);
      }

      if (frame.parentDistances) {
        drawParentDistances(ck, canvas, pool, frame.parentDistances, frame, this.getParentDistanceFont(ck));
      }

      if (frame.measureSegments) {
        drawMeasureSegments(ck, canvas, pool, frame.measureSegments, frame, this.getParentDistanceFont(ck));
      }

      if (frame.marqueeRect) {
        const rect = canvasRectToViewport(frame.marqueeRect, frame.viewportTransform);
        drawFilledRect(ck, canvas, pool, rect, MARQUEE_FILL);
        drawOutline(ck, canvas, pool, { rect, color: SELECTION_COLOR });
      }

      if (frame.dropTarget) {
        drawDropTarget(ck, canvas, pool, frame.dropTarget);
      }

      // Value tags paint last so they sit above every other piece of chrome,
      // matching the DOM tags' z-index 9 (the canvas chrome was z-index 8).
      if (frame.sizeLabel) {
        drawSizeLabel(
          ck,
          canvas,
          pool,
          frame.sizeLabel,
          this.getValueLabelFont(ck),
          this.getValueLabelShadowPaint(ck),
        );
      }

      if (frame.radiusLabel) {
        drawRadiusLabel(
          ck,
          canvas,
          pool,
          frame.radiusLabel,
          this.getValueLabelFont(ck),
          this.getValueLabelShadowPaint(ck),
        );
      }

      canvas.restore();
      surface.flush();
      this.lastRenderedFrame = frame;
    } catch (error) {
      if (isContextLossError(error)) {
        this.contextLost = true;
        this.disposeSurface();
        return;
      }
      throw error;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    this.pendingFrame = null;
    this.lastRenderedFrame = null;
    this.contextLost = false;
    this.disposeSurface();
    this.paintPool?.dispose();
    this.paintPool = null;
    this.ghostShadowPaint?.delete();
    this.ghostShadowPaint = null;
    this.valueLabelShadowPaint?.delete();
    this.valueLabelShadowPaint = null;
    this.valueLabelFont?.delete();
    this.valueLabelFont = null;
    this.parentDistanceFont?.delete();
    this.parentDistanceFont = null;
    if (this.ownsParentDistanceTypeface) this.parentDistanceTypeface?.delete();
    this.parentDistanceTypeface = null;
    this.ownsParentDistanceTypeface = false;
    // Remove listeners before losing the context so handleContextLost does not
    // fire re-entrantly during the loseContext() call below.
    this.canvas?.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas?.removeEventListener("webglcontextrestored", this.handleContextRestored);
    // Proactively free the WebGL context slot so the browser can reallocate it
    // immediately rather than waiting for GC after the canvas leaves the DOM.
    if (this.canvas) {
      try {
        const gl = this.canvas.getContext("webgl2");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        // Ignore — context may already be lost or WebGL unavailable.
      }
    }
    detachCanvas(this.canvas);
    this.canvas = null;
    this.canvasKit = null;
    this.host = null;
    this.size = { width: 0, height: 0, resolution: 1 };
  }

  private getGhostShadowPaint(ck: CanvasKit): Paint {
    if (!this.ghostShadowPaint) {
      const paint = createFillPaint(ck, GHOST_SHADOW_COLOR);
      paint.setMaskFilter(ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, GHOST_SHADOW_BLUR, false));
      this.ghostShadowPaint = paint;
    }
    return this.ghostShadowPaint;
  }

  private getValueLabelShadowPaint(ck: CanvasKit): Paint {
    if (!this.valueLabelShadowPaint) {
      const paint = createFillPaint(ck, VALUE_LABEL_SHADOW_COLOR);
      paint.setMaskFilter(
        ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, VALUE_LABEL_SHADOW_SIGMA, false),
      );
      this.valueLabelShadowPaint = paint;
    }
    return this.valueLabelShadowPaint;
  }

  private getParentDistanceFont(ck: CanvasKit): Font {
    if (!this.parentDistanceFont) {
      const font = new ck.Font(
        this.parentDistanceTypeface ?? ck.Typeface.GetDefault(),
        PARENT_DISTANCE_LABEL_FONT_SIZE,
      );
      font.setSubpixel(true);
      this.parentDistanceFont = font;
    }
    return this.parentDistanceFont;
  }

  private getValueLabelFont(ck: CanvasKit): Font {
    if (!this.valueLabelFont) {
      const font = new ck.Font(
        this.parentDistanceTypeface ?? ck.Typeface.GetDefault(),
        VALUE_LABEL_FONT_SIZE,
      );
      // Geist ships as a single variable typeface here, so synthesize the DOM's
      // 700 weight rather than loading a separate bold face.
      font.setEmbolden(true);
      font.setSubpixel(true);
      font.setEdging(ck.FontEdging.AntiAlias);
      this.valueLabelFont = font;
    }
    return this.valueLabelFont;
  }

  private ensureSurface(frame: ToolingRenderFrame): Surface | null {
    if (!this.canvasKit || !this.canvas) return null;

    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const resolution = getResolution();
    const backingWidth = Math.max(1, Math.ceil(width * resolution));
    const backingHeight = Math.max(1, Math.ceil(height * resolution));
    const sizeChanged =
      Math.abs(width - this.size.width) > 0.01 ||
      Math.abs(height - this.size.height) > 0.01 ||
      Math.abs(resolution - this.size.resolution) > 0.01;

    if (!this.surface || sizeChanged) {
      this.disposeSurface();
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
      this.surface = this.createSurface();
      this.size = { width, height, resolution };
    }

    return this.surface;
  }

  private syncCanvasStyle(frame: ToolingRenderFrame): void {
    if (!this.canvas) return;
    // The canvas is `position: absolute` at the host origin (left/top stay 0, set at
    // mount), so only its size tracks the frame. The drawing uses container-local
    // coordinates, so `frame.left`/`frame.top` (the host's screen rect) are no longer
    // needed to place it — that decoupling is what fixes the resize desync.
    this.canvas.style.width = `${Math.max(1, frame.width)}px`;
    this.canvas.style.height = `${Math.max(1, frame.height)}px`;
  }

  private createSurface(): Surface | null {
    if (!this.canvasKit || !this.canvas) return null;

    // Pre-request the WebGL context with optimal flags. The browser returns the
    // same context object on repeated getContext calls for a given canvas, so
    // CanvasKit's MakeWebGLCanvasSurface will inherit these attributes.
    // - depth:false    — Skia does not need a depth buffer
    // - stencil:true   — Skia uses stencil for clipping
    // - desynchronized:true — lower-latency present path where supported
    // - powerPreference — prefer discrete GPU on multi-GPU machines
    // - preserveDrawingBuffer omitted (defaults to false) — avoids extra copy
    try {
      this.canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: true,
        desynchronized: true,
        powerPreference: "high-performance",
      });
    } catch {
      // Ignore — MakeWebGLCanvasSurface will still attempt its own getContext.
    }

    try {
      const surface = this.canvasKit.MakeWebGLCanvasSurface(this.canvas, undefined, {
        alpha: 1,
        antialias: 0,
        premultipliedAlpha: 1,
      });
      if (surface) return surface;
    } catch (error) {
      if (!isContextLossError(error)) throw error;
      this.contextLost = true;
      return null;
    }

    return this.canvasKit.MakeSWCanvasSurface(this.canvas);
  }

  private disposeSurface(): void {
    try {
      this.surface?.dispose();
    } catch {
      // A lost WebGL context can make CanvasKit disposal fail after the browser
      // has already released the backing resources.
    }
    this.surface = null;
  }
}

export function createSkiaToolingAdapter(): ToolingRendererAdapter {
  return new SkiaToolingAdapter();
}

function loadCanvasKit(): Promise<CanvasKit> {
  canvasKitPromise ??= CanvasKitInit({
    locateFile: (file) => (file.endsWith(".wasm") ? canvasKitWasmUrl : file),
  });
  return canvasKitPromise;
}

async function loadToolingTypeface(
  ck: CanvasKit,
): Promise<{ typeface: Typeface | null; owned: boolean }> {
  try {
    const response = await fetch(geistLatinFontUrl);
    if (response.ok) {
      const typeface = ck.Typeface.MakeTypefaceFromData(await response.arrayBuffer());
      if (typeface) return { typeface, owned: true };
    }
  } catch {
    // Fall back to CanvasKit's compiled default below. The adapter still renders,
    // but bundled Geist is the primary tooling font.
  }

  return { typeface: ck.Typeface.GetDefault(), owned: false };
}

function getResolution(): number {
  return globalThis.devicePixelRatio || 1;
}

function detachCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas?.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
}

function isContextLossError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /context.*lost|isContextLost|webgl/i.test(message);
}
