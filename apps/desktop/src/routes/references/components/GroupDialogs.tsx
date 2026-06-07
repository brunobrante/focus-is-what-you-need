import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { GroupDialogState } from "../types";
import { SmallButton } from "./ui";

export function ReferenceGroupModal({
  state,
  onCancel,
  onSave,
}: {
  state: GroupDialogState;
  onCancel: () => void;
  onSave: (input: { name: string; description?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!state) return;
    setName(state.mode === "edit" ? state.group.name : "");
    setDescription(state.mode === "edit" ? state.group.description ?? "" : "");
  }, [state]);

  if (!state) return null;

  const trimmedName = name.trim();
  const title = state.mode === "edit" ? "Edit group" : "Create group";

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      className="fixed inset-0 z-[85] flex items-center justify-center bg-[rgba(0,0,0,0.65)] p-8 backdrop-blur-[6px]"
    >
      <div
        role="document"
        className="flex w-[min(440px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-[18px] py-3.5">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--text)]">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 p-[18px]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
              Name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mobile checkout project"
              className="h-[36px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context for this set of references..."
              rows={3}
              className="resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
          </label>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-[18px] py-3">
          <SmallButton type="button" onClick={onCancel}>
            Cancel
          </SmallButton>
          <SmallButton
            type="button"
            primary
            disabled={!trimmedName}
            onClick={() => onSave({ name: trimmedName, description: description.trim() || undefined })}
          >
            Save group
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

export function DeleteGroupModal({
  group,
  onCancel,
  onConfirm,
}: {
  group: ReferenceGroup | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!group) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Delete group"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(0,0,0,0.68)] p-8 backdrop-blur-[6px]"
    >
      <div
        role="document"
        className="flex w-[min(420px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="border-b border-[var(--border)] px-[18px] py-4">
          <h3 className="m-0 text-[15px] font-semibold text-[var(--text)]">Delete group?</h3>
          <p className="m-0 mt-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">
            This removes the group "{group.name}" but keeps every screen, stack file, and cut.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-[18px] py-3">
          <SmallButton type="button" onClick={onCancel}>
            Cancel
          </SmallButton>
          <SmallButton type="button" onClick={onConfirm}>
            Delete group
          </SmallButton>
        </div>
      </div>
    </div>
  );
}
