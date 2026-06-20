import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared "dismiss on outside pointerdown or Escape" behavior for popovers /
 * dropdown menus. While `enabled`, a `pointerdown` outside every ref in `refs`
 * (or an Escape keypress) calls `onDismiss`.
 *
 * `onDismiss` and `refs` are read through refs, so the listeners are only
 * (un)subscribed when `enabled` toggles — callers can pass inline closures and
 * array literals without churning the effect.
 */
export function useDismissable(
  enabled: boolean,
  onDismiss: () => void,
  refs: Array<RefObject<HTMLElement | null>>,
): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const refsRef = useRef(refs);
  refsRef.current = refs;

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
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);
}
