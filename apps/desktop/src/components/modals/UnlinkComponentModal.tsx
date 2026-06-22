import { useEffect, useState } from "react";

import { Modal, ModalHeader, ModalBody } from "@/components/modals/Modal";
import { Switch } from "@/components/modals/appSettings/Switch";
import { LINKED_INSTANCE_COLOR } from "@/lib/ui/linkedColor";

export type UnlinkItem = {
  /** Stable per-occurrence key (ownerId:nodeId). */
  key: string;
  /** The variant scene the instance lives in. */
  ownerId: string;
  /** The instance node id within that scene. */
  nodeId: string;
  /** Human label: "Screen/Component (version) — element name". */
  label: string;
};

export type UnlinkDecision = {
  ownerId: string;
  nodeId: string;
  action: "copy" | "delete";
};

/**
 * Confirmation for turning OFF a component's linkable state while instances exist.
 * Lists every placement; each row is a switch — ON = keep as an independent local
 * copy (detach), OFF = delete. Defaults to copy for every row.
 */
export function UnlinkComponentModal({
  open,
  componentName,
  items,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  componentName: string;
  items: UnlinkItem[];
  onCancel: () => void;
  onConfirm: (decisions: UnlinkDecision[]) => void;
}) {
  const [actions, setActions] = useState<Record<string, "copy" | "delete">>({});

  useEffect(() => {
    if (open) setActions(Object.fromEntries(items.map((i) => [i.key, "copy"])));
  }, [open, items]);

  const setAll = (action: "copy" | "delete") =>
    setActions(Object.fromEntries(items.map((i) => [i.key, action])));

  const copyCount = items.filter((i) => (actions[i.key] ?? "copy") === "copy").length;
  const deleteCount = items.length - copyCount;

  return (
    <Modal open={open} onClose={onCancel} ariaLabel={`Unlink ${componentName}`}>
      <ModalHeader
        title={`Unlink “${componentName}”`}
        subtitle={`${items.length} instance${items.length === 1 ? "" : "s"} use this component. Choose what happens to each, then confirm. Default keeps a local copy.`}
        onClose={onCancel}
      />
      <ModalBody>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11.5px] text-[var(--text-faint)]">
            {copyCount} copy · {deleteCount} delete
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setAll("copy")}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            >
              Copy all
            </button>
            <button
              type="button"
              onClick={() => setAll("delete")}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[rgba(255,80,80,0.45)] hover:text-[#ff8a8a]"
            >
              Delete all
            </button>
          </div>
        </div>

        <div className="flex max-h-[320px] flex-col divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
          {items.map((item) => {
            const action = actions[item.key] ?? "copy";
            return (
              <div key={item.key} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text)]" title={item.label}>
                  {item.label}
                </span>
                <span
                  className="w-[46px] shrink-0 text-right text-[11px] font-medium"
                  style={{ color: action === "copy" ? LINKED_INSTANCE_COLOR : "#ff8a8a" }}
                >
                  {action === "copy" ? "Copy" : "Delete"}
                </span>
                <Switch
                  checked={action === "copy"}
                  ariaLabel={`Keep a copy of ${item.label}`}
                  onChange={(checked) =>
                    setActions((prev) => ({ ...prev, [item.key]: checked ? "copy" : "delete" }))
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                items.map((i) => ({
                  ownerId: i.ownerId,
                  nodeId: i.nodeId,
                  action: actions[i.key] ?? "copy",
                })),
              )
            }
            className="rounded-lg bg-[var(--text)] px-3 py-1.5 text-[12px] font-medium text-[var(--bg)] transition-opacity hover:opacity-90"
          >
            Confirm & unlink
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}
