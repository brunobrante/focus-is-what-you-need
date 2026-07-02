import { useSyncExternalStore } from "react";
import { getSaveStatus, subscribeSaveStatus } from "@/application/persistence/saveStatusStore";

/**
 * A quiet, always-mounted indicator that surfaces a stuck save queue (M1).
 * Hidden while saves are healthy (idle / saving / retrying); shown only once the
 * queue has exhausted its retries and entered "error", where staying silent
 * would let the user keep editing believing their work is persisted.
 */
export function SaveStatusIndicator() {
  const status = useSyncExternalStore(subscribeSaveStatus, getSaveStatus, getSaveStatus);
  if (status !== "error") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 right-3 z-[9999] flex items-center gap-2 rounded-md border border-[#c14545] bg-[#c14545] px-3 py-2 text-[12px] font-medium text-white shadow-lg"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white/90" />
      Changes aren’t saving — retrying…
    </div>
  );
}
