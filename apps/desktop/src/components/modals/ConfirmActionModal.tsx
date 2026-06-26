import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";

type OpenConfig = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};

export interface ConfirmActionModalHandle {
  open: (config: OpenConfig) => void;
  close: () => void;
}

// The modal supports two equivalent APIs:
//  - imperative: attach a ref and call `ref.open({...})` / `ref.close()`
//  - controlled: pass `open` + `title`/`message`/`onConfirm`/`onClose` as props
// Passing `open` switches it to controlled mode; otherwise it tracks its own state.
type ConfirmActionModalProps = {
  open?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  onClose?: () => void;
  onConfirm?: () => void | Promise<void>;
};

export const ConfirmActionModal = forwardRef<ConfirmActionModalHandle, ConfirmActionModalProps>(
  function ConfirmActionModal(props, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const configRef = useRef<OpenConfig | null>(null);

    useImperativeHandle(ref, () => ({
      open: (config) => {
        configRef.current = config;
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    const controlled = props.open !== undefined;
    const open = controlled ? Boolean(props.open) : isOpen;
    const config: OpenConfig | null = controlled
      ? {
          title: props.title ?? "",
          message: props.message ?? "",
          confirmLabel: props.confirmLabel,
          onConfirm: props.onConfirm ?? (() => {}),
        }
      : configRef.current;

    function handleClose() {
      if (controlled) props.onClose?.();
      else setIsOpen(false);
    }

    function handleConfirm() {
      handleClose();
      if (config) void config.onConfirm();
    }

    return (
      <Modal open={open} onClose={handleClose} ariaLabel={config?.title ?? ""}>
        <ModalHeader
          title={config?.title ?? ""}
          subtitle={config?.message ?? ""}
          onClose={handleClose}
        />
        <ModalBody>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#c14545] bg-[#c14545] px-3.5 text-[13px] font-medium text-white transition-colors hover:border-[#d95757] hover:bg-[#d95757]"
            >
              {config?.confirmLabel ?? "Delete"}
            </button>
          </div>
        </ModalBody>
      </Modal>
    );
  },
);
