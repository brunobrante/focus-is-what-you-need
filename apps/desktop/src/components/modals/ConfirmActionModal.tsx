import { Modal, ModalBody, ModalHeader } from "./Modal";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmActionModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onClose,
  onConfirm,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel={title}>
      <ModalHeader title={title} subtitle={message} onClose={onClose} />
      <ModalBody>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              void onConfirm();
            }}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#c14545] bg-[#c14545] px-3.5 text-[13px] font-medium text-white transition-colors hover:border-[#d95757] hover:bg-[#d95757]"
          >
            {confirmLabel}
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}
