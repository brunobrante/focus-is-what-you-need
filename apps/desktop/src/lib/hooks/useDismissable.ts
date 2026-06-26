import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared "dismiss on outside pointerdown or Escape" behavior for popovers /
 * dropdown menus. While `enabled`, a `pointerdown` outside every ref in `refs`
 * (or an Escape keypress) calls `onDismiss`.
 *
 * `onDismiss` and `refs` are read through refs, so the listeners are only
 * (un)subscribed when `enabled` (or an option) toggles — callers can pass inline
 * closures and array literals without churning the effect.
 *
 * Options:
 *  - `capture` (default `false`): use the capture phase. Needed on canvas
 *    surfaces where an inner `pointerdown` handler may `stopPropagation`, which
 *    would otherwise keep a bubble-phase listener from ever seeing the outside
 *    click and closing the popover.
 *  - `escape` (default `true`): also dismiss on the Escape key. Set `false` for
 *    popovers that intentionally ignore Escape.
 */
export function useDismissable(
  enabled: boolean,
  onDismiss: () => void,
  refs: Array<RefObject<HTMLElement | null>>,
  options?: { capture?: boolean; escape?: boolean },
): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  const capture = options?.capture ?? false;
  const escape = options?.escape ?? true;

  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refsRef.current.every((ref) => !ref.current?.contains(target))) {
        onDismissRef.current();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissRef.current();
    };
    window.addEventListener("pointerdown", onPointerDown, capture);
    if (escape) window.addEventListener("keydown", onKeyDown, capture);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, capture);
      if (escape) window.removeEventListener("keydown", onKeyDown, capture);
    };
  }, [enabled, capture, escape]);
}
