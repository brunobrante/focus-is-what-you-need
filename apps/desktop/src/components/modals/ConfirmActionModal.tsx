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

export const ConfirmActionModal = forwardRef<ConfirmActionModalHandle>(
  function ConfirmActionModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const configRef = useRef<OpenConfig | null>(null);

    useImperativeHandle(ref, () => ({
      open: (config) => {
        configRef.current = config;
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    function handleClose() {
      setIsOpen(false);
    }

    const config = configRef.current;

    return (
      <Modal open={isOpen} onClose={handleClose} ariaLabel={config?.title ?? ""}>
        <ModalHeader
          title={config?.title ?? ""}
          subtitle={config?.message ?? ""}
          onClose={handleClose}
        />
        <ModalBody>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleClose} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (config) void config.onConfirm();
              }}
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
