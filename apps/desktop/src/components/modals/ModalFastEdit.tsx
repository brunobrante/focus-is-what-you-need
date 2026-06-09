import { useRef } from "react";
import { FastEditModal, type FastEditModalHandle, type FastEditConfig } from "@/components/screen/FastEditModal";
import { IconFastEdit } from "@/components/icons";

export type { FastEditConfig };

export function ModalFastEdit({ config }: { config: FastEditConfig }) {
  const ref = useRef<FastEditModalHandle>(null);

  return (
    <>
      <button
        type="button"
        aria-label="Fast edit"
        onClick={() => ref.current?.open(config)}
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text)]"
      >
        <IconFastEdit size={13} strokeWidth={1.7} />
      </button>
      <FastEditModal ref={ref} />
    </>
  );
}
