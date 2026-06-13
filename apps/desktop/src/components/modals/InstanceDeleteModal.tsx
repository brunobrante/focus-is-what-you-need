import { Modal, ModalBody, ModalHeader } from "./Modal";

/**
 * Shown when deleting a master (screen or component) that still has linked instances
 * elsewhere. Offers the two safe-vs-destructive paths described in Versioning.md §9.
 */
export function InstanceDeleteModal({
  open,
  entityName,
  usageCount,
  onCancel,
  onDetachAll,
  onCascade,
}: {
  open: boolean;
  entityName: string;
  usageCount: number;
  onCancel: () => void;
  onDetachAll: () => void;
  onCascade: () => void;
}) {
  const places = usageCount === 1 ? "1 place" : `${usageCount} places`;
  return (
    <Modal open={open} onClose={onCancel} ariaLabel="Delete linked master">
      <ModalHeader
        title={`Delete "${entityName}"`}
        subtitle={`This is used as a linked instance in ${places}. Choose what happens to those instances.`}
        onClose={onCancel}
      />
      <ModalBody>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onDetachAll}
            className="flex w-full cursor-pointer flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-colors hover:border-[#9b6dff] hover:bg-[rgba(155,109,255,0.06)]"
          >
            <span className="text-[13px] font-medium text-[var(--text)]">Detach instances, then delete</span>
            <span className="text-[12px] text-[var(--text-muted)]">
              Each instance becomes an independent copy in place — nothing is lost elsewhere.
            </span>
          </button>
          <button
            type="button"
            onClick={onCascade}
            className="flex w-full cursor-pointer flex-col gap-1 rounded-md border border-[#c14545] bg-[rgba(193,69,69,0.06)] p-3 text-left transition-colors hover:border-[#d95757] hover:bg-[rgba(193,69,69,0.12)]"
          >
            <span className="text-[13px] font-medium text-[#e08585]">Delete everywhere (cascade)</span>
            <span className="text-[12px] text-[var(--text-muted)]">
              Removes the master and every instance of it across all screens and components.
            </span>
          </button>
          <div className="flex justify-end pt-1">
            <button type="button" onClick={onCancel} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
