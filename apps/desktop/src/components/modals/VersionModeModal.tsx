import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";

export type VersionMode = "linked" | "copy";

type OpenConfig = {
  title?: string;
  message?: string;
  onSelect: (mode: VersionMode) => void | Promise<void>;
};

export interface VersionModeModalHandle {
  open: (config: OpenConfig) => void;
  close: () => void;
}

const OPTION_CLASS =
  "flex w-full cursor-pointer flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-colors hover:border-[var(--accent,#9b6dff)] hover:bg-[rgba(155,109,255,0.06)]";

/**
 * "Linked or Copy" chooser shown before creating a new version. Linked keeps child
 * components referencing their originals; Copy makes a fully independent duplicate.
 */
export const VersionModeModal = forwardRef<VersionModeModalHandle>(
  function VersionModeModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const configRef = useRef<OpenConfig | null>(null);

    useImperativeHandle(ref, () => ({
      open: (config) => {
        configRef.current = config;
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    const config = configRef.current;

    const choose = (mode: VersionMode) => {
      setIsOpen(false);
      if (config) void config.onSelect(mode);
    };

    return (
      <Modal open={isOpen} onClose={() => setIsOpen(false)} ariaLabel={config?.title ?? "New version"}>
        <ModalHeader
          title={config?.title ?? "New version"}
          subtitle={config?.message ?? "How should child components behave in the new version?"}
          onClose={() => setIsOpen(false)}
        />
        <ModalBody>
          <div className="flex flex-col gap-2">
            <button type="button" className={OPTION_CLASS} onClick={() => choose("linked")}>
              <span className="text-[13px] font-medium text-[var(--text)]">Linked</span>
              <span className="text-[12px] text-[var(--text-muted)]">
                Child components stay linked to the originals — editing a master updates
                this version too. Only the frame and plain content are copied.
              </span>
            </button>
            <button type="button" className={OPTION_CLASS} onClick={() => choose("copy")}>
              <span className="text-[13px] font-medium text-[var(--text)]">Copy</span>
              <span className="text-[12px] text-[var(--text-muted)]">
                A fully independent duplicate with no links to anything.
              </span>
            </button>
          </div>
        </ModalBody>
      </Modal>
    );
  },
);
