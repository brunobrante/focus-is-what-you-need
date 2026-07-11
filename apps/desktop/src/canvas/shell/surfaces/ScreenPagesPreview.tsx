import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useEditor } from "@/canvas/engine/store";
import { deleteElements, mutateElementShallow, shallowCloneDocument } from "@/canvas/engine/actions";
import { getContentAxis, getContentPages } from "@/canvas/engine/geometry";
import { ElementRenderer } from "@/canvas/stage/ElementRenderer";
import { ConfirmActionModal, type ConfirmActionModalHandle } from "@/components/modals/ConfirmActionModal";

// Preview rail for expanded screens. The frame on the canvas stays at its fixed
// device size (the window); this rail shows the whole scrollable content in
// miniature with a blue rectangle marking the visible window. Dragging (or
// wheeling over) the rail drives `contentScroll`, which slides the content
// inside the fixed frame. Vertical pages stack on the right edge; horizontal
// pages become a filmstrip along the top. View-only — nothing here is persisted.
const MINI_CROSS = 72;
const MAX_RAIL_LENGTH = 380;
// How long after the last document change the miniature re-renders. During a
// drag/draw gesture the document churns at 60Hz and the timer keeps resetting, so
// the mini scene only reconciles once the edit pauses — never mid-gesture.
const THUMB_SETTLE_MS = 200;

export function ScreenPagesPreview() {
  const { state, dispatch } = useEditor();
  const railRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const confirmRef = useRef<ConfirmActionModalHandle>(null);

  const pages = getContentPages(state.document);
  const horizontal = getContentAxis(state.document) === "horizontal";
  const deviceHeight = state.document.canvas.height;
  const deviceWidth = state.document.canvas.width;
  // Size of the device along the scroll axis (what one page spans) and across it.
  const axisSize = horizontal ? deviceWidth : deviceHeight;
  const crossSize = horizontal ? deviceHeight : deviceWidth;

  // One mini page keeps the device aspect with the CROSS side pinned to
  // MINI_CROSS; the whole rail shrinks if the stacked pages exceed the max length.
  const rawPageLength = (MINI_CROSS * axisSize) / Math.max(1, crossSize);
  const rawRailLength = pages * rawPageLength;
  const shrink = rawRailLength > MAX_RAIL_LENGTH ? MAX_RAIL_LENGTH / rawRailLength : 1;
  const cross = MINI_CROSS * shrink;
  const pageLength = rawPageLength * shrink;
  const railLength = rawRailLength * shrink;
  const railWidth = horizontal ? railLength : cross;
  const railHeight = horizontal ? cross : railLength;
  const miniScale = cross / Math.max(1, crossSize);

  const maxScroll = (pages - 1) * axisSize;
  // Defensive clamp: an undo can shrink the page count under the transient scroll.
  const contentScroll = Math.min(state.contentScroll, maxScroll);
  const windowStart = maxScroll > 0 ? (contentScroll / axisSize) * pageLength : 0;

  // Debounced snapshot of the document for the miniature. It is a LIVE render
  // (same ElementRenderer as the stage, scaled down via CSS transform), not a
  // bitmap — WKWebView has no DOM-to-image path without foreignObject. Holding
  // the previous document reference while editing keeps the memoized mini scene
  // untouched through 60Hz transient frames; it reconciles once, on settle.
  const [thumbDocument, setThumbDocument] = useState(state.document);
  useEffect(() => {
    if (state.document === thumbDocument) return;
    const timer = setTimeout(() => setThumbDocument(state.document), THUMB_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [state.document, thumbDocument]);

  // Which page band a root element belongs to, by its center along the scroll
  // axis. Children move with their parents, so bands are decided by roots only.
  const bandOf = (id: string): number => {
    const el = state.document.elements[id];
    if (!el) return 0;
    const center = horizontal ? el.x + el.width / 2 : el.y + el.height / 2;
    return Math.max(0, Math.min(pages - 1, Math.floor(center / axisSize)));
  };

  // Delete a page (never the first): root elements on that page are removed with
  // it, and everything on the pages beyond shifts back one device-size. The page
  // count lives on the document, so the count decrement, the deletions and the
  // shifts land in ONE commitDocument — a single undo restores all of it.
  const deletePage = (pageIndex: number) => {
    if (pageIndex === 0 || pages <= 1) return;
    const doc = state.document;
    const removedIds = doc.rootIds.filter((id) => bandOf(id) === pageIndex);
    const shiftedIds = doc.rootIds.filter((id) => bandOf(id) > pageIndex);
    let next = removedIds.length > 0 ? deleteElements(doc, removedIds) : shallowCloneDocument(doc);
    if (shiftedIds.length > 0) {
      next = removedIds.length > 0 ? shallowCloneDocument(next) : next;
      for (const id of shiftedIds) {
        const el = mutateElementShallow(next, id);
        if (!el) continue;
        if (horizontal) el.x -= axisSize;
        else el.y -= axisSize;
      }
    }
    const nextPages = pages - 1;
    next.canvas = {
      ...next.canvas,
      contentPages: nextPages > 1 ? nextPages : undefined,
      contentAxis: nextPages > 1 ? next.canvas.contentAxis : undefined,
    };
    dispatch({ type: "commitDocument", beforeDocument: doc, document: next, selectedIds: [] });
    // Re-clamp the transient scroll against the shorter content.
    dispatch({ type: "setContentScroll", scroll: state.contentScroll });
  };

  // Deleting a page that still has elements is destructive — confirm first.
  // Empty pages go straight away.
  const requestDeletePage = (pageIndex: number) => {
    const count = state.document.rootIds.filter((id) => bandOf(id) === pageIndex).length;
    if (count === 0) {
      deletePage(pageIndex);
      return;
    }
    confirmRef.current?.open({
      title: `Delete page ${pageIndex + 1}?`,
      message: `${count} element${count === 1 ? "" : "s"} on this page will be deleted. Later pages shift back.`,
      confirmLabel: "Delete page",
      onConfirm: () => deletePage(pageIndex),
    });
  };

  // All hooks must run unconditionally — the early return for the collapsed
  // (single-page) state lives below the last hook.
  const scrubTo = useCallback(
    (clientX: number, clientY: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const along = horizontal ? clientX - rect.left : clientY - rect.top;
      const scroll = ((along - pageLength / 2) / Math.max(1, pageLength)) * axisSize;
      dispatch({ type: "setContentScroll", scroll });
    },
    [dispatch, pageLength, axisSize, horizontal],
  );

  if (pages <= 1) return null;

  return (
    <div
      className={
        horizontal
          ? "absolute left-1/2 top-3 z-[20] flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl border border-[#2C2C2C] bg-[#1A1A1A]/95 p-2 backdrop-blur-sm"
          : "absolute right-3 top-1/2 z-[20] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-xl border border-[#2C2C2C] bg-[#1A1A1A]/95 p-2 backdrop-blur-sm"
      }
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.5)" }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        dispatch({ type: "setContentScroll", scroll: state.contentScroll + delta });
      }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6E6E6E]">Páginas</span>
      <div
        ref={railRef}
        className="relative cursor-pointer select-none overflow-hidden rounded-[3px]"
        style={{ width: railWidth, height: railHeight }}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          scrubTo(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) scrubTo(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        {/* Live miniature of the whole content — the real scene renderer scaled
            down with a CSS transform, non-interactive (`preview`), fed by the
            debounced document. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0"
          style={{
            width: horizontal ? deviceWidth * pages : deviceWidth,
            height: horizontal ? deviceHeight : deviceHeight * pages,
            background: state.document.canvas.background || "#ffffff",
            transform: `scale(${miniScale})`,
            transformOrigin: "0 0",
          }}
        >
          {thumbDocument.rootIds.map((id) => (
            <ElementRenderer key={id} id={id} document={thumbDocument} preview renderScale={1} />
          ))}
        </div>
        {/* Per-page overlays: separator border, page number, delete on hover. */}
        {Array.from({ length: pages }).map((_, index) => (
          <div
            key={index}
            className="group absolute rounded-[3px]"
            style={{
              top: horizontal ? 0 : index * pageLength,
              left: horizontal ? index * pageLength : 0,
              width: horizontal ? pageLength : cross,
              height: horizontal ? cross : pageLength,
              border: "1px solid rgba(0,0,0,0.18)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            <span className="absolute bottom-[2px] left-[2px] rounded-[2px] bg-[#1A1A1A]/80 px-[3px] text-[8px] font-medium leading-[12px] text-[#B0B0B0]">
              {index + 1}
            </span>
            {/* The first page is the screen itself — it can never be deleted. */}
            {index > 0 && (
              <button
                type="button"
                aria-label={`Delete page ${index + 1}`}
                className="absolute right-[2px] top-[2px] hidden h-[14px] w-[14px] cursor-pointer place-items-center rounded-[3px] bg-[#1A1A1A]/90 text-[#CFCFCF] hover:bg-[#3A1D1D] hover:text-[#E58A8A] group-hover:grid"
                onPointerDown={(event) => {
                  // Don't let the rail's scrub pointer-capture swallow the click.
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  requestDeletePage(index);
                }}
              >
                <X size={10} strokeWidth={2.2} />
              </button>
            )}
          </div>
        ))}
        {/* Blue window indicator — the slice currently visible in the fixed frame. */}
        <div
          className="pointer-events-none absolute rounded-[3px] border-[1.5px] border-[#0D99FF]"
          style={{
            top: horizontal ? 0 : windowStart,
            left: horizontal ? windowStart : 0,
            width: horizontal ? pageLength : cross,
            height: horizontal ? cross : pageLength,
            background: "rgba(13,153,255,0.14)",
          }}
        />
      </div>
      {/* Portal: the rail's backdrop-blur makes this container the containing
          block for fixed-position descendants, which would trap the fullscreen
          modal inside the tiny rail — render it on <body> instead. */}
      {createPortal(<ConfirmActionModal ref={confirmRef} />, document.body)}
    </div>
  );
}
