import { useState } from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import type { WorkspaceCard } from "@/application/home/useHome";

type DeleteMode = "keep" | "delete";

type Props = {
  open: boolean;
  card: WorkspaceCard | null;
  onClose: () => void;
  onConfirm: (keepProjects: boolean) => void | Promise<void>;
};

export function DeleteWorkspaceModal({ open, card, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<DeleteMode>("keep");

  if (!card) return null;

  const { workspace, projectCount } = card;

  function handleConfirm() {
    onClose();
    void onConfirm(mode === "keep");
  }

  return (
    <Modal open={open} onClose={onClose} ariaLabel="Delete workspace">
      <ModalHeader
        title={`Delete "${workspace.name}"?`}
        subtitle="This action cannot be undone."
        onClose={onClose}
      />
      <ModalBody>
        {projectCount > 0 ? (
          <div className="mb-4 space-y-2">
            <p className="text-[13px] text-[var(--text-muted)]">
              This workspace contains{" "}
              <strong className="text-[var(--text)]">
                {projectCount} {projectCount === 1 ? "project" : "projects"}
              </strong>
              . Choose what to do with them:
            </p>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              style={{
                borderColor: mode === "keep" ? "var(--border-strong)" : "var(--border)",
              }}
            >
              <input
                type="radio"
                name="delete-mode"
                value="keep"
                checked={mode === "keep"}
                onChange={() => setMode("keep")}
                className="mt-0.5 shrink-0 cursor-pointer"
              />
              <div>
                <div className="text-[13px] font-medium text-[var(--text)]">Move projects out</div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  Projects stay in your library, no longer inside this workspace.
                </div>
              </div>
            </label>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              style={{
                borderColor: mode === "delete" ? "#c14545" : "var(--border)",
              }}
            >
              <input
                type="radio"
                name="delete-mode"
                value="delete"
                checked={mode === "delete"}
                onChange={() => setMode("delete")}
                className="mt-0.5 shrink-0 cursor-pointer"
              />
              <div>
                <div className="text-[13px] font-medium text-[#ff7373]">Delete all projects</div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  All {projectCount} {projectCount === 1 ? "project" : "projects"} and their
                  screens will be permanently deleted.
                </div>
              </div>
            </label>
          </div>
        ) : (
          <p className="mb-4 text-[13px] text-[var(--text-muted)]">
            This workspace has no projects. It will be permanently removed.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#c14545] bg-[#c14545] px-3.5 text-[13px] font-medium text-white transition-colors hover:border-[#d95757] hover:bg-[#d95757]"
          >
            Delete workspace
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}
